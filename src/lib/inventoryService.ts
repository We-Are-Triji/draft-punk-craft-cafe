import { appEnv } from "@/lib/env";
import {
  classifyProductWithCatalogGemini,
  detectIngredientsWithGemini,
  detectStockInWithCatalogGemini,
  getGeminiUsageSnapshot,
  type ProductCatalogCandidate,
  type StockInCatalogIngredient,
} from "@/lib/geminiClient";
import {
  computeImageSemanticSignature,
  findSemanticCachedPayload,
  getCachedImageResult,
  hashImageFile,
  upsertCachedImageResult,
  upsertSemanticCachedPayload,
} from "@/lib/imageCache";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ConfidenceLevel,
  ConfirmDeductionResult,
  IngredientDeduction,
  InventoryItemRow,
  ScanDetectionResult,
  TransactionType,
} from "@/types/inventory";

const recipeTemplates: Record<string, IngredientDeduction[]> = {
  "iced latte": [
    {
      item_name: "Espresso Beans",
      category: "Coffee",
      quantity: 18,
      unit: "g",
    },
    {
      item_name: "Fresh Milk",
      category: "Dairy",
      quantity: 200,
      unit: "ml",
    },
    {
      item_name: "Ice Cubes",
      category: "Consumables",
      quantity: 8,
      unit: "pcs",
    },
  ],
  cappuccino: [
    {
      item_name: "Espresso Beans",
      category: "Coffee",
      quantity: 18,
      unit: "g",
    },
    {
      item_name: "Fresh Milk",
      category: "Dairy",
      quantity: 150,
      unit: "ml",
    },
  ],
  "matcha latte": [
    {
      item_name: "Matcha Powder",
      category: "Powders",
      quantity: 5,
      unit: "g",
    },
    {
      item_name: "Fresh Milk",
      category: "Dairy",
      quantity: 220,
      unit: "ml",
    },
  ],
};

const scansInFlightByHash = new Map<string, Promise<ScanDetectionResult>>();
const stockInScansInFlightByKey = new Map<string, Promise<ScanDetectionResult>>();
const stockOutScansInFlightByKey = new Map<
  string,
  Promise<StockOutProductScanResult>
>();

export type StockInCatalogEntry = StockInCatalogIngredient;

export type StockOutProductCatalogEntry = ProductCatalogCandidate;

export interface StockOutProductScanResult {
  image_hash: string;
  source: "cache" | "gemini";
  product_id: string;
  product_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
}

interface CachedStockInSemanticPayload {
  item_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
  ingredients_to_deduct: IngredientDeduction[];
}

interface CachedStockOutSemanticPayload {
  product_id: string;
  product_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
}

interface ConfirmScanDeductionInput {
  detection: ScanDetectionResult;
  imageFile?: File | null;
  transactionType?: TransactionType;
  notes?: string;
}

export interface ManualStockInEntry {
  item_name: string;
  category?: string;
  unit: string;
  quantity: number;
}

interface InventoryLookup {
  id: string;
  current_stock: number;
}

export interface InventoryItemMutationInput {
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  reorder_threshold: number;
}

function normalizeDishName(value: string): string {
  return value.trim().toLowerCase();
}

function toNumber(value: unknown, fallbackValue = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return parsed;
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return String((error as { code?: unknown }).code ?? "") === expectedCode;
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  return String((error as { message?: unknown }).message ?? "");
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

function buildCatalogFingerprint(parts: string[]): string {
  const normalized = parts
    .map((part) => normalizeKeyPart(part))
    .filter((part) => part.length > 0)
    .sort()
    .join("||");

  let hash = 2166136261;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${normalized.length}:${(hash >>> 0).toString(16)}`;
}

function getStockInSemanticScope(catalog: StockInCatalogEntry[]): string {
  const parts = catalog.map(
    (entry) => `${entry.name}|${entry.unit}|${entry.category}`
  );

  return `stock-in:${buildCatalogFingerprint(parts)}`;
}

function getStockOutSemanticScope(catalog: StockOutProductCatalogEntry[]): string {
  const parts = catalog.map(
    (entry) => `${entry.id}|${entry.name}|${entry.category}|${entry.description ?? ""}`
  );

  return `stock-out:${buildCatalogFingerprint(parts)}`;
}

function normalizePositiveQuantity(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Number(parsed.toFixed(3));
}

function isIngredientDeductionRecord(value: unknown): value is IngredientDeduction {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.item_name === "string" &&
    typeof record.category === "string" &&
    typeof record.unit === "string" &&
    Number(record.quantity) > 0
  );
}

function normalizeIngredientDeductions(
  value: unknown
): IngredientDeduction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: IngredientDeduction[] = [];

  for (const item of value) {
    if (!isIngredientDeductionRecord(item)) {
      continue;
    }

    normalized.push({
      item_name: item.item_name.trim(),
      category: item.category.trim() || "Recipe",
      unit: item.unit.trim() || "pcs",
      quantity: normalizePositiveQuantity(item.quantity, 0),
    });
  }

  return normalized.filter((item) => item.item_name && item.quantity > 0);
}

function normalizeStockInSemanticPayload(
  payload: unknown
): CachedStockInSemanticPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const itemName = String(record.item_name ?? "").trim();
  const unit = String(record.unit ?? "").trim() || "batch";
  const category = String(record.category ?? "").trim() || "Stock In";
  const ingredients = normalizeIngredientDeductions(record.ingredients_to_deduct);

  if (!itemName || ingredients.length === 0) {
    return null;
  }

  const confidenceRaw = String(record.confidence ?? "").toLowerCase();
  const confidence: ConfidenceLevel =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  return {
    item_name: itemName,
    category,
    confidence,
    quantity_estimate: normalizePositiveQuantity(record.quantity_estimate, 1),
    unit,
    ingredients_to_deduct: ingredients,
  };
}

function normalizeStockOutSemanticPayload(
  payload: unknown
): CachedStockOutSemanticPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const productId = String(record.product_id ?? "").trim();
  const productName = String(record.product_name ?? "").trim();

  if (!productId || !productName) {
    return null;
  }

  const confidenceRaw = String(record.confidence ?? "").toLowerCase();
  const confidence: ConfidenceLevel =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  return {
    product_id: productId,
    product_name: productName,
    category: String(record.category ?? "").trim() || "Uncategorized",
    confidence,
    quantity_estimate: normalizePositiveQuantity(record.quantity_estimate, 1),
    unit: String(record.unit ?? "").trim() || "serving",
  };
}

function normalizeStockInCatalog(
  catalog: StockInCatalogEntry[]
): StockInCatalogEntry[] {
  const deduped = new Map<string, StockInCatalogEntry>();

  for (const entry of catalog) {
    const name = entry.name.trim();

    if (!name) {
      continue;
    }

    const unit = entry.unit.trim() || "pcs";
    const category = entry.category.trim() || "Recipe";
    const key = `${normalizeKeyPart(name)}|${normalizeKeyPart(unit)}`;

    if (!deduped.has(key)) {
      deduped.set(key, {
        name,
        unit,
        category,
      });
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);

    if (byName !== 0) {
      return byName;
    }

    return left.unit.localeCompare(right.unit);
  });
}

function normalizeStockOutCatalog(
  catalog: StockOutProductCatalogEntry[]
): StockOutProductCatalogEntry[] {
  const deduped = new Map<string, StockOutProductCatalogEntry>();

  for (const entry of catalog) {
    const id = entry.id.trim();
    const name = entry.name.trim();

    if (!id || !name) {
      continue;
    }

    if (!deduped.has(id)) {
      deduped.set(id, {
        id,
        name,
        category: entry.category.trim() || "Uncategorized",
        description: entry.description?.trim() || null,
      });
    }
  }

  return [...deduped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function isMissingRelationError(error: unknown, relationName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedRelationName = relationName.toLowerCase();

  return (
    hasErrorCode(error, "42P01") ||
    (message.includes(normalizedRelationName) && message.includes("does not exist"))
  );
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedColumnName = columnName.toLowerCase();

  return (
    hasErrorCode(error, "42703") ||
    (message.includes(normalizedColumnName) && message.includes("does not exist"))
  );
}

function mapInventoryItemRow(row: Record<string, unknown>): InventoryItemRow {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    unit: String(row.unit),
    current_stock: toNumber(row.current_stock, 0),
    reorder_threshold: toNumber(row.reorder_threshold, 0),
    created_at: String(row.created_at),
  };
}

function normalizeInventoryMutationInput(
  input: InventoryItemMutationInput
): Record<string, unknown> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Ingredient name is required.");
  }

  const unit = input.unit.trim();

  if (!unit) {
    throw new Error("Ingredient unit is required.");
  }

  const currentStock = toNumber(input.current_stock, 0);
  const reorderThreshold = toNumber(input.reorder_threshold, 0);

  if (currentStock < 0) {
    throw new Error("Current stock cannot be negative.");
  }

  if (reorderThreshold < 0) {
    throw new Error("Reorder threshold cannot be negative.");
  }

  return {
    name,
    category: input.category.trim() || "Uncategorized",
    unit,
    current_stock: currentStock,
    reorder_threshold: reorderThreshold,
  };
}

export async function createInventoryItem(
  input: InventoryItemMutationInput
): Promise<InventoryItemRow> {
  const supabase = getSupabaseClient();
  const payload = normalizeInventoryMutationInput(input);

  const { data, error } = await supabase
    .from("inventory_items")
    .insert(payload)
    .select(
      "id, name, category, unit, current_stock, reorder_threshold, created_at"
    )
    .single();

  if (error) {
    throw new Error(`Failed to create ingredient: ${error.message}`);
  }

  return mapInventoryItemRow(data as Record<string, unknown>);
}

export async function updateInventoryItem(
  itemId: string,
  input: InventoryItemMutationInput
): Promise<InventoryItemRow> {
  const normalizedItemId = itemId.trim();

  if (!normalizedItemId) {
    throw new Error("Ingredient id is required.");
  }

  const supabase = getSupabaseClient();
  const payload = normalizeInventoryMutationInput(input);

  const { data, error } = await supabase
    .from("inventory_items")
    .update(payload)
    .eq("id", normalizedItemId)
    .select(
      "id, name, category, unit, current_stock, reorder_threshold, created_at"
    )
    .single();

  if (error) {
    throw new Error(`Failed to update ingredient: ${error.message}`);
  }

  return mapInventoryItemRow(data as Record<string, unknown>);
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  const normalizedItemId = itemId.trim();

  if (!normalizedItemId) {
    throw new Error("Ingredient id is required.");
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", normalizedItemId);

  if (error) {
    throw new Error(`Failed to delete ingredient: ${error.message}`);
  }
}

function buildFallbackIngredients(
  itemName: string,
  category: string,
  quantityEstimate: number,
  unit: string
): IngredientDeduction[] {
  return [
    {
      item_name: itemName,
      category,
      quantity: quantityEstimate,
      unit,
    },
  ];
}

function applyRecipeTemplate(
  itemName: string,
  quantityEstimate: number,
  ingredients: IngredientDeduction[]
): IngredientDeduction[] {
  const dishKey = normalizeDishName(itemName);
  const template = recipeTemplates[dishKey];

  if (!template) {
    return ingredients;
  }

  const servings = Math.max(1, Math.round(quantityEstimate));

  return template.map((ingredient) => ({
    ...ingredient,
    quantity: Number((ingredient.quantity * servings).toFixed(2)),
  }));
}

function shouldUseRecipeTemplate(
  dishName: string,
  ingredients: IngredientDeduction[]
): boolean {
  if (ingredients.length === 0) {
    return true;
  }

  if (ingredients.length > 1) {
    return false;
  }

  return normalizeDishName(ingredients[0].item_name) === normalizeDishName(dishName);
}

async function uploadImageForTransaction(
  imageFile: File | null | undefined,
  imageHash: string
): Promise<string | null> {
  if (!imageFile) {
    return null;
  }

  const extension = imageFile.name.split(".").pop() || "jpg";
  const storagePath = `scan-uploads/${new Date().toISOString().slice(0, 10)}/${imageHash}.${extension}`;
  const supabase = getSupabaseClient();

  const { error: uploadError } = await supabase.storage
    .from(appEnv.supabaseStorageBucket)
    .upload(storagePath, imageFile, {
      contentType: imageFile.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    console.warn(`Image upload skipped: ${uploadError.message}`);
    return null;
  }

  const { data } = supabase.storage
    .from(appEnv.supabaseStorageBucket)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

async function getOrCreateInventoryItem(
  ingredient: IngredientDeduction
): Promise<InventoryLookup> {
  const supabase = getSupabaseClient();
  const { data: exactItems, error: exactSelectError } = await supabase
    .from("inventory_items")
    .select("id, current_stock")
    .ilike("name", ingredient.item_name)
    .ilike("unit", ingredient.unit)
    .limit(1);

  if (exactSelectError) {
    throw new Error(`Inventory lookup failed: ${exactSelectError.message}`);
  }

  if (exactItems && exactItems.length > 0) {
    return {
      id: exactItems[0].id,
      current_stock: toNumber(exactItems[0].current_stock, 0),
    };
  }

  const { data: existingItems, error: selectError } = await supabase
    .from("inventory_items")
    .select("id, current_stock")
    .ilike("name", ingredient.item_name)
    .limit(1);

  if (selectError) {
    throw new Error(`Inventory lookup failed: ${selectError.message}`);
  }

  if (existingItems && existingItems.length > 0) {
    return {
      id: existingItems[0].id,
      current_stock: toNumber(existingItems[0].current_stock, 0),
    };
  }

  const { data: insertedItem, error: insertError } = await supabase
    .from("inventory_items")
    .insert({
      name: ingredient.item_name,
      category: ingredient.category,
      unit: ingredient.unit,
      current_stock: 0,
      reorder_threshold: 10,
    })
    .select("id, current_stock")
    .single();

  if (insertError) {
    throw new Error(`Inventory creation failed: ${insertError.message}`);
  }

  return {
    id: insertedItem.id,
    current_stock: toNumber(insertedItem.current_stock, 0),
  };
}

function toStockDelta(transactionType: TransactionType, quantity: number): number {
  if (transactionType === "stock_in") {
    return quantity;
  }

  return -quantity;
}

function buildScanTransactionNotes(
  dishOrItemName: string,
  notes: string | undefined
): string {
  const marker = `Detected dish/item: ${dishOrItemName}`;

  if (!notes || !notes.trim()) {
    return marker;
  }

  if (notes.includes("Detected dish/item:")) {
    return notes;
  }

  return `${notes}\n${marker}`;
}

function buildManualStockInNotes(notes: string | undefined): string {
  const trimmedNotes = notes?.trim();

  if (!trimmedNotes) {
    return "Manual stock-in confirmation";
  }

  return trimmedNotes;
}

export async function recordManualStockIn({
  entries,
  notes,
}: {
  entries: ManualStockInEntry[];
  notes?: string;
}): Promise<ConfirmDeductionResult> {
  const normalizedEntries = entries
    .map((entry) => ({
      item_name: entry.item_name.trim(),
      category: entry.category?.trim() || "Recipe",
      unit: entry.unit.trim(),
      quantity: toNumber(entry.quantity, 0),
    }))
    .filter(
      (entry) =>
        entry.item_name.length > 0 && entry.unit.length > 0 && entry.quantity > 0
    );

  if (normalizedEntries.length === 0) {
    throw new Error("At least one stock-in entry is required.");
  }

  const supabase = getSupabaseClient();
  const transactionIds: string[] = [];
  const operationNotes = buildManualStockInNotes(notes);
  let operationId: string | null = null;

  const totalQuantity = normalizedEntries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
  );

  const { data: createdOperation, error: operationError } = await supabase
    .from("transaction_operations")
    .insert({
      operation_type: "manual_stock_in",
      quantity: Number(totalQuantity.toFixed(3)),
      notes: operationNotes,
      metadata: {
        source: "inventory_manual",
        entry_count: normalizedEntries.length,
      },
    })
    .select("id")
    .single();

  if (operationError) {
    if (!isMissingRelationError(operationError, "transaction_operations")) {
      throw new Error(`Operation logging failed: ${operationError.message}`);
    }
  } else {
    operationId = String(createdOperation.id);
  }

  try {
    for (const entry of normalizedEntries) {
      const inventoryItem = await getOrCreateInventoryItem({
        item_name: entry.item_name,
        category: entry.category,
        quantity: entry.quantity,
        unit: entry.unit,
      });

      const nextStockLevel = inventoryItem.current_stock + entry.quantity;

      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ current_stock: nextStockLevel })
        .eq("id", inventoryItem.id);

      if (updateError) {
        throw new Error(`Inventory update failed: ${updateError.message}`);
      }

      const transactionPayload: Record<string, unknown> = {
        item_id: inventoryItem.id,
        transaction_type: "stock_in",
        quantity: entry.quantity,
        image_url: null,
        detected_by_ai: false,
        notes: operationNotes,
      };

      if (operationId) {
        transactionPayload.operation_id = operationId;
      }

      const { data: createdTransaction, error: transactionError } = await supabase
        .from("stock_transactions")
        .insert(transactionPayload)
        .select("id")
        .single();

      if (transactionError) {
        if (operationId && isMissingColumnError(transactionError, "operation_id")) {
          const fallbackPayload: Record<string, unknown> = {
            item_id: inventoryItem.id,
            transaction_type: "stock_in",
            quantity: entry.quantity,
            image_url: null,
            detected_by_ai: false,
            notes: operationNotes,
          };

          const { data: fallbackTransaction, error: fallbackError } = await supabase
            .from("stock_transactions")
            .insert(fallbackPayload)
            .select("id")
            .single();

          if (fallbackError) {
            throw new Error(`Transaction logging failed: ${fallbackError.message}`);
          }

          transactionIds.push(String(fallbackTransaction.id));
          continue;
        }

        throw new Error(`Transaction logging failed: ${transactionError.message}`);
      }

      transactionIds.push(String(createdTransaction.id));
    }
  } catch (entryError) {
    if (operationId) {
      await supabase.from("transaction_operations").delete().eq("id", operationId);
    }

    throw entryError;
  }

  return {
    deductionsApplied: transactionIds.length,
    transactionIds,
  };
}

export async function scanImageForDeduction(file: File): Promise<ScanDetectionResult> {
  const imageHash = await hashImageFile(file);
  const inFlightScan = scansInFlightByHash.get(imageHash);

  if (inFlightScan) {
    return inFlightScan;
  }

  const scanTask = (async () => {
    const cachedResult = await getCachedImageResult(imageHash);

    if (cachedResult) {
      const fallbackIngredients = buildFallbackIngredients(
        cachedResult.item_name,
        cachedResult.category,
        cachedResult.quantity_estimate,
        cachedResult.unit
      );

      const resolvedIngredients = shouldUseRecipeTemplate(
        cachedResult.item_name,
        fallbackIngredients
      )
        ? applyRecipeTemplate(
            cachedResult.item_name,
            cachedResult.quantity_estimate,
            fallbackIngredients
          )
        : fallbackIngredients;

      return {
        ...cachedResult,
        source: "cache" as const,
        ingredients_to_deduct: resolvedIngredients,
      };
    }

    const detectedResult = await detectIngredientsWithGemini(file);
    const shouldUseTemplate = shouldUseRecipeTemplate(
      detectedResult.item_name,
      detectedResult.ingredients_to_deduct
    );
    const ingredientsToDeduct = shouldUseTemplate
      ? applyRecipeTemplate(
          detectedResult.item_name,
          detectedResult.quantity_estimate,
          detectedResult.ingredients_to_deduct
        )
      : detectedResult.ingredients_to_deduct;

    const scanResult: ScanDetectionResult = {
      image_hash: imageHash,
      item_name: detectedResult.item_name,
      category: detectedResult.category,
      confidence: detectedResult.confidence,
      quantity_estimate: detectedResult.quantity_estimate,
      unit: detectedResult.unit,
      source: "gemini",
      ingredients_to_deduct: ingredientsToDeduct,
    };

    try {
      await upsertCachedImageResult({
        image_hash: imageHash,
        item_name: scanResult.item_name,
        category: scanResult.category,
        confidence: scanResult.confidence,
        quantity_estimate: scanResult.quantity_estimate,
        unit: scanResult.unit,
      });
    } catch (error) {
      console.warn(
        error instanceof Error
          ? error.message
          : "Image cache write failed for unknown reason."
      );
    }

    return scanResult;
  })();

  scansInFlightByHash.set(imageHash, scanTask);

  try {
    return await scanTask;
  } finally {
    const activeTask = scansInFlightByHash.get(imageHash);

    if (activeTask === scanTask) {
      scansInFlightByHash.delete(imageHash);
    }
  }
}

export async function scanImageForStockInCatalog(
  file: File,
  catalog: StockInCatalogEntry[]
): Promise<ScanDetectionResult> {
  const normalizedCatalog = normalizeStockInCatalog(catalog);

  if (normalizedCatalog.length === 0) {
    throw new Error("Ingredient catalog is empty. Configure recipe ingredients first.");
  }

  const imageHash = await hashImageFile(file);
  const scope = getStockInSemanticScope(normalizedCatalog);
  const taskKey = `${scope}:${imageHash}`;
  const inFlightScan = stockInScansInFlightByKey.get(taskKey);

  if (inFlightScan) {
    return inFlightScan;
  }

  const scanTask = (async () => {
    let signature: string | null = null;

    try {
      signature = await computeImageSemanticSignature(file);

      const semanticCached = findSemanticCachedPayload<CachedStockInSemanticPayload>(
        scope,
        signature,
        {
          maxHammingDistance: 6,
        }
      );
      const normalizedSemanticPayload = normalizeStockInSemanticPayload(semanticCached);

      if (normalizedSemanticPayload) {
        return {
          image_hash: imageHash,
          source: "cache" as const,
          ...normalizedSemanticPayload,
        };
      }
    } catch {
      signature = null;
    }

    const detectedResult = await detectStockInWithCatalogGemini(file, normalizedCatalog);
    const scanResult: ScanDetectionResult = {
      image_hash: imageHash,
      item_name: detectedResult.item_name,
      category: detectedResult.category,
      confidence: detectedResult.confidence,
      quantity_estimate: detectedResult.quantity_estimate,
      unit: detectedResult.unit,
      source: "gemini",
      ingredients_to_deduct: detectedResult.ingredients_to_deduct,
    };

    if (signature) {
      upsertSemanticCachedPayload(scope, signature, {
        item_name: scanResult.item_name,
        category: scanResult.category,
        confidence: scanResult.confidence,
        quantity_estimate: scanResult.quantity_estimate,
        unit: scanResult.unit,
        ingredients_to_deduct: scanResult.ingredients_to_deduct,
      });
    }

    try {
      await upsertCachedImageResult({
        image_hash: imageHash,
        item_name: scanResult.item_name,
        category: scanResult.category,
        confidence: scanResult.confidence,
        quantity_estimate: scanResult.quantity_estimate,
        unit: scanResult.unit,
      });
    } catch (error) {
      console.warn(
        error instanceof Error
          ? error.message
          : "Image cache write failed for unknown reason."
      );
    }

    return scanResult;
  })();

  stockInScansInFlightByKey.set(taskKey, scanTask);

  try {
    return await scanTask;
  } finally {
    const activeTask = stockInScansInFlightByKey.get(taskKey);

    if (activeTask === scanTask) {
      stockInScansInFlightByKey.delete(taskKey);
    }
  }
}

export async function scanImageForStockOutProductCatalog(
  file: File,
  catalog: StockOutProductCatalogEntry[]
): Promise<StockOutProductScanResult> {
  const normalizedCatalog = normalizeStockOutCatalog(catalog);

  if (normalizedCatalog.length === 0) {
    throw new Error("Product catalog is empty. Configure products first.");
  }

  const imageHash = await hashImageFile(file);
  const scope = getStockOutSemanticScope(normalizedCatalog);
  const taskKey = `${scope}:${imageHash}`;
  const inFlightScan = stockOutScansInFlightByKey.get(taskKey);

  if (inFlightScan) {
    return inFlightScan;
  }

  const scanTask = (async () => {
    let signature: string | null = null;

    try {
      signature = await computeImageSemanticSignature(file);

      const semanticCached = findSemanticCachedPayload<CachedStockOutSemanticPayload>(
        scope,
        signature,
        {
          maxHammingDistance: 6,
        }
      );
      const normalizedSemanticPayload = normalizeStockOutSemanticPayload(
        semanticCached
      );

      if (normalizedSemanticPayload) {
        return {
          image_hash: imageHash,
          source: "cache" as const,
          ...normalizedSemanticPayload,
        };
      }
    } catch {
      signature = null;
    }

    const classified = await classifyProductWithCatalogGemini(
      file,
      normalizedCatalog
    );
    const scanResult: StockOutProductScanResult = {
      image_hash: imageHash,
      source: "gemini",
      product_id: classified.product_id,
      product_name: classified.product_name,
      category: classified.category,
      confidence: classified.confidence,
      quantity_estimate: classified.quantity_estimate,
      unit: classified.unit,
    };

    if (signature) {
      upsertSemanticCachedPayload(scope, signature, {
        product_id: scanResult.product_id,
        product_name: scanResult.product_name,
        category: scanResult.category,
        confidence: scanResult.confidence,
        quantity_estimate: scanResult.quantity_estimate,
        unit: scanResult.unit,
      });
    }

    try {
      await upsertCachedImageResult({
        image_hash: imageHash,
        item_name: scanResult.product_name,
        category: scanResult.category,
        confidence: scanResult.confidence,
        quantity_estimate: scanResult.quantity_estimate,
        unit: scanResult.unit,
      });
    } catch (error) {
      console.warn(
        error instanceof Error
          ? error.message
          : "Image cache write failed for unknown reason."
      );
    }

    return scanResult;
  })();

  stockOutScansInFlightByKey.set(taskKey, scanTask);

  try {
    return await scanTask;
  } finally {
    const activeTask = stockOutScansInFlightByKey.get(taskKey);

    if (activeTask === scanTask) {
      stockOutScansInFlightByKey.delete(taskKey);
    }
  }
}

export function getStockScanDiagnostics(): {
  in_flight_scan_count: number;
  stock_in_in_flight_scan_count: number;
  stock_out_in_flight_scan_count: number;
  gemini: ReturnType<typeof getGeminiUsageSnapshot>;
} {
  return {
    in_flight_scan_count: scansInFlightByHash.size,
    stock_in_in_flight_scan_count: stockInScansInFlightByKey.size,
    stock_out_in_flight_scan_count: stockOutScansInFlightByKey.size,
    gemini: getGeminiUsageSnapshot(),
  };
}

export async function confirmScanDeduction({
  detection,
  imageFile,
  transactionType = "stock_out",
  notes,
}: ConfirmScanDeductionInput): Promise<ConfirmDeductionResult> {
  if (detection.ingredients_to_deduct.length === 0) {
    throw new Error("No ingredients available to deduct.");
  }

  const supabase = getSupabaseClient();
  const transactionIds: string[] = [];
  const imageUrl = await uploadImageForTransaction(imageFile, detection.image_hash);
  const operationNotes = buildScanTransactionNotes(detection.item_name, notes);
  let operationId: string | null = null;

  const { data: createdOperation, error: operationError } = await supabase
    .from("transaction_operations")
    .insert({
      operation_type: "scan",
      product_name: detection.item_name,
      quantity: Math.max(1, toNumber(detection.quantity_estimate, 1)),
      notes: operationNotes,
      metadata: {
        source: detection.source,
        image_hash: detection.image_hash,
        confidence: detection.confidence,
        category: detection.category,
      },
    })
    .select("id")
    .single();

  if (operationError) {
    if (!isMissingRelationError(operationError, "transaction_operations")) {
      throw new Error(`Operation logging failed: ${operationError.message}`);
    }
  } else {
    operationId = String(createdOperation.id);
  }

  try {
    for (const ingredient of detection.ingredients_to_deduct) {
      const normalizedQuantity = Math.max(0, toNumber(ingredient.quantity, 0));

      if (normalizedQuantity <= 0) {
        continue;
      }

      const inventoryItem = await getOrCreateInventoryItem(ingredient);
      const stockDelta = toStockDelta(transactionType, normalizedQuantity);
      const nextStockLevel = Math.max(0, inventoryItem.current_stock + stockDelta);

      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ current_stock: nextStockLevel })
        .eq("id", inventoryItem.id);

      if (updateError) {
        throw new Error(`Inventory update failed: ${updateError.message}`);
      }

      const transactionPayload: Record<string, unknown> = {
        item_id: inventoryItem.id,
        transaction_type: transactionType,
        quantity: normalizedQuantity,
        image_url: imageUrl,
        detected_by_ai: true,
        notes: operationNotes,
      };

      if (operationId) {
        transactionPayload.operation_id = operationId;
      }

      const { data: createdTransaction, error: transactionError } = await supabase
        .from("stock_transactions")
        .insert(transactionPayload)
        .select("id")
        .single();

      if (transactionError) {
        if (operationId && isMissingColumnError(transactionError, "operation_id")) {
          const fallbackPayload: Record<string, unknown> = {
            item_id: inventoryItem.id,
            transaction_type: transactionType,
            quantity: normalizedQuantity,
            image_url: imageUrl,
            detected_by_ai: true,
            notes: operationNotes,
          };

          const { data: fallbackTransaction, error: fallbackError } = await supabase
            .from("stock_transactions")
            .insert(fallbackPayload)
            .select("id")
            .single();

          if (fallbackError) {
            throw new Error(`Transaction logging failed: ${fallbackError.message}`);
          }

          transactionIds.push(String(fallbackTransaction.id));
          continue;
        }

        throw new Error(`Transaction logging failed: ${transactionError.message}`);
      }

      transactionIds.push(String(createdTransaction.id));
    }
  } catch (transactionLoopError) {
    if (operationId) {
      await supabase.from("transaction_operations").delete().eq("id", operationId);
    }

    throw transactionLoopError;
  }

  if (transactionIds.length === 0) {
    if (operationId) {
      await supabase.from("transaction_operations").delete().eq("id", operationId);
    }

    throw new Error("Nothing was deducted because all detected quantities were zero.");
  }

  return {
    deductionsApplied: transactionIds.length,
    transactionIds,
  };
}

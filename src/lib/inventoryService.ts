import { appEnv } from "@/lib/env";
import { detectIngredientsWithGemini } from "@/lib/geminiClient";
import {
  getCachedImageResult,
  hashImageFile,
  upsertCachedImageResult,
} from "@/lib/imageCache";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ConfirmDeductionResult,
  IngredientDeduction,
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

interface ConfirmScanDeductionInput {
  detection: ScanDetectionResult;
  imageFile?: File | null;
  transactionType?: TransactionType;
  notes?: string;
}

interface InventoryLookup {
  id: string;
  current_stock: number;
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

export async function scanImageForDeduction(file: File): Promise<ScanDetectionResult> {
  const imageHash = await hashImageFile(file);
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
      source: "cache",
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

    const { data: createdTransaction, error: transactionError } = await supabase
      .from("stock_transactions")
      .insert({
        item_id: inventoryItem.id,
        transaction_type: transactionType,
        quantity: normalizedQuantity,
        image_url: imageUrl,
        detected_by_ai: true,
        notes: notes ?? `Detected dish/item: ${detection.item_name}`,
      })
      .select("id")
      .single();

    if (transactionError) {
      throw new Error(`Transaction logging failed: ${transactionError.message}`);
    }

    transactionIds.push(createdTransaction.id);
  }

  if (transactionIds.length === 0) {
    throw new Error("Nothing was deducted because all detected quantities were zero.");
  }

  return {
    deductionsApplied: transactionIds.length,
    transactionIds,
  };
}

import { appEnv, assertRuntimeEnv } from "@/lib/env";
import { assertImageQualityForAi } from "@/lib/imageQuality";
import type { ConfidenceLevel, IngredientDeduction } from "@/types/inventory";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const INVENTORY_ANALYSIS_PROMPT = [
  "You are an inventory assistant for a craft cafe.",
  "Analyze this image and return ONLY a JSON object in this exact format:",
  "{",
  '  "item_name": "string",',
  '  "category": "string",',
  '  "confidence": "high" | "medium" | "low",',
  '  "quantity_estimate": number,',
  '  "unit": "string",',
  '  "ingredients_to_deduct": [',
  "    {",
  '      "item_name": "string",',
  '      "category": "string",',
  '      "quantity": number,',
  '      "unit": "string"',
  "    }",
  "  ]",
  "}",
  "Rules:",
  "- Return JSON only. Do not include markdown or explanations.",
  "- If ingredients are unknown, return one ingredient mirroring the detected item.",
  "- Use positive numbers for quantity_estimate and ingredient quantity.",
].join("\n");

function buildStockInCatalogPrompt(
  ingredients: StockInCatalogIngredient[]
): string {
  const catalogText = ingredients
    .map(
      (ingredient, index) =>
        `${index + 1}. ${ingredient.name} | ${ingredient.unit} | ${ingredient.category}`
    )
    .join("\n");

  return [
    "You are an inventory stock-in assistant for a craft cafe.",
    "Identify visible ingredients and quantities from this image.",
    "You MUST ONLY return ingredients from the provided catalog.",
    "Return ONLY a JSON object in this exact format:",
    "{",
    '  "item_name": "string",',
    '  "confidence": "high" | "medium" | "low",',
    '  "quantity_estimate": number,',
    '  "unit": "string",',
    '  "ingredients_to_deduct": [',
    "    {",
    '      "item_name": "string",',
    '      "category": "string",',
    '      "quantity": number,',
    '      "unit": "string"',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Do not invent any ingredient outside the catalog.",
    "- item_name in ingredients_to_deduct must exactly match one catalog ingredient name.",
    "- unit in ingredients_to_deduct must exactly match catalog unit for that ingredient.",
    "- Use positive quantities only.",
    "- If uncertain, return lower confidence and fewer lines, never hallucinate.",
    "Ingredient Catalog:",
    catalogText,
  ].join("\n");
}

function buildProductCatalogPrompt(products: ProductCatalogCandidate[]): string {
  const productList = products
    .map(
      (product, index) =>
        `${index + 1}. ${product.name} | ${product.category}${product.description ? ` | ${product.description}` : ""}`
    )
    .join("\n");

  return [
    "You are a product recognition assistant for stock-out transactions.",
    "Identify which ONE product from the product catalog is shown in the image.",
    "Return ONLY a JSON object in this exact format:",
    "{",
    '  "product_name": "string",',
    '  "confidence": "high" | "medium" | "low",',
    '  "quantity_estimate": number',
    "}",
    "Rules:",
    "- product_name MUST be exactly one of the catalog names.",
    "- Never output product names not in the catalog.",
    "- quantity_estimate must be a positive number representing sold units/servings.",
    "- If uncertain, pick the closest valid catalog product and reduce confidence.",
    "Product Catalog:",
    productList,
  ].join("\n");
}

function clampQuantity(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function getTokenOverlapScore(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function resolveProductCandidate(
  rawProductName: string,
  candidates: ProductCatalogCandidate[]
): ProductCatalogCandidate | null {
  const normalizedRaw = normalizeText(rawProductName);

  if (!normalizedRaw) {
    return null;
  }

  const exact =
    candidates.find((candidate) => normalizeText(candidate.name) === normalizedRaw) ??
    null;

  if (exact) {
    return exact;
  }

  const includesMatch =
    candidates.find((candidate) => {
      const normalizedCandidate = normalizeText(candidate.name);
      return (
        normalizedCandidate.includes(normalizedRaw) ||
        normalizedRaw.includes(normalizedCandidate)
      );
    }) ?? null;

  if (includesMatch) {
    return includesMatch;
  }

  let bestCandidate: ProductCatalogCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = getTokenOverlapScore(rawProductName, candidate.name);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestScore >= 0.45) {
    return bestCandidate;
  }

  return null;
}

interface GeminiDetectionResult {
  item_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
  ingredients_to_deduct: IngredientDeduction[];
}

export interface StockInCatalogIngredient {
  name: string;
  unit: string;
  category: string;
}

export interface ProductCatalogCandidate {
  id: string;
  name: string;
  category: string;
  description?: string | null;
}

export interface GeminiProductClassificationResult {
  product_id: string;
  product_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
}

interface GeminiRequestErrorShape {
  status: number;
  message: string;
  model: string;
}

export interface GeminiUsageSnapshot {
  queued_requests: number;
  total_requests: number;
  total_network_attempts: number;
  total_retries: number;
  total_failures: number;
  last_model: string | null;
  last_error: string | null;
  model_cooldowns: Record<string, number>;
}

const modelCooldownUntil = new Map<string, number>();
let lastRequestStartAt = 0;
let requestQueueTail: Promise<void> = Promise.resolve();
let queuedRequests = 0;

const geminiUsageState = {
  total_requests: 0,
  total_network_attempts: 0,
  total_retries: 0,
  total_failures: 0,
  last_model: null as string | null,
  last_error: null as string | null,
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function extractJsonString(rawText: string): string {
  const trimmed = rawText.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    throw new Error("Gemini did not return a valid JSON object.");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function toNonEmptyString(value: unknown, fallbackValue: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallbackValue;
}

function toPositiveNumber(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function toConfidenceLevel(value: unknown): ConfidenceLevel {
  const normalized = String(value ?? "").toLowerCase();

  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    if (numericValue >= 0.8) {
      return "high";
    }

    if (numericValue >= 0.5) {
      return "medium";
    }

    return "low";
  }

  return "medium";
}

function toIngredients(value: unknown, fallbackIngredient: IngredientDeduction): IngredientDeduction[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [fallbackIngredient];
  }

  const normalizedIngredients = value
    .map((ingredient): IngredientDeduction | null => {
      if (!ingredient || typeof ingredient !== "object") {
        return null;
      }

      const record = ingredient as Record<string, unknown>;
      const itemName = toNonEmptyString(
        record.item_name ?? record.name,
        fallbackIngredient.item_name
      );

      return {
        item_name: itemName,
        category: toNonEmptyString(record.category, fallbackIngredient.category),
        quantity: toPositiveNumber(record.quantity, fallbackIngredient.quantity),
        unit: toNonEmptyString(record.unit, fallbackIngredient.unit),
      };
    })
    .filter((ingredient): ingredient is IngredientDeduction => ingredient !== null);

  if (normalizedIngredients.length === 0) {
    return [fallbackIngredient];
  }

  return normalizedIngredients;
}

function getGeminiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const errorPayload = (payload as { error?: { message?: string } }).error;

  if (errorPayload && typeof errorPayload.message === "string") {
    return errorPayload.message;
  }

  return null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getCandidateModels(): string[] {
  const modelSet = new Set<string>();

  if (appEnv.geminiModel.trim()) {
    modelSet.add(appEnv.geminiModel.trim());
  }

  for (const fallbackModel of appEnv.geminiFallbackModels) {
    if (fallbackModel.trim()) {
      modelSet.add(fallbackModel.trim());
    }
  }

  if (modelSet.size === 0) {
    modelSet.add("gemini-2.0-flash");
  }

  return [...modelSet];
}

function getCooldownWaitMs(models: string[]): number {
  const now = Date.now();
  let nearestWaitMs: number | null = null;

  for (const model of models) {
    const cooldownUntil = modelCooldownUntil.get(model) ?? 0;

    if (cooldownUntil <= now) {
      return 0;
    }

    const waitMs = cooldownUntil - now;

    if (nearestWaitMs === null || waitMs < nearestWaitMs) {
      nearestWaitMs = waitMs;
    }
  }

  return nearestWaitMs ?? 0;
}

async function waitForRequestSlot(): Promise<void> {
  const queueEntry = requestQueueTail;
  let releaseQueue: () => void = () => {};

  requestQueueTail = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  queuedRequests += 1;

  await queueEntry;

  try {
    const now = Date.now();
    const waitMs = Math.max(
      0,
      lastRequestStartAt + appEnv.geminiMinRequestIntervalMs - now
    );

    if (waitMs > 0) {
      await delay(waitMs);
    }

    lastRequestStartAt = Date.now();
  } finally {
    queuedRequests = Math.max(0, queuedRequests - 1);
    releaseQueue();
  }
}

function toGeminiRequestErrorShape(
  error: unknown,
  model: string
): GeminiRequestErrorShape {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "message" in error
  ) {
    return {
      status: Number((error as { status: unknown }).status),
      message: String((error as { message: unknown }).message),
      model,
    };
  }

  return {
    status: 0,
    message: error instanceof Error ? error.message : "Unknown Gemini error.",
    model,
  };
}

async function requestGeminiResponsePayload(
  file: File,
  imageBase64: string,
  model: string,
  promptText: string
): Promise<unknown> {
  const endpoint = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${appEnv.geminiApiKey}`;

  await waitForRequestSlot();

  geminiUsageState.total_network_attempts += 1;
  geminiUsageState.last_model = model;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: file.type || "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  const responsePayload = await response.json();

  if (!response.ok) {
    const geminiError = getGeminiErrorMessage(responsePayload);
    const errorMessage =
      geminiError ?? `Gemini API error for model ${model} (status ${response.status}).`;

    throw {
      status: response.status,
      message: errorMessage,
      model,
    };
  }

  return responsePayload;
}

function parseGeminiResponsePayload(payload: unknown): GeminiDetectionResult {
  const responseTextCandidate =
    (payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    })?.candidates?.[0]?.content?.parts?.find(
      (part: { text?: unknown }) => typeof part.text === "string"
    )?.text;

  const responseText =
    typeof responseTextCandidate === "string" ? responseTextCandidate : "";

  if (!responseText) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsedResponse = JSON.parse(
    extractJsonString(responseText)
  ) as Record<string, unknown>;

  const normalizedResult = {
    item_name: toNonEmptyString(parsedResponse.item_name, "Unknown Item"),
    category: toNonEmptyString(parsedResponse.category, "Uncategorized"),
    confidence: toConfidenceLevel(parsedResponse.confidence),
    quantity_estimate: toPositiveNumber(parsedResponse.quantity_estimate, 1),
    unit: toNonEmptyString(parsedResponse.unit, "pcs"),
  };

  const fallbackIngredient: IngredientDeduction = {
    item_name: normalizedResult.item_name,
    category: normalizedResult.category,
    quantity: normalizedResult.quantity_estimate,
    unit: normalizedResult.unit,
  };

  return {
    ...normalizedResult,
    ingredients_to_deduct: toIngredients(
      parsedResponse.ingredients_to_deduct,
      fallbackIngredient
    ),
  };
}

export function getGeminiUsageSnapshot(): GeminiUsageSnapshot {
  const modelCooldowns: Record<string, number> = {};

  for (const [model, cooldownUntil] of modelCooldownUntil.entries()) {
    modelCooldowns[model] = cooldownUntil;
  }

  return {
    queued_requests: queuedRequests,
    total_requests: geminiUsageState.total_requests,
    total_network_attempts: geminiUsageState.total_network_attempts,
    total_retries: geminiUsageState.total_retries,
    total_failures: geminiUsageState.total_failures,
    last_model: geminiUsageState.last_model,
    last_error: geminiUsageState.last_error,
    model_cooldowns: modelCooldowns,
  };
}

function parseGeminiPayloadAsRecord(payload: unknown): Record<string, unknown> {
  const responseTextCandidate =
    (payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    })?.candidates?.[0]?.content?.parts?.find(
      (part: { text?: unknown }) => typeof part.text === "string"
    )?.text;

  const responseText =
    typeof responseTextCandidate === "string" ? responseTextCandidate : "";

  if (!responseText) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(extractJsonString(responseText)) as Record<string, unknown>;
}

async function requestGeminiPayloadWithFallback(
  file: File,
  promptText: string
): Promise<unknown> {
  geminiUsageState.total_requests += 1;

  const imageBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const candidateModels = getCandidateModels();
  let modelsToTry = candidateModels.filter(
    (model) => (modelCooldownUntil.get(model) ?? 0) <= Date.now()
  );

  if (modelsToTry.length === 0) {
    const waitMs = getCooldownWaitMs(candidateModels);

    if (waitMs > 0) {
      await delay(waitMs);
    }

    modelsToTry = [...candidateModels];
  }

  const maxRetries = Math.max(0, appEnv.geminiMaxRetries);
  let lastError: GeminiRequestErrorShape | null = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const responsePayload = await requestGeminiResponsePayload(
          file,
          imageBase64,
          model,
          promptText
        );

        geminiUsageState.last_error = null;
        return responsePayload;
      } catch (error) {
        const normalizedError = toGeminiRequestErrorShape(error, model);
        lastError = normalizedError;
        geminiUsageState.last_error = normalizedError.message;

        const isRateLimited = normalizedError.status === 429;
        const isTransientError =
          normalizedError.status >= 500 || normalizedError.status === 0;
        const canRetry = attempt < maxRetries && (isRateLimited || isTransientError);

        if (canRetry) {
          geminiUsageState.total_retries += 1;
          const retryDelayMs = Math.min(4_000, 600 * (attempt + 1));
          await delay(retryDelayMs);
          continue;
        }

        if (isRateLimited) {
          modelCooldownUntil.set(model, Date.now() + appEnv.geminiCooldownMs);
        }

        break;
      }
    }
  }

  geminiUsageState.total_failures += 1;

  if (lastError) {
    throw new Error(
      `Gemini request failed (${lastError.status || "network"}) on model ${lastError.model}: ${lastError.message}`
    );
  }

  throw new Error("Gemini request failed: all models are unavailable.");
}

function mapStockInIngredientsToCatalog(
  rawIngredients: unknown,
  catalog: StockInCatalogIngredient[],
  fallbackQuantity: number
): IngredientDeduction[] {
  const catalogByExactKey = new Map<string, StockInCatalogIngredient>();
  const catalogByName = new Map<string, StockInCatalogIngredient>();

  for (const ingredient of catalog) {
    const normalizedName = normalizeText(ingredient.name);
    const normalizedUnit = normalizeText(ingredient.unit);

    catalogByExactKey.set(`${normalizedName}|${normalizedUnit}`, ingredient);

    if (!catalogByName.has(normalizedName)) {
      catalogByName.set(normalizedName, ingredient);
    }
  }

  if (!Array.isArray(rawIngredients)) {
    return [];
  }

  const mergedByKey = new Map<string, IngredientDeduction>();

  for (const rawIngredient of rawIngredients) {
    if (!rawIngredient || typeof rawIngredient !== "object") {
      continue;
    }

    const record = rawIngredient as Record<string, unknown>;
    const rawName = toNonEmptyString(record.item_name ?? record.name, "");
    const rawUnit = toNonEmptyString(record.unit, "");

    if (!rawName) {
      continue;
    }

    const exactCatalogKey = `${normalizeText(rawName)}|${normalizeText(rawUnit)}`;
    const matchedCatalog =
      catalogByExactKey.get(exactCatalogKey) ??
      catalogByName.get(normalizeText(rawName)) ??
      null;

    if (!matchedCatalog) {
      continue;
    }

    const quantity = clampQuantity(
      toPositiveNumber(record.quantity, fallbackQuantity),
      0.05,
      500
    );
    const mergedKey = `${normalizeText(matchedCatalog.name)}|${normalizeText(matchedCatalog.unit)}`;
    const existing = mergedByKey.get(mergedKey);

    if (existing) {
      existing.quantity = Number((existing.quantity + quantity).toFixed(3));
      continue;
    }

    mergedByKey.set(mergedKey, {
      item_name: matchedCatalog.name,
      category: matchedCatalog.category,
      unit: matchedCatalog.unit,
      quantity: Number(quantity.toFixed(3)),
    });
  }

  return [...mergedByKey.values()];
}

export async function detectIngredientsWithGemini(
  file: File
): Promise<GeminiDetectionResult> {
  assertRuntimeEnv(["VITE_GEMINI_API_KEY"]);

  await assertImageQualityForAi(file);
  const responsePayload = await requestGeminiPayloadWithFallback(
    file,
    INVENTORY_ANALYSIS_PROMPT
  );

  return parseGeminiResponsePayload(responsePayload);
}

export async function detectStockInWithCatalogGemini(
  file: File,
  ingredientCatalog: StockInCatalogIngredient[]
): Promise<GeminiDetectionResult> {
  assertRuntimeEnv(["VITE_GEMINI_API_KEY"]);

  if (ingredientCatalog.length === 0) {
    throw new Error("Ingredient catalog is required for stock-in scanning.");
  }

  await assertImageQualityForAi(file);
  const prompt = buildStockInCatalogPrompt(ingredientCatalog);
  const responsePayload = await requestGeminiPayloadWithFallback(file, prompt);
  const parsed = parseGeminiPayloadAsRecord(responsePayload);
  const quantityEstimate = clampQuantity(
    toPositiveNumber(parsed.quantity_estimate, 1),
    0.05,
    500
  );

  const ingredients = mapStockInIngredientsToCatalog(
    parsed.ingredients_to_deduct,
    ingredientCatalog,
    quantityEstimate
  );

  if (ingredients.length === 0) {
    throw new Error(
      "AI could not match this image to known ingredients. Please retake image or add lines manually."
    );
  }

  return {
    item_name: toNonEmptyString(parsed.item_name, "Stock In"),
    category: "Stock In",
    confidence: toConfidenceLevel(parsed.confidence),
    quantity_estimate: Number(quantityEstimate.toFixed(3)),
    unit: toNonEmptyString(parsed.unit, "batch"),
    ingredients_to_deduct: ingredients,
  };
}

export async function classifyProductWithCatalogGemini(
  file: File,
  productCatalog: ProductCatalogCandidate[]
): Promise<GeminiProductClassificationResult> {
  assertRuntimeEnv(["VITE_GEMINI_API_KEY"]);

  if (productCatalog.length === 0) {
    throw new Error("Product catalog is required for stock-out scanning.");
  }

  await assertImageQualityForAi(file);
  const prompt = buildProductCatalogPrompt(productCatalog);
  const responsePayload = await requestGeminiPayloadWithFallback(file, prompt);
  const parsed = parseGeminiPayloadAsRecord(responsePayload);
  const rawProductName = toNonEmptyString(parsed.product_name, "");
  const matchedProduct = resolveProductCandidate(rawProductName, productCatalog);

  if (!matchedProduct) {
    throw new Error(
      "AI could not confidently match the image to a known product. Please select product manually."
    );
  }

  const quantityEstimate = clampQuantity(
    toPositiveNumber(parsed.quantity_estimate, 1),
    0.05,
    100
  );

  return {
    product_id: matchedProduct.id,
    product_name: matchedProduct.name,
    category: matchedProduct.category,
    confidence: toConfidenceLevel(parsed.confidence),
    quantity_estimate: Number(quantityEstimate.toFixed(3)),
    unit: "serving",
  };
}

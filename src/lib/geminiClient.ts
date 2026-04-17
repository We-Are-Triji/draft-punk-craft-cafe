import { appEnv, assertRuntimeEnv } from "@/lib/env";
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

interface GeminiDetectionResult {
  item_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
  ingredients_to_deduct: IngredientDeduction[];
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
  model: string
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
            { text: INVENTORY_ANALYSIS_PROMPT },
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

export async function detectIngredientsWithGemini(
  file: File
): Promise<GeminiDetectionResult> {
  assertRuntimeEnv(["VITE_GEMINI_API_KEY"]);

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
          model
        );

        geminiUsageState.last_error = null;
        return parseGeminiResponsePayload(responsePayload);
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

import { appEnv } from "@/lib/env";
import { assertImageQualityForAi } from "@/lib/imageQuality";
import type { ConfidenceLevel, IngredientDeduction } from "@/types/inventory";

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
    "Identify visible ingredients from this image and map them to the provided ingredient catalog.",
    "You MUST ONLY return ingredients from the provided catalog.",
    "Return ONLY compact minified JSON (single line, no markdown, no extra text) in this exact format:",
    "{",
    '  "item_name": "string",',
    '  "confidence": "high" | "medium" | "low",',
    '  "quantity_estimate": number | null,',
    '  "unit": "string",',
    '  "ingredients_to_deduct": [',
    "    {",
    '      "item_name": "string",',
    '      "category": "string",',
    '      "quantity": number | null,',
    '      "unit": "string"',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Do not invent any ingredient outside the catalog.",
    "- item_name in ingredients_to_deduct must exactly match one catalog ingredient name.",
    "- unit in ingredients_to_deduct must exactly match catalog unit for that ingredient.",
    "- Recognize brand/trade names and map them to catalog ingredient names.",
    "- Example mapping: Golden Fiesta -> Vegetable Oil, branded baking powder -> Baking Powder.",
    "- If quantity is unclear or not visible, set quantity to null and unit to \"N/A\".",
    "- For unlabeled fresh goods (for example raw meat trays), prioritize ingredient recognition and set quantity null when unsure.",
    "- If packaging label clearly shows amount or count, provide it as quantity.",
    "- If uncertain, return lower confidence and fewer lines, never hallucinate.",
    "Ingredient Catalog:",
    catalogText,
  ].join("\n");
}

function buildStockInCatalogRecoveryPrompt(
  ingredients: StockInCatalogIngredient[]
): string {
  const catalogText = ingredients
    .map(
      (ingredient, index) =>
        `${index + 1}. ${ingredient.name} | ${ingredient.unit} | ${ingredient.category}`
    )
    .join("\n");

  return [
    "Return ONLY a compact single-line JSON object.",
    "Use ONLY names and units from this ingredient catalog.",
    "Schema:",
    '{"item_name":"string","confidence":"high|medium|low","quantity_estimate":number|null,"unit":"string","ingredients_to_deduct":[{"item_name":"string","category":"string","quantity":number|null,"unit":"string"}]}',
    "If quantity is unclear, set quantity_estimate or quantity to null.",
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
    "Return ONLY compact minified JSON (single line, no markdown, no extra text) in this exact format:",
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

interface ProductCandidateMatch {
  candidate: ProductCatalogCandidate;
  matchType: "exact" | "includes" | "token";
  score: number;
}

function resolveProductCandidate(
  rawProductName: string,
  candidates: ProductCatalogCandidate[]
): ProductCandidateMatch | null {
  const normalizedRaw = normalizeText(rawProductName);

  if (!normalizedRaw) {
    return null;
  }

  const exact =
    candidates.find((candidate) => normalizeText(candidate.name) === normalizedRaw) ??
    null;

  if (exact) {
    return {
      candidate: exact,
      matchType: "exact",
      score: 1,
    };
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
    return {
      candidate: includesMatch,
      matchType: "includes",
      score: Math.max(0.75, getTokenOverlapScore(rawProductName, includesMatch.name)),
    };
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
    return bestCandidate
      ? {
          candidate: bestCandidate,
          matchType: "token",
          score: bestScore,
        }
      : null;
  }

  return null;
}

function calibrateProductClassificationConfidence(
  modelConfidence: ConfidenceLevel,
  match: ProductCandidateMatch
): ConfidenceLevel {
  if (match.matchType === "exact") {
    return modelConfidence;
  }

  if (match.matchType === "includes") {
    return modelConfidence === "high" ? "medium" : modelConfidence;
  }

  if (match.score < 0.58) {
    return "low";
  }

  if (match.score < 0.72 && modelConfidence === "high") {
    return "medium";
  }

  return modelConfidence;
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

export type AiModelProgressStep =
  | "quality_check"
  | "encoding"
  | "requesting"
  | "retry_wait"
  | "fallback_model"
  | "response_received"
  | "parsing";

export interface AiModelProgressEvent {
  step: AiModelProgressStep;
  model?: string;
  attempt?: number;
  retryDelayMs?: number;
}

interface GeminiScanOptions {
  skipQualityGate?: boolean;
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
    throw new Error("AI model did not return a valid JSON object.");
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

function getOpenRouterErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const errorPayload = (
    payload as {
      error?: { message?: string; metadata?: { raw?: string } };
    }
  ).error;

  if (errorPayload && typeof errorPayload.message === "string") {
    return errorPayload.message;
  }

  if (errorPayload?.metadata && typeof errorPayload.metadata.raw === "string") {
    return errorPayload.metadata.raw;
  }

  return null;
}

function getOpenRouterFinishReason(payload: unknown): string {
  const finishReason =
    (payload as { choices?: Array<{ finish_reason?: unknown }> })?.choices?.[0]
      ?.finish_reason ?? "";

  return typeof finishReason === "string" ? finishReason.trim().toLowerCase() : "";
}

function extractTextEntries(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractTextEntries(entry));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const textEntries: string[] = [];

  if (typeof record.text === "string" && record.text.trim()) {
    textEntries.push(record.text.trim());
  }

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    textEntries.push(record.output_text.trim());
  }

  if (typeof record.arguments === "string" && record.arguments.trim()) {
    textEntries.push(record.arguments.trim());
  }

  if (record.json && typeof record.json === "object") {
    try {
      textEntries.push(JSON.stringify(record.json));
    } catch {
      // Ignore non-serializable structured content.
    }
  }

  if (record.value && typeof record.value === "object") {
    try {
      textEntries.push(JSON.stringify(record.value));
    } catch {
      // Ignore non-serializable structured content.
    }
  }

  if (typeof record.content === "string" && record.content.trim()) {
    textEntries.push(record.content.trim());
  }

  if (record.parts !== undefined && record.parts !== null) {
    textEntries.push(...extractTextEntries(record.parts));
  }

  if (record.arguments !== undefined && record.arguments !== null) {
    textEntries.push(...extractTextEntries(record.arguments));
  }

  if (record.function !== undefined && record.function !== null) {
    textEntries.push(...extractTextEntries(record.function));
  }

  if (record.tool_calls !== undefined && record.tool_calls !== null) {
    textEntries.push(...extractTextEntries(record.tool_calls));
  }

  if (record.content !== undefined && record.content !== null) {
    textEntries.push(...extractTextEntries(record.content));
  }

  return textEntries;
}

function extractOpenRouterResponseText(payload: unknown): string {
  const message = (
    payload as {
      choices?: Array<{
        message?: {
          content?: unknown;
          reasoning?: unknown;
          refusal?: unknown;
          tool_calls?: unknown;
          function_call?: unknown;
        };
      }>;
    }
  )?.choices?.[0]?.message;

  const contentText = extractTextEntries(message?.content).join("\n").trim();

  if (contentText) {
    return contentText;
  }

  const responsesApiOutputText = extractTextEntries(
    (payload as { output?: unknown }).output
  )
    .join("\n")
    .trim();

  if (responsesApiOutputText) {
    return responsesApiOutputText;
  }

  const toolCallArgumentsText = extractTextEntries(message?.tool_calls)
    .join("\n")
    .trim();

  if (toolCallArgumentsText) {
    return toolCallArgumentsText;
  }

  const functionCallArgumentsText = extractTextEntries(message?.function_call)
    .join("\n")
    .trim();

  if (functionCallArgumentsText) {
    return functionCallArgumentsText;
  }

  const legacyText =
    (payload as { choices?: Array<{ text?: unknown }> })?.choices?.[0]?.text ?? "";

  if (typeof legacyText === "string" && legacyText.trim()) {
    return legacyText;
  }

  const reasoningText = extractTextEntries(message?.reasoning).join("\n").trim();

  if (reasoningText) {
    try {
      return extractJsonString(reasoningText);
    } catch {
      if (getOpenRouterFinishReason(payload) === "length") {
        throw new Error(
          "AI response was truncated before it returned JSON. Increase the output token budget or use another fallback model."
        );
      }

      throw new Error(
        "AI provider returned reasoning output without final JSON. Please retry with another image or fallback model."
      );
    }
  }

  const refusalText = extractTextEntries(message?.refusal).join("\n").trim();

  if (refusalText) {
    throw new Error(`AI provider refused to complete the request: ${refusalText}`);
  }

  throw new Error("AI provider returned an empty response.");
}

function isOpenRouterResponseContentIssue(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.trim().toLowerCase();

  return (
    normalized.includes("empty response") ||
    normalized.includes("malformed json") ||
    normalized.includes("valid json") ||
    normalized.includes("truncated")
  );
}

function assertOpenRouterPayloadHasValidJson(payload: unknown): void {
  const responseText = extractOpenRouterResponseText(payload);

  try {
    JSON.parse(extractJsonString(responseText));
  } catch {
    if (getOpenRouterFinishReason(payload) === "length") {
      throw new Error(
        "AI response was truncated before it returned valid JSON. Increase the output token budget or use another fallback model."
      );
    }

    throw new Error("AI provider returned malformed JSON output.");
  }
}

function assertAiProviderConfigured(): void {
  if (appEnv.groqApiKey.trim()) {
    return;
  }

  throw new Error(
    "Missing required environment variable: VITE_GROQ_API_KEY. Create a local .env file based on .env.example."
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const defaultGroqFallbackModels = [
  "meta-llama/llama-4-maverick-17b-128e-instruct",
];

const defaultOpenRouterQwenFallbackModels = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
];

function getGroqCandidateModels(): string[] {
  const modelSet = new Set<string>();

  if (appEnv.groqModel.trim()) {
    modelSet.add(appEnv.groqModel.trim());
  }

  for (const fallbackModel of appEnv.groqFallbackModels) {
    if (fallbackModel.trim()) {
      modelSet.add(fallbackModel.trim());
    }
  }

  for (const fallbackModel of defaultGroqFallbackModels) {
    modelSet.add(fallbackModel);
  }

  if (modelSet.size === 0) {
    modelSet.add("meta-llama/llama-4-scout-17b-16e-instruct");
  }

  return [...modelSet];
}

function getOpenRouterQwenFallbackModels(): string[] {
  const modelSet = new Set<string>();

  for (const fallbackModel of appEnv.openRouterQwenFallbackModels) {
    if (fallbackModel.trim()) {
      modelSet.add(fallbackModel.trim());
    }
  }

  for (const fallbackModel of defaultOpenRouterQwenFallbackModels) {
    modelSet.add(fallbackModel);
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
      lastRequestStartAt + appEnv.aiMinRequestIntervalMs - now
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
    message: error instanceof Error ? error.message : "Unknown AI provider error.",
    model,
  };
}

function isQuotaOrRateLimitErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();

  return (
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("resource has been exhausted") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("provider returned error")
  );
}

function isModelUnavailableError(error: GeminiRequestErrorShape): boolean {
  const normalizedMessage = error.message.trim().toLowerCase();

  return (
    (error.status === 404 || error.status === 400) &&
    (normalizedMessage.includes("no endpoints found") ||
      normalizedMessage.includes("model not found") ||
      normalizedMessage.includes("no route found") ||
      normalizedMessage.includes("not multimodal") ||
      normalizedMessage.includes("unsupported modality"))
  );
}

function isUnsupportedJsonResponseModeError(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  return (
    normalized.includes("response_format") ||
    normalized.includes("json mode") ||
    normalized.includes("json_object") ||
    normalized.includes("unsupported parameter")
  );
}

async function requestGeminiResponsePayload(
  file: File,
  imageBase64: string,
  model: string,
  promptText: string,
  onProgress?: (event: AiModelProgressEvent) => void,
  attemptNumber = 1
): Promise<unknown> {
  const endpoint = `${appEnv.groqApiBase.replace(/\/$/, "")}/chat/completions`;
  const imageMimeType = file.type || "image/jpeg";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${appEnv.groqApiKey}`,
    "Content-Type": "application/json",
  };

  const baseRequestBody = {
    model,
    temperature: 0.1,
    max_tokens: appEnv.aiMaxOutputTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          {
            type: "image_url",
            image_url: {
              url: `data:${imageMimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
  };

  const sendRequest = async (options: {
    forceJsonResponse: boolean;
  }): Promise<{ response: Response; payload: unknown }> => {
    const requestBody = {
      ...baseRequestBody,
      ...(options.forceJsonResponse
        ? {
            response_format: {
              type: "json_object",
            },
          }
        : {}),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, appEnv.aiRequestTimeoutMs);

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (fetchError) {
      const isAbortError =
        (typeof DOMException !== "undefined" &&
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError") ||
        (fetchError instanceof Error && fetchError.name === "AbortError");

      if (isAbortError) {
        throw {
          status: 408,
          message: `Groq request timed out after ${Math.ceil(
            appEnv.aiRequestTimeoutMs / 1000
          )}s.`,
          model,
        };
      }

      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      response,
      payload,
    };
  };

  await waitForRequestSlot();
  onProgress?.({
    step: "requesting",
    model: `groq:${model}`,
    attempt: attemptNumber,
  });

  geminiUsageState.total_network_attempts += 1;
  geminiUsageState.last_model = model;

  let forceJsonResponse = appEnv.aiForceJsonResponse;
  let response: Response | null = null;
  let responsePayload: unknown = null;

  for (let compatibilityAttempt = 0; compatibilityAttempt < 2; compatibilityAttempt += 1) {
    ({ response, payload: responsePayload } = await sendRequest({
      forceJsonResponse,
    }));

    if (response.ok) {
      break;
    }

    const compatibilityErrorMessage =
      getOpenRouterErrorMessage(responsePayload) ?? "";

    let shouldRetryWithCompatibilityFallback = false;

    if (
      forceJsonResponse &&
      response.status === 400 &&
      isUnsupportedJsonResponseModeError(compatibilityErrorMessage)
    ) {
      forceJsonResponse = false;
      shouldRetryWithCompatibilityFallback = true;
    }

    if (!shouldRetryWithCompatibilityFallback) {
      break;
    }
  }

  if (!response) {
    throw {
      status: 0,
      message: "Groq request did not return a response.",
      model,
    };
  }

  if (!response.ok) {
    const geminiError = getOpenRouterErrorMessage(responsePayload);
    const errorMessage =
      geminiError ?? `Groq API error for model ${model} (status ${response.status}).`;

    throw {
      status: response.status,
      message: errorMessage,
      model,
    };
  }

  if (!responsePayload) {
    throw {
      status: 0,
      message: "Groq returned an unreadable response payload.",
      model,
    };
  }

  try {
    assertOpenRouterPayloadHasValidJson(responsePayload);
  } catch (validationError) {
    throw {
      status: 0,
      message:
        validationError instanceof Error
          ? validationError.message
          : "AI provider returned an invalid response payload.",
      model,
    };
  }

  onProgress?.({
    step: "response_received",
    model: `groq:${model}`,
    attempt: attemptNumber,
  });

  return responsePayload;
}

async function extractImageTextWithLocalOcr(file: File): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    try {
      const ocrResult = await worker.recognize(file);
      return toNonEmptyString(ocrResult?.data?.text, "").trim();
    } finally {
      try {
        await worker.terminate();
      } catch {
        // Ignore worker teardown errors.
      }
    }
  } catch {
    return "";
  }
}

function buildQwenTextFallbackPrompt(basePrompt: string, ocrText: string): string {
  return [
    "You are a fallback OCR-only assistant.",
    "You DO NOT see the image directly. Use only OCR text below to complete the task.",
    "If OCR text is noisy, infer conservatively and obey catalog constraints if present.",
    "Return JSON only.",
    "",
    "TASK SPEC:",
    basePrompt,
    "",
    "OCR TEXT:",
    ocrText.slice(0, 5000),
  ].join("\n");
}

async function requestOpenRouterQwenTextPayload(
  model: string,
  fallbackPrompt: string,
  onProgress?: (event: AiModelProgressEvent) => void,
  attemptNumber = 1
): Promise<unknown> {
  const endpoint = `${appEnv.openRouterApiBase.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${appEnv.openRouterApiKey}`,
    "Content-Type": "application/json",
  };

  const baseRequestBody = {
    model,
    temperature: 0.1,
    max_tokens: appEnv.aiMaxOutputTokens,
    messages: [
      {
        role: "user",
        content: fallbackPrompt,
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, appEnv.aiRequestTimeoutMs);

  onProgress?.({
    step: "requesting",
    model: `openrouter-qwen:${model}`,
    attempt: attemptNumber,
  });

  geminiUsageState.total_network_attempts += 1;
  geminiUsageState.last_model = model;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...baseRequestBody,
        ...(appEnv.aiForceJsonResponse
          ? {
              response_format: {
                type: "json_object",
              },
            }
          : {}),
      }),
      signal: controller.signal,
    });
  } catch (fetchError) {
    const isAbortError =
      (typeof DOMException !== "undefined" &&
        fetchError instanceof DOMException &&
        fetchError.name === "AbortError") ||
      (fetchError instanceof Error && fetchError.name === "AbortError");

    if (isAbortError) {
      throw {
        status: 408,
        message: `OpenRouter Qwen fallback timed out after ${Math.ceil(
          appEnv.aiRequestTimeoutMs / 1000
        )}s.`,
        model,
      };
    }

    throw fetchError;
  } finally {
    clearTimeout(timeoutId);
  }

  let responsePayload: unknown = null;

  try {
    responsePayload = await response.json();
  } catch {
    responsePayload = null;
  }

  if (!response.ok) {
    const apiError = getOpenRouterErrorMessage(responsePayload);
    throw {
      status: response.status,
      message:
        apiError ??
        `OpenRouter Qwen fallback failed for model ${model} (status ${response.status}).`,
      model,
    };
  }

  if (!responsePayload) {
    throw {
      status: 0,
      message: "OpenRouter Qwen fallback returned an unreadable response payload.",
      model,
    };
  }

  assertOpenRouterPayloadHasValidJson(responsePayload);

  onProgress?.({
    step: "response_received",
    model: `openrouter-qwen:${model}`,
    attempt: attemptNumber,
  });

  return responsePayload;
}

function parseGeminiResponsePayload(payload: unknown): GeminiDetectionResult {
  const parsedResponse = parseGeminiPayloadAsRecord(payload);

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
  const responseText = extractOpenRouterResponseText(payload);

  try {
    return JSON.parse(extractJsonString(responseText)) as Record<string, unknown>;
  } catch {
    if (getOpenRouterFinishReason(payload) === "length") {
      throw new Error(
        "AI response was truncated before it returned valid JSON. Increase the output token budget or use another fallback model."
      );
    }

    throw new Error("AI provider returned malformed JSON output.");
  }
}

async function requestGeminiPayloadWithFallback(
  file: File,
  promptText: string,
  onProgress?: (event: AiModelProgressEvent) => void
): Promise<unknown> {
  geminiUsageState.total_requests += 1;
  const totalScanTimeoutMs = Math.max(
    appEnv.aiRequestTimeoutMs + 5_000,
    appEnv.aiTotalScanTimeoutMs
  );
  const deadlineAt = Date.now() + totalScanTimeoutMs;

  onProgress?.({
    step: "encoding",
  });
  const imageBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const candidateModels = getGroqCandidateModels();
  let availableModels = candidateModels.filter(
    (model) => (modelCooldownUntil.get(model) ?? 0) <= Date.now()
  );

  if (availableModels.length === 0) {
    const waitMs = getCooldownWaitMs(candidateModels);

    if (waitMs > 0) {
      await delay(waitMs);
    }

    availableModels = [...candidateModels];
  }

  const modelsToTry = [...availableModels];
  const maxRetries = Math.max(0, appEnv.aiMaxRetries);
  let lastError: GeminiRequestErrorShape | null = null;
  let timedOut = false;

  groqModelLoop:
  for (const model of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (Date.now() >= deadlineAt) {
        lastError = {
          status: 408,
          model: `groq:${model}`,
          message: `AI scan timed out after ${Math.ceil(totalScanTimeoutMs / 1000)}s.`,
        };
        timedOut = true;
        break groqModelLoop;
      }

      try {
        const responsePayload = await requestGeminiResponsePayload(
          file,
          imageBase64,
          model,
          promptText,
          onProgress,
          attempt + 1
        );

        geminiUsageState.last_error = null;
        return responsePayload;
      } catch (error) {
        const normalizedError = toGeminiRequestErrorShape(error, `groq:${model}`);
        lastError = normalizedError;
        geminiUsageState.last_error = normalizedError.message;

        const isRateLimited = normalizedError.status === 429;
        const isTransientError =
          normalizedError.status >= 500 ||
          normalizedError.status === 0 ||
          normalizedError.status === 408;
        const canRetry = attempt < maxRetries && isTransientError;

        if (canRetry) {
          geminiUsageState.total_retries += 1;
          const retryDelayMs = Math.min(4_000, 600 * (attempt + 1));

          if (Date.now() + retryDelayMs >= deadlineAt) {
            timedOut = true;
            lastError = {
              status: 408,
              model: `groq:${model}`,
              message: `AI scan timed out after ${Math.ceil(totalScanTimeoutMs / 1000)}s.`,
            };
            break groqModelLoop;
          }

          onProgress?.({
            step: "retry_wait",
            model: `groq:${model}`,
            attempt: attempt + 1,
            retryDelayMs,
          });
          await delay(retryDelayMs);
          continue;
        }

        if (isRateLimited) {
          modelCooldownUntil.set(model, Date.now() + appEnv.aiCooldownMs);
        }

        break;
      }
    }
  }

  if (!timedOut && appEnv.openRouterApiKey.trim()) {
    const qwenFallbackModels = getOpenRouterQwenFallbackModels();

    if (qwenFallbackModels.length > 0) {
      onProgress?.({
        step: "fallback_model",
        model: "openrouter-qwen-ocr",
      });

      const ocrText = await extractImageTextWithLocalOcr(file);

      if (ocrText) {
        const fallbackPrompt = buildQwenTextFallbackPrompt(promptText, ocrText);

        for (const model of qwenFallbackModels) {
          for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            if (Date.now() >= deadlineAt) {
              timedOut = true;
              lastError = {
                status: 408,
                model: `openrouter-qwen:${model}`,
                message: `AI scan timed out after ${Math.ceil(totalScanTimeoutMs / 1000)}s.`,
              };
              break;
            }

            try {
              const fallbackResponsePayload = await requestOpenRouterQwenTextPayload(
                model,
                fallbackPrompt,
                onProgress,
                attempt + 1
              );

              geminiUsageState.last_error = null;
              return fallbackResponsePayload;
            } catch (fallbackError) {
              const normalizedFallbackError = toGeminiRequestErrorShape(
                fallbackError,
                `openrouter-qwen:${model}`
              );
              lastError = normalizedFallbackError;
              geminiUsageState.last_error = normalizedFallbackError.message;

              const canRetryFallback =
                attempt < maxRetries &&
                (normalizedFallbackError.status >= 500 ||
                  normalizedFallbackError.status === 0 ||
                  normalizedFallbackError.status === 408 ||
                  normalizedFallbackError.status === 429);

              if (canRetryFallback) {
                geminiUsageState.total_retries += 1;
                const retryDelayMs = Math.min(4_000, 600 * (attempt + 1));

                if (Date.now() + retryDelayMs >= deadlineAt) {
                  timedOut = true;
                  lastError = {
                    status: 408,
                    model: `openrouter-qwen:${model}`,
                    message: `AI scan timed out after ${Math.ceil(totalScanTimeoutMs / 1000)}s.`,
                  };
                  break;
                }

                onProgress?.({
                  step: "retry_wait",
                  model: `openrouter-qwen:${model}`,
                  attempt: attempt + 1,
                  retryDelayMs,
                });
                await delay(retryDelayMs);
                continue;
              }

              break;
            }
          }

          if (timedOut) {
            break;
          }
        }
      }
    }
  }

  geminiUsageState.total_failures += 1;

  if (timedOut || (lastError !== null && lastError.status === 408)) {
    throw new Error(
      `AI scan timed out after ${Math.ceil(totalScanTimeoutMs / 1000)}s. Please tap Retry Scan.`
    );
  }

  if (lastError && isQuotaOrRateLimitErrorMessage(lastError.message)) {
    throw new Error(
      "Groq and Qwen fallback providers are currently rate-limited or unavailable. Please wait about one minute and tap Retry Scan."
    );
  }

  if (lastError) {
    if (lastError.model.startsWith("groq:") && isModelUnavailableError(lastError)) {
      throw new Error(
        `Groq model ${lastError.model.replace("groq:", "")} is unavailable for this request. Update VITE_GROQ_MODEL or VITE_GROQ_MODEL_FALLBACKS.`
      );
    }

    throw new Error(
      `AI request failed (${lastError.status || "network"}) on ${lastError.model}: ${lastError.message}`
    );
  }

  throw new Error(
    "AI request failed: Groq primary and Qwen fallback models were unable to return a usable response."
  );
}

function mapStockInIngredientsToCatalog(
  rawIngredients: unknown,
  catalog: StockInCatalogIngredient[]
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

  const resolveCatalogCandidate = (
    rawName: string,
    rawUnit: string,
    rawCategory: string
  ): StockInCatalogIngredient | null => {
    const normalizedRawName = normalizeText(rawName);

    if (!normalizedRawName) {
      return null;
    }

    const normalizedRawUnit = normalizeText(rawUnit);
    const normalizedRawCategory = normalizeText(rawCategory);
    const exactCatalogKey = `${normalizedRawName}|${normalizedRawUnit}`;
    const exactCatalogMatch = catalogByExactKey.get(exactCatalogKey) ?? null;

    if (exactCatalogMatch) {
      return exactCatalogMatch;
    }

    const nameMatch = catalogByName.get(normalizedRawName) ?? null;

    if (nameMatch) {
      return nameMatch;
    }

    const includesMatch =
      catalog.find((candidate) => {
        const normalizedCandidateName = normalizeText(candidate.name);

        return (
          normalizedCandidateName.includes(normalizedRawName) ||
          normalizedRawName.includes(normalizedCandidateName)
        );
      }) ?? null;

    if (includesMatch) {
      return includesMatch;
    }

    if (normalizedRawCategory) {
      const categoryAnchoredMatches = catalog.filter((candidate) => {
        const normalizedCandidateName = normalizeText(candidate.name);
        const normalizedCandidateCategory = normalizeText(candidate.category);

        return (
          normalizedCandidateName.includes(normalizedRawCategory) ||
          normalizedCandidateCategory === normalizedRawCategory
        );
      });

      if (categoryAnchoredMatches.length === 1) {
        return categoryAnchoredMatches[0];
      }
    }

    let bestCandidate: StockInCatalogIngredient | null = null;
    let bestScore = 0;

    for (const candidate of catalog) {
      const normalizedCandidateName = normalizeText(candidate.name);
      const normalizedCandidateCategory = normalizeText(candidate.category);
      let score = getTokenOverlapScore(rawName, candidate.name);

      if (normalizedRawCategory) {
        score += getTokenOverlapScore(rawCategory, candidate.name) * 0.5;

        if (normalizedCandidateCategory === normalizedRawCategory) {
          score += 0.18;
        }
      }

      if (
        normalizedCandidateName.includes(normalizedRawName) ||
        normalizedRawName.includes(normalizedCandidateName)
      ) {
        score += 0.2;
      }

      if (normalizedRawUnit && normalizeText(candidate.unit) === normalizedRawUnit) {
        score += 0.12;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (bestScore >= 0.34) {
      return bestCandidate;
    }

    return null;
  };

  const mergedByKey = new Map<string, IngredientDeduction>();

  for (const rawIngredient of rawIngredients) {
    if (!rawIngredient || typeof rawIngredient !== "object") {
      continue;
    }

    const record = rawIngredient as Record<string, unknown>;
    const rawName = toNonEmptyString(record.item_name ?? record.name, "");
    const rawUnit = toNonEmptyString(record.unit, "");
    const rawCategory = toNonEmptyString(record.category, "");

    if (!rawName) {
      continue;
    }

    const matchedCatalog = resolveCatalogCandidate(rawName, rawUnit, rawCategory);

    if (!matchedCatalog) {
      continue;
    }

    const parsedQuantity = Number(record.quantity);
    const hasExplicitQuantity =
      Number.isFinite(parsedQuantity) && parsedQuantity > 0;
    const quantity = hasExplicitQuantity
      ? clampQuantity(parsedQuantity, 0.05, 500)
      : 0;

    const resolvedQuantity =
      quantity > 0 ? Number(quantity.toFixed(3)) : 0;
    const mergedKey = `${normalizeText(matchedCatalog.name)}|${normalizeText(matchedCatalog.unit)}`;
    const existing = mergedByKey.get(mergedKey);

    if (existing) {
      if (resolvedQuantity > 0) {
        existing.quantity = Number((existing.quantity + resolvedQuantity).toFixed(3));
      }
      continue;
    }

    mergedByKey.set(mergedKey, {
      item_name: matchedCatalog.name,
      category: matchedCatalog.category,
      unit: matchedCatalog.unit,
      quantity: resolvedQuantity,
    });
  }

  return [...mergedByKey.values()];
}

export async function detectIngredientsWithGemini(
  file: File,
  onProgress?: (event: AiModelProgressEvent) => void,
  options: GeminiScanOptions = {}
): Promise<GeminiDetectionResult> {
  assertAiProviderConfigured();

  if (!options.skipQualityGate) {
    await assertImageQualityForAi(file);
    onProgress?.({
      step: "quality_check",
    });
  }
  const responsePayload = await requestGeminiPayloadWithFallback(
    file,
    INVENTORY_ANALYSIS_PROMPT,
    onProgress
  );
  onProgress?.({
    step: "parsing",
  });

  return parseGeminiResponsePayload(responsePayload);
}

export async function detectStockInWithCatalogGemini(
  file: File,
  ingredientCatalog: StockInCatalogIngredient[],
  onProgress?: (event: AiModelProgressEvent) => void,
  options: GeminiScanOptions = {}
): Promise<GeminiDetectionResult> {
  assertAiProviderConfigured();

  if (ingredientCatalog.length === 0) {
    throw new Error("Ingredient catalog is required for stock-in scanning.");
  }

  if (!options.skipQualityGate) {
    await assertImageQualityForAi(file);
    onProgress?.({
      step: "quality_check",
    });
  }
  const prompt = buildStockInCatalogPrompt(ingredientCatalog);
  let responsePayload: unknown;

  try {
    responsePayload = await requestGeminiPayloadWithFallback(
      file,
      prompt,
      onProgress
    );
  } catch (requestError) {
    if (!isOpenRouterResponseContentIssue(requestError)) {
      throw requestError;
    }

    // Retry once with a shorter prompt when content extraction failed.
    const recoveryPrompt = buildStockInCatalogRecoveryPrompt(ingredientCatalog);
    responsePayload = await requestGeminiPayloadWithFallback(
      file,
      recoveryPrompt,
      onProgress
    );
  }

  onProgress?.({
    step: "parsing",
  });
  const parsed = parseGeminiPayloadAsRecord(responsePayload);
  const rawQuantityEstimate = Number(parsed.quantity_estimate);
  const quantityEstimate =
    Number.isFinite(rawQuantityEstimate) && rawQuantityEstimate > 0
      ? clampQuantity(rawQuantityEstimate, 0.05, 500)
      : 0;

  const ingredients = mapStockInIngredientsToCatalog(
    parsed.ingredients_to_deduct,
    ingredientCatalog
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
    unit: toNonEmptyString(
      parsed.unit,
      quantityEstimate > 0 ? "batch" : "N/A"
    ),
    ingredients_to_deduct: ingredients,
  };
}

export async function classifyProductWithCatalogGemini(
  file: File,
  productCatalog: ProductCatalogCandidate[],
  onProgress?: (event: AiModelProgressEvent) => void,
  options: GeminiScanOptions = {}
): Promise<GeminiProductClassificationResult> {
  assertAiProviderConfigured();

  if (productCatalog.length === 0) {
    throw new Error("Product catalog is required for stock-out scanning.");
  }

  if (!options.skipQualityGate) {
    await assertImageQualityForAi(file);
    onProgress?.({
      step: "quality_check",
    });
  }
  const prompt = buildProductCatalogPrompt(productCatalog);
  const responsePayload = await requestGeminiPayloadWithFallback(
    file,
    prompt,
    onProgress
  );
  onProgress?.({
    step: "parsing",
  });
  const parsed = parseGeminiPayloadAsRecord(responsePayload);
  const rawProductName = toNonEmptyString(parsed.product_name, "");
  const matchedProduct = resolveProductCandidate(rawProductName, productCatalog);

  if (!matchedProduct) {
    throw new Error(
      "AI could not confidently match the image to a known product. Please select product manually."
    );
  }

  const calibratedConfidence = calibrateProductClassificationConfidence(
    toConfidenceLevel(parsed.confidence),
    matchedProduct
  );

  const quantityEstimate = clampQuantity(
    toPositiveNumber(parsed.quantity_estimate, 1),
    0.05,
    100
  );

  return {
    product_id: matchedProduct.candidate.id,
    product_name: matchedProduct.candidate.name,
    category: matchedProduct.candidate.category,
    confidence: calibratedConfidence,
    quantity_estimate: Number(quantityEstimate.toFixed(3)),
    unit: "serving",
  };
}

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

export async function detectIngredientsWithGemini(
  file: File
): Promise<GeminiDetectionResult> {
  assertRuntimeEnv(["VITE_GEMINI_API_KEY"]);

  const endpoint = `${GEMINI_API_BASE}/models/${appEnv.geminiModel}:generateContent?key=${appEnv.geminiApiKey}`;
  const imageBase64 = arrayBufferToBase64(await file.arrayBuffer());
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

    throw new Error(
      `Gemini request failed (${response.status}): ${geminiError ?? "Unknown Gemini API error."}`
    );
  }

  const responseText =
    responsePayload?.candidates?.[0]?.content?.parts?.find(
      (part: { text?: unknown }) => typeof part.text === "string"
    )?.text ?? "";

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

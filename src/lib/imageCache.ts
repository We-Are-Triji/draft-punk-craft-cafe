import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CachedImageResult, ConfidenceLevel } from "@/types/inventory";

const SEMANTIC_CACHE_STORAGE_KEY = "draft-punk-semantic-scan-cache-v1";

interface SemanticScanCacheEntry {
  scope: string;
  signature: string;
  payload: unknown;
  created_at: number;
}

function toPositiveNumber(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return parsed;
}

function toConfidenceLevel(value: unknown): ConfidenceLevel {
  if (typeof value === "number") {
    if (value >= 0.8) {
      return "high";
    }

    if (value >= 0.5) {
      return "medium";
    }

    return "low";
  }

  const normalized = String(value ?? "").toLowerCase();

  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }

  return "medium";
}

function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) {
    return Number.MAX_SAFE_INTEGER;
  }

  let distance = 0;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }

  return distance;
}

function loadSemanticCacheEntries(): SemanticScanCacheEntry[] {
  try {
    const raw = localStorage.getItem(SEMANTIC_CACHE_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is SemanticScanCacheEntry => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        const record = entry as Record<string, unknown>;

        return (
          typeof record.scope === "string" &&
          typeof record.signature === "string" &&
          typeof record.created_at === "number"
        );
      })
      .slice(-200);
  } catch {
    return [];
  }
}

function saveSemanticCacheEntries(entries: SemanticScanCacheEntry[]): void {
  try {
    localStorage.setItem(
      SEMANTIC_CACHE_STORAGE_KEY,
      JSON.stringify(entries.slice(-200))
    );
  } catch {
    // Intentionally ignore local storage errors.
  }
}

async function decodeImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageElement = new Image();
      imageElement.onload = () => resolve(imageElement);
      imageElement.onerror = () => reject(new Error("Failed to decode image."));
      imageElement.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function computeImageSemanticSignature(file: File): Promise<string> {
  const imageElement = await decodeImage(file);
  const canvas = document.createElement("canvas");
  const width = 8;
  const height = 8;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Unable to compute image signature.");
  }

  context.drawImage(imageElement, 0, 0, width, height);
  const pixelData = context.getImageData(0, 0, width, height).data;
  const grayValues: number[] = [];

  for (let index = 0; index < pixelData.length; index += 4) {
    const gray =
      0.299 * pixelData[index] +
      0.587 * pixelData[index + 1] +
      0.114 * pixelData[index + 2];
    grayValues.push(gray);
  }

  const average = grayValues.reduce((sum, value) => sum + value, 0) / grayValues.length;

  return grayValues
    .map((value) => (value >= average ? "1" : "0"))
    .join("");
}

export function findSemanticCachedPayload<T>(
  scope: string,
  signature: string,
  options?: {
    maxHammingDistance?: number;
    ttlMs?: number;
  }
): T | null {
  const maxHammingDistance = options?.maxHammingDistance ?? 8;
  const ttlMs = options?.ttlMs ?? 1000 * 60 * 60 * 24 * 14;
  const now = Date.now();

  const entries = loadSemanticCacheEntries().filter((entry) => {
    if (entry.scope !== scope) {
      return false;
    }

    return now - entry.created_at <= ttlMs;
  });

  let bestEntry: SemanticScanCacheEntry | null = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  for (const entry of entries) {
    const distance = hammingDistance(entry.signature, signature);

    if (distance < bestDistance && distance <= maxHammingDistance) {
      bestDistance = distance;
      bestEntry = entry;
    }
  }

  return (bestEntry?.payload as T | undefined) ?? null;
}

export function upsertSemanticCachedPayload(
  scope: string,
  signature: string,
  payload: unknown
): void {
  const entries = loadSemanticCacheEntries();
  const now = Date.now();
  const filteredEntries = entries.filter(
    (entry) => !(entry.scope === scope && entry.signature === signature)
  );

  filteredEntries.push({
    scope,
    signature,
    payload,
    created_at: now,
  });

  saveSemanticCacheEntries(filteredEntries);
}

export async function hashImageFile(file: File): Promise<string> {
  const imageBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", imageBuffer);

  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function getCachedImageResult(
  imageHash: string
): Promise<CachedImageResult | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("image_cache")
    .select("image_hash, item_name, category, confidence, quantity_estimate, unit")
    .eq("image_hash", imageHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Cache lookup failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    image_hash: data.image_hash,
    item_name: data.item_name,
    category: data.category,
    confidence: toConfidenceLevel(data.confidence),
    quantity_estimate: toPositiveNumber(data.quantity_estimate, 1),
    unit: data.unit,
  };
}

export async function upsertCachedImageResult(
  result: CachedImageResult
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("image_cache").upsert(result, {
    onConflict: "image_hash",
  });

  if (error) {
    throw new Error(`Cache write failed: ${error.message}`);
  }
}

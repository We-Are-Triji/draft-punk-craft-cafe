import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CachedImageResult, ConfidenceLevel } from "@/types/inventory";

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

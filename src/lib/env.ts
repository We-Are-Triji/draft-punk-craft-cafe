const runtimeEnv = import.meta.env as Record<string, string | undefined>;

function toPositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.trunc(parsed);
}

function toModelList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export const appEnv = {
  supabaseUrl: runtimeEnv.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: runtimeEnv.VITE_SUPABASE_ANON_KEY ?? "",
  supabaseStorageBucket: runtimeEnv.VITE_SUPABASE_STORAGE_BUCKET ?? "scan-images",
  geminiApiKey: runtimeEnv.VITE_GEMINI_API_KEY ?? "",
  geminiModel: runtimeEnv.VITE_GEMINI_MODEL ?? "gemini-2.0-flash",
  geminiFallbackModels: toModelList(runtimeEnv.VITE_GEMINI_MODEL_FALLBACKS),
  geminiMinRequestIntervalMs: toPositiveInteger(
    runtimeEnv.VITE_GEMINI_MIN_REQUEST_INTERVAL_MS,
    700
  ),
  geminiMaxRetries: toPositiveInteger(runtimeEnv.VITE_GEMINI_MAX_RETRIES, 2),
  geminiCooldownMs: toPositiveInteger(runtimeEnv.VITE_GEMINI_COOLDOWN_MS, 60_000),
};

export function getMissingEnvVars(keys: string[]): string[] {
  return keys.filter((key) => !runtimeEnv[key]);
}

export function assertRuntimeEnv(keys: string[]): void {
  const missing = getMissingEnvVars(keys);

  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}. Create a local .env file based on .env.example.`
  );
}

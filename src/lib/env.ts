const runtimeEnv = import.meta.env as Record<string, string | undefined>;

function toPositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.trunc(parsed);
}

function toNonNegativeInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackValue;
  }

  return Math.trunc(parsed);
}

function toBoolean(value: string | undefined, fallbackValue: boolean): boolean {
  if (value === undefined) {
    return fallbackValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallbackValue;
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
  groqApiKey: runtimeEnv.VITE_GROQ_API_KEY ?? "",
  groqApiBase: runtimeEnv.VITE_GROQ_API_BASE ?? "https://api.groq.com/openai/v1",
  groqModel:
    runtimeEnv.VITE_GROQ_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
  groqFallbackModels: toModelList(runtimeEnv.VITE_GROQ_MODEL_FALLBACKS),
  openRouterApiKey: runtimeEnv.VITE_OPENROUTER_API_KEY ?? "",
  openRouterApiBase:
    runtimeEnv.VITE_OPENROUTER_API_BASE ?? "https://openrouter.ai/api/v1",
  openRouterQwenFallbackModels: toModelList(
    runtimeEnv.VITE_OPENROUTER_QWEN_FALLBACK_MODELS
  ),
  aiRequestTimeoutMs: toPositiveInteger(runtimeEnv.VITE_AI_REQUEST_TIMEOUT_MS, 25_000),
  aiTotalScanTimeoutMs: toPositiveInteger(runtimeEnv.VITE_AI_TOTAL_SCAN_TIMEOUT_MS, 60_000),
  aiMinRequestIntervalMs: toPositiveInteger(
    runtimeEnv.VITE_AI_MIN_REQUEST_INTERVAL_MS,
    1_000
  ),
  aiMaxRetries: toNonNegativeInteger(runtimeEnv.VITE_AI_MAX_RETRIES, 1),
  aiMaxOutputTokens: toPositiveInteger(runtimeEnv.VITE_AI_MAX_OUTPUT_TOKENS, 720),
  aiForceJsonResponse: toBoolean(runtimeEnv.VITE_AI_FORCE_JSON_RESPONSE, true),
  aiCooldownMs: toPositiveInteger(runtimeEnv.VITE_AI_COOLDOWN_MS, 45_000),
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

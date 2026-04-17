const runtimeEnv = import.meta.env as Record<string, string | undefined>;

function toPositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
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
  openRouterApiKey:
    runtimeEnv.VITE_OPENROUTER_API_KEY ?? runtimeEnv.VITE_GEMINI_API_KEY ?? "",
  openRouterApiBase:
    runtimeEnv.VITE_OPENROUTER_API_BASE ?? "https://openrouter.ai/api/v1",
  openRouterModel:
    runtimeEnv.VITE_OPENROUTER_MODEL ??
    runtimeEnv.VITE_GEMINI_MODEL ??
    "nvidia/nemotron-nano-12b-v2-vl:free",
  openRouterFallbackModels: toModelList(
    runtimeEnv.VITE_OPENROUTER_MODEL_FALLBACKS ??
      runtimeEnv.VITE_GEMINI_MODEL_FALLBACKS
  ),
  openRouterMinRequestIntervalMs: toPositiveInteger(
    runtimeEnv.VITE_OPENROUTER_MIN_REQUEST_INTERVAL_MS ??
      runtimeEnv.VITE_GEMINI_MIN_REQUEST_INTERVAL_MS,
    700
  ),
  openRouterMaxModelsPerRequest: toPositiveInteger(
    runtimeEnv.VITE_OPENROUTER_MAX_MODELS_PER_REQUEST ??
      runtimeEnv.VITE_GEMINI_MAX_MODELS_PER_REQUEST,
    1
  ),
  openRouterMaxRetries: toPositiveInteger(
    runtimeEnv.VITE_OPENROUTER_MAX_RETRIES ?? runtimeEnv.VITE_GEMINI_MAX_RETRIES,
    1
  ),
  openRouterMaxOutputTokens: toPositiveInteger(
    runtimeEnv.VITE_OPENROUTER_MAX_OUTPUT_TOKENS,
    320
  ),
  openRouterForceJsonResponse: toBoolean(
    runtimeEnv.VITE_OPENROUTER_FORCE_JSON_RESPONSE,
    true
  ),
  openRouterCooldownMs: toPositiveInteger(
    runtimeEnv.VITE_OPENROUTER_COOLDOWN_MS ?? runtimeEnv.VITE_GEMINI_COOLDOWN_MS,
    60_000
  ),
  openRouterSiteUrl: runtimeEnv.VITE_OPENROUTER_SITE_URL ?? "",
  openRouterSiteName: runtimeEnv.VITE_OPENROUTER_SITE_NAME ?? "",
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

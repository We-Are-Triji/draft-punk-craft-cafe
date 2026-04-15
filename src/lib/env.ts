const runtimeEnv = import.meta.env as Record<string, string | undefined>;

export const appEnv = {
  supabaseUrl: runtimeEnv.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: runtimeEnv.VITE_SUPABASE_ANON_KEY ?? "",
  supabaseStorageBucket: runtimeEnv.VITE_SUPABASE_STORAGE_BUCKET ?? "scan-images",
  geminiApiKey: runtimeEnv.VITE_GEMINI_API_KEY ?? "",
  geminiModel: runtimeEnv.VITE_GEMINI_MODEL ?? "gemini-2.0-flash",
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

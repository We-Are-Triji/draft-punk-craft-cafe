import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appEnv, assertRuntimeEnv } from "@/lib/env";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  assertRuntimeEnv(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);

  if (!supabaseClient) {
    supabaseClient = createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseClient;
}

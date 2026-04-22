import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appEnv, assertRuntimeEnv } from "@/lib/env";

let supabaseClient: SupabaseClient | null = null;
const REMEMBER_ME_STORAGE_KEY = "draftpunk.rememberMe";
const inMemoryStorage = new Map<string, string>();

type AuthStorageMode = "local" | "session";

let authStorageMode: AuthStorageMode = "local";
let authStorageModeInitialized = false;

function readRememberPreferenceFromBrowser(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const stored = window.localStorage.getItem(REMEMBER_ME_STORAGE_KEY);
  return stored !== "0";
}

function initializeAuthStorageMode(): void {
  if (authStorageModeInitialized) {
    return;
  }

  authStorageModeInitialized = true;
  authStorageMode = readRememberPreferenceFromBrowser() ? "local" : "session";
}

function getAuthStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  if (typeof window !== "undefined") {
    return authStorageMode === "local"
      ? window.localStorage
      : window.sessionStorage;
  }

  return {
    getItem: (key: string) => inMemoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      inMemoryStorage.set(key, value);
    },
    removeItem: (key: string) => {
      inMemoryStorage.delete(key);
    },
  };
}

export function getRememberSessionPreference(): boolean {
  initializeAuthStorageMode();
  return authStorageMode === "local";
}

export function setRememberSessionPreference(remember: boolean): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REMEMBER_ME_STORAGE_KEY, remember ? "1" : "0");
  }

  const nextMode: AuthStorageMode = remember ? "local" : "session";
  authStorageModeInitialized = true;

  if (authStorageMode === nextMode) {
    return;
  }

  authStorageMode = nextMode;
  supabaseClient = null;
}

export function getSupabaseClient(): SupabaseClient {
  assertRuntimeEnv(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
  initializeAuthStorageMode();

  if (!supabaseClient) {
    supabaseClient = createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        storage: getAuthStorage(),
      },
    });
  }

  return supabaseClient;
}

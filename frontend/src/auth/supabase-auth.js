import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const OAUTH_QUERY_KEYS = [
  "code",
  "state",
  "error",
  "error_code",
  "error_description",
];
const OAUTH_HASH_KEYS = [
  "access_token",
  "refresh_token",
  "error",
  "error_description",
];

let supabaseClient = null;

function decodeOAuthMessage(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function isSupabaseOAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getSupabaseClient() {
  if (!isSupabaseOAuthConfigured()) {
    throw new Error(
      "Google sign-in is unavailable. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.",
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

export function buildOAuthRedirectUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

export async function startGoogleOAuthSignIn() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildOAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
}

export function readOAuthCallbackErrorFromUrl() {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  const searchError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  if (searchError) {
    return decodeOAuthMessage(searchError);
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  if (!hash) return "";

  const hashParams = new URLSearchParams(hash);
  const hashError =
    hashParams.get("error_description") || hashParams.get("error");
  return decodeOAuthMessage(hashError);
}

export function clearOAuthCallbackArtifactsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  let hasChanges = false;

  OAUTH_QUERY_KEYS.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      hasChanges = true;
    }
  });

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const hasOAuthHashKeys = OAUTH_HASH_KEYS.some((key) => hashParams.has(key));
    if (hasOAuthHashKeys) {
      url.hash = "";
      hasChanges = true;
    }
  }

  if (hasChanges) {
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextUrl || "/");
  }
}

export async function resolveSupabaseSession() {
  if (!isSupabaseOAuthConfigured()) {
    return { session: null, error: null };
  }

  const supabase = getSupabaseClient();
  const url = new URL(window.location.href);
  const authCode = url.searchParams.get("code");

  if (authCode) {
    const { data, error } =
      await supabase.auth.exchangeCodeForSession(authCode);
    return { session: data?.session || null, error: error || null };
  }

  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session || null, error: error || null };
}

export async function signOutSupabaseSession() {
  if (!isSupabaseOAuthConfigured()) {
    return;
  }

  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}

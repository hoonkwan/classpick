// Lazy Supabase admin client. Returns null when env not set so callers can
// fall back to mock behaviour and the site keeps working in Stage 1.

let cached = null;
let attempted = false;

export async function getSupabaseAdmin() {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    // Dynamic import keeps cold start small and lets endpoints
    // run even when the package isn't installed yet.
    const mod = await import("@supabase/supabase-js");
    cached = mod.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return cached;
  } catch (e) {
    console.error("[supabase] init failed:", e?.message);
    return null;
  }
}

export function supabaseConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

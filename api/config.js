// GET /api/config
// Returns frontend-safe configuration that the static index.html fetches at boot.
// Only public-safe keys (anon, toss client) are exposed here.
import { handlePreflight, methodNotAllowed, clientIp } from "./_lib/cors.js";
import { rateLimit } from "./_lib/ratelimit.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const rl = rateLimit(clientIp(req), 60);
  if (!rl.ok) { res.statusCode = 429; return res.end(JSON.stringify({ ok: false, error: "rate_limit", code: 429 })); }

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    tossClientKey: process.env.TOSS_CLIENT_KEY || null,
    tossMode: process.env.TOSS_SECRET_KEY?.startsWith("live_") ? "live" : "test",
    stage: 1
  }));
}

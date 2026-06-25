// GET /api/health
// Reports which external services are configured (boolean only, no keys leaked).
// Used by frontend cpAPI.boot() to decide mock vs real for each subsystem.
import { handlePreflight, methodNotAllowed, clientIp } from "./_lib/cors.js";
import { rateLimit } from "./_lib/ratelimit.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const rl = rateLimit(clientIp(req), 60);
  if (!rl.ok) { res.statusCode = 429; return res.end(JSON.stringify({ ok: false, error: "rate_limit", code: 429 })); }

  const services = {
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabasePublic: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    aligo: !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER),
    datago: !!process.env.DATAGO_API_KEY,
    toss: !!(process.env.TOSS_SECRET_KEY && process.env.TOSS_CLIENT_KEY),
    jwt: !!process.env.JWT_SECRET
  };

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    version: "0.7.1",
    stage: 1,
    services,
    serverTime: new Date().toISOString()
  }));
}

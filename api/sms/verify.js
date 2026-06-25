// POST /api/sms/verify
// Body: { phone, code, purpose }
// Verifies the SMS code, marks it consumed, returns a short-lived JWT.
import { createHash } from "node:crypto";
import { handlePreflight, methodNotAllowed, readJson, clientIp } from "../_lib/cors.js";
import { rateLimit } from "../_lib/ratelimit.js";
import { getSupabaseAdmin } from "../_lib/supabase.js";
import { signJwt } from "../_lib/jwt.js";

function normalizePhone(p) { return String(p || "").replace(/[^0-9]/g, ""); }
function hashCode(code) { return createHash("sha256").update(String(code)).digest("hex"); }

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const rl = rateLimit(clientIp(req), 20);
  if (!rl.ok) { res.statusCode = 429; return res.end(JSON.stringify({ ok: false, error: "rate_limit", code: 429 })); }

  let body;
  try { body = await readJson(req); } catch (e) {
    res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: "invalid_body", code: 400 }));
  }

  const phone = normalizePhone(body.phone);
  const code = String(body.code || "").trim();
  const purpose = String(body.purpose || "verify").slice(0, 32);
  if (!/^01[016789]\d{7,8}$/.test(phone) || !/^\d{4,8}$/.test(code)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "invalid_input", code: 400 }));
  }

  const supa = await getSupabaseAdmin();
  if (!supa) {
    // Mock mode: accept any code that matches the dev-issued one is impossible from here
    // (we don't store it). For Stage 1 we permit "any 6 digits == 123456" sentinel.
    if (code === "123456") {
      const token = signJwt({ phone, purpose, sms: true }, 300);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, mock: true, token }));
    }
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, mock: true, error: "wrong_code_or_supabase_off", code: 400 }));
  }

  const code_hash = hashCode(code);
  const nowIso = new Date().toISOString();

  // Find a matching unconsumed code (most recent)
  const { data, error } = await supa
    .from("sms_codes")
    .select("id, code_hash, expires_at, consumed")
    .eq("phone", phone)
    .eq("purpose", purpose)
    .eq("consumed", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[sms.verify] supabase select error:", error.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "db_error", code: 500 }));
  }

  const match = (data || []).find((row) => row.code_hash === code_hash);
  if (!match) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "code_mismatch_or_expired", code: 400 }));
  }

  const { error: updErr } = await supa.from("sms_codes").update({ consumed: true }).eq("id", match.id);
  if (updErr) console.error("[sms.verify] update error:", updErr.message);

  const token = signJwt({ phone, purpose, sms: true }, 300);
  res.statusCode = 200;
  return res.end(JSON.stringify({ ok: true, token }));
}

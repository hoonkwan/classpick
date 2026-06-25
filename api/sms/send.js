// POST /api/sms/send
// Body: { phone: "010-1234-5678", purpose: "signup" | "reset" | ... }
// Sends a 6-digit code via Aligo SMS. Mock falls back when keys missing.
import { createHash } from "node:crypto";
import { handlePreflight, methodNotAllowed, readJson, clientIp } from "../_lib/cors.js";
import { rateLimit } from "../_lib/ratelimit.js";
import { getSupabaseAdmin } from "../_lib/supabase.js";

const ALIGO_ENDPOINT = "https://apis.aligo.in/send/";

function normalizePhone(p) {
  return String(p || "").replace(/[^0-9]/g, "");
}
function gen6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function hashCode(code) {
  return createHash("sha256").update(String(code)).digest("hex");
}

async function aligoSend({ phone, message, apikey, userid, sender }) {
  const form = new URLSearchParams();
  form.set("key", apikey);
  form.set("user_id", userid);
  form.set("sender", sender);
  form.set("receiver", phone);
  form.set("msg", message);
  form.set("msg_type", "SMS");
  form.set("testmode_yn", "N");
  const r = await fetch(ALIGO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const j = await r.json().catch(() => ({}));
  return j;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const rl = rateLimit(clientIp(req), 10);
  if (!rl.ok) { res.statusCode = 429; return res.end(JSON.stringify({ ok: false, error: "rate_limit", code: 429 })); }

  let body;
  try { body = await readJson(req); } catch (e) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "invalid_body", code: 400 }));
  }

  const phoneRaw = body.phone;
  const purpose = String(body.purpose || "verify").slice(0, 32);
  const phone = normalizePhone(phoneRaw);
  if (!/^01[016789]\d{7,8}$/.test(phone)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "invalid_phone", code: 400 }));
  }

  const code = gen6();
  const code_hash = hashCode(code);
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Persist to Supabase if configured
  const supa = await getSupabaseAdmin();
  if (supa) {
    const { error } = await supa.from("sms_codes").insert({
      phone, code_hash, purpose, expires_at, consumed: false
    });
    if (error) {
      console.error("[sms.send] supabase insert error:", error.message);
      // continue — we still try to deliver
    }
  }

  const aligoConfigured = !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER);
  if (!aligoConfigured) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      mock: true,
      code, // dev-only: visible so the user can complete the flow without SMS
      expiresAt: expires_at,
      note: "Aligo not configured — running in mock mode. Set ALIGO_API_KEY/ALIGO_USER_ID/ALIGO_SENDER to send real SMS."
    }));
  }

  const message = `[클래스픽] 인증번호 ${code} (5분 이내 입력)`;
  try {
    const r = await aligoSend({
      phone,
      message,
      apikey: process.env.ALIGO_API_KEY,
      userid: process.env.ALIGO_USER_ID,
      sender: process.env.ALIGO_SENDER
    });
    if (Number(r?.result_code) === 1) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, mock: false, expiresAt: expires_at, msgId: r.msg_id || null }));
    }
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: "aligo_failed", code: 502, detail: r?.message || "unknown" }));
  } catch (e) {
    console.error("[sms.send] aligo error:", e?.message);
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: "aligo_error", code: 502 }));
  }
}

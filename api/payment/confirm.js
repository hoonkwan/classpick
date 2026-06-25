// POST /api/payment/confirm
// Body: { paymentKey, orderId, amount }
// Calls Toss confirm API, records payment, upgrades the academy tier.
import { handlePreflight, methodNotAllowed, readJson, clientIp } from "../_lib/cors.js";
import { rateLimit } from "../_lib/ratelimit.js";
import { getSupabaseAdmin } from "../_lib/supabase.js";

const TOSS_CONFIRM = "https://api.tosspayments.com/v1/payments/confirm";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const rl = rateLimit(clientIp(req), 30);
  if (!rl.ok) { res.statusCode = 429; return res.end(JSON.stringify({ ok: false, error: "rate_limit", code: 429 })); }

  let body;
  try { body = await readJson(req); } catch (e) {
    res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: "invalid_body", code: 400 }));
  }

  const paymentKey = String(body.paymentKey || "");
  const orderId = String(body.orderId || "");
  const amount = Number(body.amount || 0);
  if (!orderId || !amount) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "missing_fields", code: 400 }));
  }

  const supa = await getSupabaseAdmin();
  let intent = null;
  if (supa) {
    const { data } = await supa.from("payment_intents").select("*").eq("order_id", orderId).maybeSingle();
    intent = data || null;
    if (intent && intent.amount !== amount) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, error: "amount_mismatch", code: 400 }));
    }
  }

  const tossSecret = process.env.TOSS_SECRET_KEY;
  if (!tossSecret) {
    // Mock confirmation (Stage 1)
    if (supa && intent) {
      await supa.from("payment_intents").update({ status: "confirmed" }).eq("order_id", orderId);
      const { data: pay } = await supa.from("payments").insert({
        order_id: orderId,
        academy_id: intent.academy_id,
        tier: intent.tier,
        amount: intent.amount,
        period: intent.period,
        payment_key: paymentKey || `mock_${Date.now()}`,
        method: "MOCK",
        status: "paid"
      }).select().maybeSingle();
      if (intent.academy_id) {
        await supa.from("profiles").update({ tier: intent.tier, tier_expires_at: new Date(Date.now() + 31 * 86400_000).toISOString() }).eq("id", intent.academy_id);
      }
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, mock: true, payment: pay || { orderId, amount, tier: intent.tier } }));
    }
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      mock: true,
      payment: { orderId, amount, paymentKey: paymentKey || `mock_${Date.now()}`, status: "paid" },
      note: "TOSS_SECRET_KEY not set — mock confirmation."
    }));
  }

  // Real Toss confirmation
  if (!paymentKey) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "missing_payment_key", code: 400 }));
  }

  try {
    const auth = Buffer.from(tossSecret + ":").toString("base64");
    const r = await fetch(TOSS_CONFIRM, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === "ABORTED" || j.code) {
      res.statusCode = 402;
      return res.end(JSON.stringify({ ok: false, error: "toss_rejected", code: 402, detail: j?.message || j?.code || "unknown" }));
    }

    if (supa && intent) {
      await supa.from("payment_intents").update({ status: "confirmed" }).eq("order_id", orderId);
      await supa.from("payments").insert({
        order_id: orderId,
        academy_id: intent.academy_id,
        tier: intent.tier,
        amount: intent.amount,
        period: intent.period,
        payment_key: paymentKey,
        method: j.method || "CARD",
        status: "paid"
      });
      if (intent.academy_id) {
        await supa.from("profiles").update({
          tier: intent.tier,
          tier_expires_at: new Date(Date.now() + 31 * 86400_000).toISOString()
        }).eq("id", intent.academy_id);
      }
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, mock: false, payment: j }));
  } catch (e) {
    console.error("[payment.confirm] error:", e?.message);
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: "toss_error", code: 502 }));
  }
}

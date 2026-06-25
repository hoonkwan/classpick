// POST /api/payment/create
// Body: { academyId, tier, amount, period }
// Creates a pending payment_intent in Supabase and returns Toss requestPayment args.
import { handlePreflight, methodNotAllowed, readJson, clientIp } from "../_lib/cors.js";
import { rateLimit } from "../_lib/ratelimit.js";
import { getSupabaseAdmin } from "../_lib/supabase.js";

const TIER_PRICES = {
  Free: 0,
  Standard: 50000,
  Premium: 175000,
  Enterprise: 450000
};

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

  const academyId = String(body.academyId || "").slice(0, 64);
  const tier = String(body.tier || "");
  const periodStr = String(body.period || "").slice(0, 32);
  const expected = TIER_PRICES[tier];

  if (expected === undefined) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "invalid_tier", code: 400 }));
  }
  // Server is the source of truth for price
  const amount = expected;
  if (amount === 0) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "free_tier_no_payment", code: 400 }));
  }
  if (!academyId) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "missing_academy", code: 400 }));
  }

  const orderId = `cp_${tier}_${academyId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}_${Date.now()}`;

  const supa = await getSupabaseAdmin();
  if (supa) {
    // try as uuid; if academyId is not a uuid (local mock id), pass null
    const academyUuid = /^[0-9a-f-]{36}$/i.test(academyId) ? academyId : null;
    const { error } = await supa.from("payment_intents").insert({
      order_id: orderId,
      academy_id: academyUuid,
      tier,
      amount,
      period: periodStr || null,
      status: "pending"
    });
    if (error) {
      console.error("[payment.create] db error:", error.message);
      // continue — Toss can still be called; we just lose the audit row
    }
  }

  const clientKey = process.env.TOSS_CLIENT_KEY || "test_ck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

  res.statusCode = 200;
  return res.end(JSON.stringify({
    ok: true,
    mock: !process.env.TOSS_SECRET_KEY,
    orderId,
    amount,
    tier,
    period: periodStr || null,
    customerKey: `cp_${academyId}`,
    clientKey,
    orderName: `클래스픽 ${tier} 1개월`
  }));
}

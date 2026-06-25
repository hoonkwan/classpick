// POST /api/business/verify
// Body: { bn: "123-45-67890" }
// Calls 공공데이터포털 국세청 사업자등록정보 진위확인 API.
// Falls back to checksum validation when DATAGO_API_KEY missing.
import { handlePreflight, methodNotAllowed, readJson, clientIp } from "../_lib/cors.js";
import { rateLimit } from "../_lib/ratelimit.js";

// Korean BN checksum (KOSA 표준 검증식)
function checksumValid(bn10) {
  if (!/^\d{10}$/.test(bn10)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += (parseInt(bn10[i], 10) * w[i]);
  s += Math.floor((parseInt(bn10[8], 10) * 5) / 10);
  const check = (10 - (s % 10)) % 10;
  return check === parseInt(bn10[9], 10);
}

function normalizeBn(bn) {
  return String(bn || "").replace(/[^0-9]/g, "");
}

const DATAGO_ENDPOINT = "https://api.odcloud.kr/api/nts-businessman/v1/status";

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

  const bn = normalizeBn(body.bn);
  if (bn.length !== 10) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "invalid_bn_format", code: 400 }));
  }

  const localOk = checksumValid(bn);

  const key = process.env.DATAGO_API_KEY;
  if (!key) {
    // mock: accept checksum-valid numbers only
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: localOk,
      mock: true,
      checksumValid: localOk,
      active: localOk,
      status: localOk ? "01" : "00",
      name: null,
      note: "DATAGO_API_KEY not set — using checksum-only mock validation."
    }));
  }

  try {
    const url = `${DATAGO_ENDPOINT}?serviceKey=${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [bn] })
    });
    const j = await r.json().catch(() => ({}));
    const entry = (j?.data || [])[0];
    if (!entry) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok: false, error: "datago_no_data", code: 502, detail: j?.status_code || j?.msg || null }));
    }
    const status = entry.b_stt_cd || "00";
    const stt = entry.b_stt || "";
    const active = status === "01"; // 01=계속사업자
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      mock: false,
      checksumValid: localOk,
      active,
      status,
      stt,
      taxType: entry.tax_type || null,
      taxTypeCd: entry.tax_type_cd || null,
      name: entry.company_name || null
    }));
  } catch (e) {
    console.error("[business.verify] error:", e?.message);
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: "datago_error", code: 502 }));
  }
}

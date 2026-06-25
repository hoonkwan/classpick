// POST /api/upload/sign
// Body: { academyId, filename, contentType }
// Returns a Supabase Storage signed upload URL. Mock returns a data-URL hint.
import { randomUUID } from "node:crypto";
import { handlePreflight, methodNotAllowed, readJson, clientIp } from "../_lib/cors.js";
import { rateLimit } from "../_lib/ratelimit.js";
import { getSupabaseAdmin } from "../_lib/supabase.js";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp"]);
const BUCKET = "teacher-photos";

function safeExt(filename) {
  const m = String(filename || "").toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (!m) return "jpg";
  if (!ALLOWED_EXT.has(m[1])) return "jpg";
  return m[1];
}

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

  const academyId = String(body.academyId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!academyId) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ ok: false, error: "missing_academy", code: 400 }));
  }

  const ext = safeExt(body.filename);
  const objectName = `${academyId}/${randomUUID()}.${ext}`;

  const supa = await getSupabaseAdmin();
  if (!supa) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      mock: true,
      objectName,
      signedUrl: null,
      publicUrl: null,
      note: "Supabase not configured — uploads will be stored as data: URLs on the client."
    }));
  }

  try {
    const { data: signed, error: signErr } = await supa.storage
      .from(BUCKET)
      .createSignedUploadUrl(objectName);
    if (signErr) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: "sign_failed", code: 500, detail: signErr.message }));
    }
    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(objectName);
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      mock: false,
      objectName,
      signedUrl: signed.signedUrl,
      token: signed.token,
      publicUrl: pub?.publicUrl || null
    }));
  } catch (e) {
    console.error("[upload.sign] error:", e?.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: "upload_sign_error", code: 500 }));
  }
}

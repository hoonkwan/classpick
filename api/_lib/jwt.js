// Minimal HMAC-SHA256 JWT (HS256) implementation without external deps.
// Used for SMS-verified short-lived tokens (5 min).
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = () => process.env.JWT_SECRET || "classpick-dev-secret-change-me";

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

export function signJwt(payload, expiresInSec = 300) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expiresInSec, ...payload };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(body));
  const sig = createHmac("sha256", SECRET()).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64urlEncode(sig)}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== "string") return { ok: false, error: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [h, p, s] = parts;
  const expected = createHmac("sha256", SECRET()).update(`${h}.${p}`).digest();
  const provided = b64urlDecode(s);
  if (expected.length !== provided.length) return { ok: false, error: "bad_signature" };
  if (!timingSafeEqual(expected, provided)) return { ok: false, error: "bad_signature" };
  try {
    const body = JSON.parse(b64urlDecode(p).toString("utf8"));
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return { ok: false, error: "expired" };
    return { ok: true, payload: body };
  } catch (e) {
    return { ok: false, error: "bad_payload" };
  }
}

// CORS + OPTIONS preflight helper for all serverless endpoints.
// Same-origin in production, but explicit headers keep curl/admin tools working.

export function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
}

// Returns true when caller should stop handling the request (OPTIONS preflight).
export function handlePreflight(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function methodNotAllowed(res, allowed = ["POST"]) {
  res.setHeader("Allow", allowed.join(", "));
  res.statusCode = 405;
  res.end(JSON.stringify({ ok: false, error: "method_not_allowed", code: 405 }));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => { buf += chunk; if (buf.length > 1e6) { req.destroy(); reject(new Error("payload_too_large")); } });
    req.on("end", () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error("invalid_json")); }
    });
    req.on("error", reject);
  });
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

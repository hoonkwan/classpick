/* 클래스픽 백엔드 어댑터 — supabase-js 없이 REST 로 직접 호출 (외부 동기 스크립트 0)
 *  mode "live" : data/config.js 에 클래스픽 전용 Supabase 주소·공개키가 있을 때
 *  mode "mock" : 설정이 없고 localhost/파일로 열었을 때 — localStorage 모의 백엔드 (시연·개발용)
 *  mode "off"  : 설정이 없는 운영 사이트 — 공개 화면은 정적 데이터만, 등록은 메일 신청
 */
(function () {
  "use strict";
  var cfg = window.CP_CONFIG || {};
  var URL_ = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = String(cfg.supabaseKey || "");
  var host = location.hostname;
  var local = location.protocol === "file:" || host === "localhost" || host === "127.0.0.1";
  var mode = URL_ && KEY ? "live" : (local ? "mock" : "off");
  var jwtRole = ""; try { if (/^eyJ/.test(KEY)) jwtRole = JSON.parse(atob(KEY.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || ""; } catch (e) {}
  if (jwtRole === "service_role" || /^sb_secret_/.test(KEY)) { mode = "off"; console.error("[classpick] service key 는 클라이언트에 넣을 수 없습니다"); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  function withTimeout(ms) { var c = typeof AbortController !== "undefined" ? new AbortController() : null; var t = setTimeout(function () { if (c) c.abort(); }, ms); return { signal: c && c.signal, done: function () { clearTimeout(t); } }; }
  async function req(path, opt, ms) {
    opt = opt || {}; var to = withTimeout(ms || 15000);
    var h = Object.assign({ apikey: KEY, Authorization: "Bearer " + (opt.token || KEY) }, opt.headers || {});
    try {
      var r = await fetch(URL_ + path, { method: opt.method || "GET", headers: h, body: opt.body, signal: to.signal });
      if (!r.ok) { var tx = ""; try { tx = await r.text(); } catch (e) {} var err = new Error("HTTP " + r.status + " " + tx.slice(0, 200)); err.status = r.status; throw err; }
      var ct = r.headers.get("content-type") || "";
      if (opt.blob) return await r.blob();
      return ct.indexOf("json") >= 0 ? await r.json() : await r.text();
    } finally { to.done(); }
  }
  var J = { "Content-Type": "application/json" };

  /* ───────── 관리자 세션 (탭을 닫으면 사라짐) ───────── */
  var SKEY = "classpick:admin-session:v1";
  function session() { try { var s = JSON.parse(sessionStorage.getItem(SKEY) || "null"); if (s && s.exp > Date.now()) return s; } catch (e) {} return null; }
  function setSession(s) { try { s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY); } catch (e) {} }

  /* ───────── 모의 백엔드 (localStorage) ───────── */
  var MKEY = "classpick:mock-backend:v1";
  function mget() { try { return JSON.parse(localStorage.getItem(MKEY) || "null") || { subs: [], contacts: {}, pub: { academies: [], teachers: [], courses: [] }, photos: {}, log: [] }; } catch (e) { return { subs: [], contacts: {}, pub: { academies: [], teachers: [], courses: [] }, photos: {}, log: [] }; } }
  function mset(d) { localStorage.setItem(MKEY, JSON.stringify(d)); }
  function blobToDataURL(b) { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = no; fr.readAsDataURL(b); }); }
  function stripT(n) { return String(n || "").replace(/[\s\-–·(]*[가-힣]{2,4}\s*(?:T|쌤|선생님)(?=$|[\s)\/·,\-–])\)?/g, " ").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim(); }

  /* ───────── 공통: 사진 검사 (업로드 전 클라이언트 측) ───────── */
  var MAX_UPLOAD = 1024 * 1024; // 서버 버킷 제한과 동일 1MB
  function checkBlob(b) {
    if (!b) return;
    if (["image/webp", "image/jpeg", "image/png"].indexOf(b.type) < 0) throw new Error("사진 형식은 webp·jpg·png 만 가능합니다");
    if (b.size > MAX_UPLOAD) throw new Error("사진 용량이 1MB 를 넘습니다");
  }

  /* ───────── 공개: 승인된 데이터 읽기 (첫 화면을 막지 않음 · 4초 제한) ───────── */
  async function fetchPublished() {
    if (mode === "mock") { var d = mget(), pub = function (l) { return l.filter(function (x) { return x.status === "published"; }); }; return JSON.parse(JSON.stringify({ academies: pub(d.pub.academies), teachers: pub(d.pub.teachers), courses: pub(d.pub.courses) })); }
    if (mode !== "live") return null;
    var q = "?status=eq.published&select=*";
    var r = await Promise.all([
      req("/rest/v1/pub_academies" + q, {}, 4000),
      req("/rest/v1/pub_teachers" + q, {}, 4000),
      req("/rest/v1/pub_courses" + q, {}, 4000)
    ]);
    return { academies: r[0], teachers: r[1], courses: r[2] };
  }

  /* ───────── 공개: 등록 제출 (모두 승인 대기) ─────────
   * bundle = { contact:{name,phone,email}, website(허니팟),
   *            academy:{op,target_id,payload,logoBlob}, teachers:[{op,target_id,payload,photoBlob}], courses:[{op,target_id,payload}] } */
  async function submitBundle(bundle) {
    if (bundle.website) throw new Error("잘못된 요청입니다");
    var batch = uuid(), rows = [];
    var all = [];
    if (bundle.academy) all.push(["academy", bundle.academy, bundle.academy.logoBlob]);
    (bundle.teachers || []).forEach(function (t) { all.push(["teacher", t, t.photoBlob]); });
    (bundle.courses || []).forEach(function (c) { all.push(["course", c, null]); });
    if (!all.length) throw new Error("등록할 내용이 없습니다");
    if (all.length > 60) throw new Error("한 번에 60개까지 보낼 수 있습니다");
    all.forEach(function (x) { checkBlob(x[2]); });
    if (mode === "mock") {
      var d = mget(), recent = d.subs.filter(function (s) { return Date.now() - s.t < 600000; }).length;
      if (recent >= 40) throw new Error("잠시 후 다시 시도해 주세요");
      for (var i = 0; i < all.length; i++) {
        var x = all[i], path = null;
        if (x[2]) { path = batch + "/" + uuid() + ".webp"; d.photos[path] = await blobToDataURL(x[2]); }
        var pl = JSON.parse(JSON.stringify(x[1].payload || {}));
        if (x[0] === "course" && pl.name) pl.name = stripT(pl.name);
        d.subs.push({ id: uuid(), batch_id: batch, kind: x[0], op: x[1].op || "create", target_id: x[1].target_id || null, payload: pl, photo_path: path, status: "pending", reject_reason: null, published_id: null, created_at: new Date().toISOString(), t: Date.now() });
      }
      d.contacts[batch] = bundle.contact || {};
      mset(d);
      return { batch_id: batch, count: all.length };
    }
    if (mode !== "live") throw new Error("온라인 등록이 아직 열리지 않았습니다");
    for (var j = 0; j < all.length; j++) {
      var y = all[j], p = null;
      if (y[2]) {
        var ext = y[2].type === "image/png" ? "png" : y[2].type === "image/jpeg" ? "jpg" : "webp";
        p = batch + "/" + uuid() + "." + ext;
        await req("/storage/v1/object/pending-photos/" + p, { method: "POST", headers: { "Content-Type": y[2].type, "x-upsert": "false" }, body: y[2] });
      }
      rows.push({ batch_id: batch, kind: y[0], op: y[1].op || "create", target_id: y[1].target_id || null, payload: y[1].payload || {}, photo_path: p });
    }
    // 공개 사용자는 SELECT 권한이 없으므로 return=minimal
    await req("/rest/v1/submissions", { method: "POST", headers: Object.assign({ Prefer: "return=minimal" }, J), body: JSON.stringify(rows) });
    var c = bundle.contact || {};
    await req("/rest/v1/submission_contacts", { method: "POST", headers: Object.assign({ Prefer: "return=minimal" }, J), body: JSON.stringify({ batch_id: batch, contact_name: c.name || null, contact_phone: c.phone || null, contact_email: c.email || null }) });
    return { batch_id: batch, count: rows.length };
  }

  /* ───────── 관리자 ───────── */
  var MOCK_PW = "classpick-demo";
  async function login(email, pw) {
    if (mode === "mock") {
      if (pw !== MOCK_PW) throw new Error("비밀번호가 틀렸습니다 (모의 모드)");
      var s = { token: "mock", email: email || "admin@local", exp: Date.now() + 8 * 3600e3 }; setSession(s); return s;
    }
    if (mode !== "live") throw new Error("관리자 기능은 백엔드 설정 후 사용할 수 있습니다");
    var r = await req("/auth/v1/token?grant_type=password", { method: "POST", headers: J, body: JSON.stringify({ email: email, password: pw }) });
    var ss = { token: r.access_token, email: r.user && r.user.email, exp: Date.now() + (r.expires_in || 3600) * 1000 - 60000 };
    // 관리자 여부 확인 (admins 에 없으면 거부)
    var ok = await req("/rest/v1/rpc/is_admin", { method: "POST", token: ss.token, headers: J, body: "{}" });
    if (ok !== true) throw new Error("관리자 계정이 아닙니다");
    setSession(ss); return ss;
  }
  function logout() { setSession(null); }
  function tok() { var s = session(); if (!s) { var e = new Error("다시 로그인해 주세요"); e.status = 401; throw e; } return s.token; }

  async function listSubmissions(status) {
    if (mode === "mock") { tok(); return mget().subs.filter(function (s) { return !status || s.status === status; }).sort(function (a, b) { return a.t - b.t; }); }
    return req("/rest/v1/submissions?select=*" + (status ? "&status=eq." + status : "") + "&order=created_at.asc&limit=500", { token: tok() });
  }
  async function getContact(batch) {
    if (mode === "mock") { tok(); return mget().contacts[batch] || {}; }
    var r = await req("/rest/v1/submission_contacts?batch_id=eq." + batch + "&select=*", { token: tok() });
    var c = r[0] || {}; return { name: c.contact_name, phone: c.contact_phone, email: c.contact_email };
  }
  async function pendingPhotoURL(path) {
    if (!path) return "";
    if (mode === "mock") { tok(); return mget().photos[path] || ""; }
    var b = await req("/storage/v1/object/authenticated/pending-photos/" + path, { token: tok(), blob: true });
    return URL.createObjectURL(b);
  }
  async function uploadPublic(blob, folder) {
    checkBlob(blob);
    if (mode === "mock") { tok(); return await blobToDataURL(blob); }
    var p = (folder || "misc") + "/" + uuid() + ".webp";
    await req("/storage/v1/object/public-photos/" + p, { method: "POST", token: tok(), headers: { "Content-Type": blob.type }, body: blob });
    return URL_ + "/storage/v1/object/public/public-photos/" + p;
  }
  async function pendingBlob(path) {
    if (mode === "mock") { var u = mget().photos[path]; if (!u) return null; return await (await fetch(u)).blob(); }
    return req("/storage/v1/object/authenticated/pending-photos/" + path, { token: tok(), blob: true });
  }
  /* 승인 — 사진이 있으면 공개 버킷으로 옮긴 뒤 RPC */
  async function approve(sub, edits, replaceBlob) {
    var photoUrl = null;
    var blob = replaceBlob || (sub.photo_path ? await pendingBlob(sub.photo_path) : null);
    if (blob) photoUrl = await uploadPublic(blob, sub.kind === "academy" ? "logos" : "teachers");
    if (mode === "mock") return mockApprove(sub.id, edits, photoUrl);
    return req("/rest/v1/rpc/approve_submission", { method: "POST", token: tok(), headers: J, body: JSON.stringify({ p_id: sub.id, p_edits: edits || null, p_photo_url: photoUrl }) });
  }
  function mockApprove(id, edits, photoUrl) {
    tok(); var d = mget(), s = d.subs.filter(function (x) { return x.id === id; })[0];
    if (!s || s.status !== "pending") throw new Error("이미 처리된 항목입니다");
    var pl = edits || s.payload, pid, acad;
    var batchAcad = d.subs.filter(function (x) { return x.batch_id === s.batch_id && x.kind === "academy" && x.status === "approved"; })[0];
    function upsert(list, row) { var i = list.findIndex(function (x) { return x.id === row.id; }); if (i >= 0) { Object.keys(row).forEach(function (k) { if (row[k] !== "" || !(k === "photo_url" || k === "logo_url")) list[i][k] = row[k]; }); } else list.push(row); }
    if (s.kind === "academy") {
      pid = s.target_id || "ac-" + id.replace(/-/g, "").slice(0, 10);
      upsert(d.pub.academies, { id: pid, name: pl.name, branch: pl.branch || "", area: pl.area, logo_url: photoUrl || pl.logo_url || "", site: pl.site || "", kind: pl.kind || "academy", license: pl.license || "", tel: pl.tel || "", tagline: pl.tagline || "", status: "published" });
    } else if (s.kind === "teacher") {
      acad = pl.academy_id || (batchAcad && batchAcad.published_id) || null;
      pid = s.target_id || "tc-" + id.replace(/-/g, "").slice(0, 10);
      upsert(d.pub.teachers, { id: pid, academy_id: acad, name: pl.name, subject: pl.subject || "", quote: pl.quote || "", bio: pl.bio || "", photo_url: photoUrl || "", status: "published" });
    } else {
      acad = pl.academy_id || (batchAcad && batchAcad.published_id);
      if (!acad) throw new Error("이 수업의 학원을 먼저 승인해 주세요");
      var a = d.pub.academies.filter(function (x) { return x.id === acad; })[0];
      pid = s.target_id || "cs-" + id.replace(/-/g, "").slice(0, 10);
      upsert(d.pub.courses, { id: pid, academy_id: acad, area: pl.area || (a && a.area) || "센텀", subject: pl.subject, prog: pl.prog || "", name: pl.name, target: pl.target || "", grade: pl.grade || "", school: pl.school || "", level: pl.level || "", sections: pl.sections || [], freq: pl.freq || "", content: pl.content || "", teacher: pl.teacher || "", start_text: pl.start || "", months: pl.months || [], details: pl.details || {}, status: "published" });
    }
    s.status = "approved"; s.payload = pl; s.published_id = pid; s.decided_at = new Date().toISOString();
    d.log.push({ at: s.decided_at, action: "approve", target: s.kind + ":" + pid });
    mset(d); return pid;
  }
  async function reject(id, reason) {
    if (mode === "mock") { tok(); var d = mget(), s = d.subs.filter(function (x) { return x.id === id; })[0]; if (s && s.status === "pending") { s.status = "rejected"; s.reject_reason = reason || ""; s.decided_at = new Date().toISOString(); d.log.push({ at: s.decided_at, action: "reject", target: id }); mset(d); } return; }
    return req("/rest/v1/rpc/reject_submission", { method: "POST", token: tok(), headers: J, body: JSON.stringify({ p_id: id, p_reason: reason || "" }) });
  }
  var TBL = { academy: "pub_academies", teacher: "pub_teachers", course: "pub_courses" };
  var MK = { academy: "academies", teacher: "teachers", course: "courses" };
  async function listPublished(kind) {
    if (mode === "mock") { tok(); return mget().pub[MK[kind]]; }
    return req("/rest/v1/" + TBL[kind] + "?select=*&order=updated_at.desc&limit=500", { token: tok() });
  }
  async function setPublished(kind, id, on) {
    if (mode === "mock") { tok(); var d = mget(); d.pub[MK[kind]].forEach(function (x) { if (x.id === id) x.status = on ? "published" : "hidden"; }); d.log.push({ at: new Date().toISOString(), action: on ? "publish" : "takedown", target: kind + ":" + id }); mset(d); return; }
    return req("/rest/v1/rpc/set_published", { method: "POST", token: tok(), headers: J, body: JSON.stringify({ p_kind: kind, p_id: id, p_on: !!on }) });
  }
  async function replacePublishedPhoto(kind, id, blob) {
    var url = await uploadPublic(blob, kind === "academy" ? "logos" : "teachers");
    var col = kind === "academy" ? "logo_url" : "photo_url";
    if (mode === "mock") { var d = mget(); d.pub[MK[kind]].forEach(function (x) { if (x.id === id) x[col] = url; }); mset(d); return url; }
    var body = {}; body[col] = url;
    await req("/rest/v1/" + TBL[kind] + "?id=eq." + encodeURIComponent(id), { method: "PATCH", token: tok(), headers: Object.assign({ Prefer: "return=minimal" }, J), body: JSON.stringify(body) });
    return url;
  }

  /* ───────── 사진 처리 (브라우저에서 크롭·리사이즈·webp 압축) ─────────
   * ratio: 3/4(강사 세로) | 1(로고 정사각). 원본 10MB·jpg/png/webp 만. 결과 1MB 미만 보장 */
  async function processImage(file, ratio, outW) {
    if (!file) throw new Error("파일이 없습니다");
    if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) < 0) throw new Error("jpg·png·webp 사진만 올릴 수 있습니다");
    if (file.size > 10 * 1024 * 1024) throw new Error("원본 사진은 10MB 까지 가능합니다");
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { no(new Error("사진을 읽을 수 없습니다")); }; i.src = url; });
      var w = img.naturalWidth, h = img.naturalHeight;
      if (w < 200 || h < 200) throw new Error("사진이 너무 작습니다 (가로·세로 200px 이상)");
      var sw, sh, sx, sy;
      if (w / h > ratio) { sh = h; sw = Math.round(h * ratio); sx = Math.round((w - sw) / 2); sy = 0; }
      else { sw = w; sh = Math.round(w / ratio); sx = 0; sy = ratio < 1 ? Math.round(Math.max(0, (h - sh) * 0.15)) : Math.round((h - sh) / 2); } // 세로 사진은 얼굴이 잘리지 않게 위쪽 기준
      var ow = Math.min(outW, sw), oh = Math.round(ow / ratio);
      var cv = document.createElement("canvas"); cv.width = ow; cv.height = oh;
      var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, ow, oh); cx.imageSmoothingQuality = "high";
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
      var q = 0.85, blob = null, type = "image/webp";
      for (var k = 0; k < 6; k++) {
        blob = await new Promise(function (ok) { cv.toBlob(ok, type, q); });
        if (!blob || blob.type !== "image/webp") { type = "image/jpeg"; blob = await new Promise(function (ok) { cv.toBlob(ok, type, q); }); }
        if (blob.size <= 400 * 1024) break;
        q -= 0.12;
      }
      if (!blob || blob.size > MAX_UPLOAD) throw new Error("사진을 1MB 아래로 줄이지 못했습니다");
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }

  window.CPB = {
    mode: mode, isAdmin: function () { return !!session(); }, session: session,
    fetchPublished: fetchPublished, submitBundle: submitBundle, processImage: processImage,
    login: login, logout: logout, listSubmissions: listSubmissions, getContact: getContact, pendingPhotoURL: pendingPhotoURL,
    approve: approve, reject: reject, listPublished: listPublished, setPublished: setPublished, replacePublishedPhoto: replacePublishedPhoto,
    stripT: stripT, mockPassword: mode === "mock" ? MOCK_PW : null
  };
})();

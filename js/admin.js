/* 클래스픽 관리자 — #/admin (공개 화면 어디에도 링크 없음)
 * 로그인(관리자 계정만) → 승인 대기(학원·강사·수업) 미리보기 → 승인 / 수정 후 승인 / 반려(사유)
 * → 공개 중 항목 내리기·다시 올리기·사진 교체. 승인된 것만 공개 화면에 나온다. */
(function () {
  "use strict";
  function E(s) { return CP.esc(s); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var tab = "academy", subs = [], pubs = { academy: [], teacher: [], course: [] }, photos = {}, replace = {}, contacts = {};
  var KIND = { academy: "학원", teacher: "강사", course: "수업" };

  function html() { return '<div class="wrap wide" id="adm-root"><div class="empty" style="margin-top:24px">불러오는 중…</div></div>'; }
  function mount(root) {
    var el = $("#adm-root", root); if (!el) return;
    if (!window.CPB || CPB.mode === "off") {
      el.innerHTML = '<div class="adm-off form"><h1>관리자</h1><p>백엔드가 아직 연결되지 않았습니다. <code>data/config.js</code> 에 클래스픽 전용 Supabase 주소와 공개키를 넣은 뒤 사용할 수 있습니다.</p></div>';
      return;
    }
    if (!CPB.isAdmin()) return loginView(el);
    dashboard(el);
  }
  function loginView(el) {
    el.innerHTML = '<form class="adm-login form" id="adm-lf"><h1>관리자 로그인</h1>'
      + (CPB.mode === "mock" ? '<p class="rg-mock">모의 모드 (이 PC 에서만) — 비밀번호 <b>' + E(CPB.mockPassword) + '</b></p>' : '<p class="rg-hint">관리자로 등록된 계정만 들어올 수 있습니다.</p>')
      + '<label class="field">이메일<input name="em" type="email" autocomplete="username" required></label>'
      + '<label class="field" style="margin-top:10px">비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>'
      + '<button class="btn pri" type="submit" style="margin-top:16px;width:100%">로그인</button><p class="rg-err" id="adm-le" role="alert"></p></form>';
    $("#adm-lf", el).addEventListener("submit", async function (e) {
      e.preventDefault(); var f = e.target;
      try { await CPB.login(f.em.value.trim(), f.pw.value); dashboard(el); } catch (x) { $("#adm-le", el).textContent = x.message; }
    });
  }
  async function load() {
    subs = await CPB.listSubmissions();
    var r = await Promise.all([CPB.listPublished("academy"), CPB.listPublished("teacher"), CPB.listPublished("course")]);
    pubs = { academy: r[0] || [], teacher: r[1] || [], course: r[2] || [] };
  }
  async function dashboard(el) {
    try { await load(); } catch (x) { if (x.status === 401) { CPB.logout(); return loginView(el); } el.innerHTML = '<div class="empty">불러오지 못했습니다: ' + E(x.message) + '</div>'; return; }
    draw(el);
  }
  function cnt(kind) { return subs.filter(function (s) { return s.kind === kind && s.status === "pending"; }).length; }
  function draw(el) {
    var s = CPB.session() || {};
    el.innerHTML = '<div class="adm-top"><h1>관리자</h1><span class="adm-who">' + E(s.email || "") + (CPB.mode === "mock" ? ' · <b>모의 모드</b>' : '') + '</span><button type="button" class="btn sm" data-ad="out">로그아웃</button></div>'
      + '<div class="adm-tabs" role="tablist">'
      + ["academy", "teacher", "course"].map(function (k) { return '<button type="button" role="tab" data-ad="tab" data-tabv="' + k + '" aria-selected="' + (tab === k) + '">대기 ' + KIND[k] + ' <b>' + cnt(k) + '</b></button>'; }).join("")
      + '<button type="button" role="tab" data-ad="tab" data-tabv="pub" aria-selected="' + (tab === "pub") + '">공개 중</button>'
      + '<button type="button" role="tab" data-ad="tab" data-tabv="log" aria-selected="' + (tab === "log") + '">처리 기록</button></div>'
      + '<div id="adm-body"></div>';
    var body = $("#adm-body", el);
    if (tab === "pub") body.innerHTML = pubHTML();
    else if (tab === "log") body.innerHTML = logHTML();
    else {
      var list = subs.filter(function (x) { return x.kind === tab && x.status === "pending"; });
      body.innerHTML = list.length ? list.map(itemHTML).join("") : '<div class="empty">승인 대기 ' + KIND[tab] + '이 없습니다.</div>';
      list.forEach(function (x) { if (x.photo_path) loadPhoto(el, x); });
    }
    if (!el.__bound) { bind(el); el.__bound = true; }
  }
  async function loadPhoto(el, x) {
    try {
      if (!photos[x.id]) photos[x.id] = await CPB.pendingPhotoURL(x.photo_path);
      var ph = $('[data-ph="' + x.id + '"]', el); if (ph && !replace[x.id]) ph.innerHTML = '<img alt="" src="' + photos[x.id] + '">';
      if (x.kind === "academy" && !replace[x.id]) { var pv = $('[data-pv="' + x.id + '"]', el); if (pv) pv.innerHTML = preview(x); }
    } catch (e) {}
  }
  function batchAcad(x) { return subs.filter(function (s) { return s.batch_id === x.batch_id && s.kind === "academy"; })[0]; }
  function acadLabel(x) {
    var id = x.payload.academy_id;
    if (id) { var a = CP.academies().filter(function (q) { return q.id === id; })[0]; return a ? a.full : id; }
    var b = batchAcad(x); if (b) return (b.status === "approved" ? "" : "(승인 전) ") + b.payload.name + (b.payload.branch ? " " + b.payload.branch : "");
    return "(학원 미지정)";
  }
  function secToText(secs) { return (secs || []).map(function (s) { return (s.l ? s.l + " | " : "") + (s.t || []).join(", "); }).join("\n"); }
  function textToSec(t) { return String(t || "").split(/\n+/).map(function (ln) { ln = ln.trim(); if (!ln) return null; var l = "", i = ln.indexOf("|"); if (i >= 0) { l = ln.slice(0, i).trim(); ln = ln.slice(i + 1); } return { l: l, t: ln.split(",").map(function (x) { return x.trim(); }).filter(Boolean) }; }).filter(Boolean); }
  var BAD_SLOT = /^[월화수목금토일]+ \d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

  function preview(x, pl) {
    pl = pl || x.payload;
    if (x.kind === "course") {
      var raw = { id: "pv-" + x.id, ac: pl.academy_id || ("(신규) " + acadLabel(x).replace(/^\(승인 전\) /, "")), a: pl.area, s: pl.subject, p: pl.prog, n: pl.name, tg: pl.target, g: pl.grade, sc: pl.school, sec: pl.sections, c: pl.content, t: pl.teacher, st: pl.start, m: pl.months };
      var c = CP.normCourse(raw); return '<div class="cards adm-card">' + CP.card(c) + '</div>';
    }
    if (x.kind === "teacher") {
      return '<div class="adm-tv"><div class="adm-tph" data-ph="' + x.id + '">' + (replace[x.id] ? '<img alt="" src="' + replace[x.id].url + '">' : '<span>사진 없음</span>') + '</div><div><span class="pill p-' + E(pl.subject) + '">' + E(pl.subject) + '</span><h3>' + E(pl.name) + ' 선생님</h3>'
        + (pl.quote ? '<p class="adm-q">' + E(pl.quote) + '</p>' : '') + (pl.bio ? '<ul class="adm-bio">' + pl.bio.split(/\s+·\s+/).map(function (b) { return '<li>' + E(b) + '</li>'; }).join("") + '</ul>' : '') + '<p class="rg-hint">' + E(acadLabel(x)) + '</p></div></div>';
    }
    return '<div class="adm-av">' + CP.acadBadge({ name: pl.name, branch: pl.branch, logo: replace[x.id] ? replace[x.id].url : (photos[x.id] || "") }, "lg") + '<p>' + E(pl.area) + ' · ' + (pl.site ? '<a class="u" href="' + E(pl.site) + '" target="_blank" rel="noopener noreferrer">' + E(pl.site) + '</a>' : '홈페이지 없음') + '</p></div>';
  }
  function fieldsHTML(x) {
    var p = x.payload, f = function (k, l, v, full, ta) { return '<label class="field' + (full ? " full" : "") + '">' + l + (ta ? '<textarea data-fk="' + k + '" rows="3">' + E(v == null ? "" : v) + '</textarea>' : '<input data-fk="' + k + '" value="' + E(v == null ? "" : v) + '">') + '</label>'; };
    if (x.kind === "academy") return f("name", "학원명", p.name) + f("branch", "지점", p.branch) + f("area", "동네 (센텀/사직)", p.area) + f("site", "홈페이지", p.site);
    if (x.kind === "teacher") return f("name", "이름", p.name) + f("subject", "과목", p.subject) + f("quote", "한줄 소개", p.quote, true) + f("bio", "약력 ( · 로 구분)", p.bio, true, true);
    return f("name", "강좌명", p.name, true) + f("subject", "과목", p.subject) + f("grade", "학년", p.grade) + f("school", "학교", p.school) + f("target", "대상 표기", p.target) + f("prog", "과정", p.prog) + f("teacher", "강사", p.teacher)
      + f("sections", "요일·시간 (줄마다 반 하나 · 「반이름 | 월수 17:00-20:00, 토 10:00-13:00」)", secToText(p.sections), true, true) + f("start", "개강", p.start) + f("area", "동네", p.area) + f("content", "수업 내용", p.content, true, true);
  }
  function itemHTML(x) {
    var when = new Date(x.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    var sameBatch = subs.filter(function (s) { return s.batch_id === x.batch_id; }).length;
    return '<article class="adm-item" data-id="' + x.id + '">'
      + '<div class="adm-meta"><b>' + (x.op === "edit" ? "수정 요청" : "새 등록") + '</b>' + (x.target_id ? ' · 대상 ' + E(x.target_id) : '') + ' · ' + E(when) + ' · 같은 묶음 ' + sameBatch + '건'
      + ' <button type="button" class="u adm-link" data-ad="contact" data-b="' + x.batch_id + '">담당자 연락처</button><span class="adm-contact" data-c="' + x.batch_id + '">' + (contacts[x.batch_id] || "") + '</span></div>'
      + '<div class="adm-grid"><div class="adm-pv" data-pv="' + x.id + '">' + preview(x) + '</div>'
      + '<div class="adm-edit"><div class="fgrid">' + fieldsHTML(x) + '</div>'
      + (x.kind !== "course" ? '<label class="btn sm rg-file" style="margin-top:12px">' + (x.kind === "teacher" ? "사진" : "로고") + ' 교체<input type="file" accept="image/jpeg,image/png,image/webp" data-ad="photo" hidden></label>' : '')
      + '<div class="adm-acts"><button type="button" class="btn" data-ad="preview">미리보기 갱신</button><button type="button" class="btn pri" data-ad="approve">승인</button></div>'
      + '<div class="adm-rej"><input data-ad-reason placeholder="반려 사유 (학원에 알릴 내용)" maxlength="300"><button type="button" class="btn" data-ad="reject">반려</button></div>'
      + '<p class="rg-err" data-err></p></div></div></article>';
  }
  function editsOf(item, x) {
    var pl = JSON.parse(JSON.stringify(x.payload)), changed = false;
    $$("[data-fk]", item).forEach(function (i) {
      var k = i.getAttribute("data-fk"), v = i.value.trim();
      if (k === "sections") { var sec = textToSec(v); if (JSON.stringify(sec) !== JSON.stringify(pl.sections || [])) { pl.sections = sec; changed = true; } return; }
      if ((pl[k] || "") !== v) { pl[k] = v; changed = true; }
    });
    if (x.kind === "course") pl.name = CPB.stripT(pl.name);
    return { pl: pl, changed: changed };
  }
  function pubHTML() {
    var row = function (kind, x) {
      var on = x.status === "published";
      var label = kind === "course" ? x.name + " · " + (CP.academies().filter(function (a) { return a.id === x.academy_id; })[0] || { full: x.academy_id }).full : kind === "teacher" ? x.name + " · " + (x.subject || "") : x.name + (x.branch ? " " + x.branch : "") + " · " + x.area;
      var img = kind === "teacher" ? x.photo_url : kind === "academy" ? x.logo_url : "";
      return '<div class="adm-prow' + (on ? "" : " off") + '" data-pk="' + kind + '" data-pid="' + E(x.id) + '">' + (kind !== "course" ? '<span class="av">' + (img ? '<img alt="" src="' + E(img) + '">' : "") + '</span>' : '') + '<div class="adm-pl"><b>' + E(label) + '</b><span>' + (on ? "공개 중" : "내려감") + ' · ' + E(x.id) + '</span></div>'
        + (kind !== "course" ? '<label class="btn sm rg-file">사진 교체<input type="file" accept="image/jpeg,image/png,image/webp" data-ad="pphoto" hidden></label>' : '')
        + '<button type="button" class="btn sm' + (on ? "" : " pri") + '" data-ad="toggle">' + (on ? "내리기" : "다시 올리기") + '</button></div>';
    };
    return ["academy", "teacher", "course"].map(function (k) {
      return '<h2 class="h2">' + KIND[k] + ' <span class="adm-n">' + pubs[k].length + '</span></h2>' + (pubs[k].length ? '<div class="adm-plist">' + pubs[k].map(function (x) { return row(k, x); }).join("") + '</div>' : '<div class="empty">승인된 ' + KIND[k] + '이 없습니다.</div>');
    }).join("") + '<p class="rg-hint" style="margin-top:18px">시간표 원본에서 온 항목(data/courses.js 등)은 여기 나오지 않습니다. 정정·삭제 요청이 오면 저장소의 해당 줄을 고쳐 배포합니다.</p>';
  }
  function logHTML() {
    var done = subs.filter(function (s) { return s.status !== "pending"; }).sort(function (a, b) { return String(b.decided_at).localeCompare(String(a.decided_at)); });
    if (!done.length) return '<div class="empty">처리한 항목이 없습니다.</div>';
    return '<div class="adm-plist">' + done.map(function (s) {
      return '<div class="adm-prow"><div class="adm-pl"><b>' + (s.status === "approved" ? "승인" : "반려") + ' · ' + KIND[s.kind] + ' · ' + E(s.payload.name || "") + '</b><span>' + E(new Date(s.decided_at).toLocaleString("ko-KR")) + (s.reject_reason ? ' · 사유: ' + E(s.reject_reason) : '') + (s.published_id ? ' · ' + E(s.published_id) : '') + '</span></div></div>';
    }).join("") + '</div>';
  }
  async function after(el, msg) { CP.toast(msg); await load(); draw(el); if (CP.refreshRemote) CP.refreshRemote(); }
  function bind(el) {
    el.addEventListener("click", async function (e) {
      var t = e.target.closest("[data-ad]"); if (!t) return;
      var a = t.getAttribute("data-ad"), item = t.closest(".adm-item"), x = item && subs.filter(function (s) { return s.id === item.getAttribute("data-id"); })[0];
      var errEl = item && $("[data-err]", item);
      try {
        if (a === "out") { CPB.logout(); return loginView(el); }
        if (a === "tab") { tab = t.getAttribute("data-tabv"); return draw(el); }
        if (a === "contact") { var c = await CPB.getContact(t.getAttribute("data-b")); var txt = [c.name, c.phone, c.email].filter(Boolean).join(" · ") || "없음"; contacts[t.getAttribute("data-b")] = E(txt); $$('[data-c="' + t.getAttribute("data-b") + '"]', el).forEach(function (s) { s.innerHTML = E(txt); }); return; }
        if (a === "preview") { var ed = editsOf(item, x); $("[data-pv]", item).innerHTML = preview(x, ed.pl); if (x.photo_path) loadPhoto(el, x); return; }
        if (a === "approve") {
          var ed2 = editsOf(item, x);
          if (x.kind === "course") { var bad = (ed2.pl.sections || []).some(function (s) { return !s.t.length || s.t.some(function (q) { return !BAD_SLOT.test(q); }); }); if (bad) throw new Error("요일·시간 형식: 월수 17:00-20:00"); }
          t.disabled = true; t.textContent = "승인 중…";
          await CPB.approve(x, ed2.changed ? ed2.pl : null, replace[x.id] ? replace[x.id].blob : null);
          delete replace[x.id];
          return after(el, KIND[x.kind] + " 승인 — 공개 화면에 올라갔습니다");
        }
        if (a === "reject") { var why = $("[data-ad-reason]", item).value.trim(); if (!why) throw new Error("반려 사유를 적어 주세요"); await CPB.reject(x.id, why); return after(el, "반려했습니다"); }
        if (a === "toggle") { var row = t.closest(".adm-prow"), on = row.classList.contains("off"); await CPB.setPublished(row.getAttribute("data-pk"), row.getAttribute("data-pid"), on); return after(el, on ? "다시 올렸습니다" : "내렸습니다 — 공개 화면에서 바로 빠집니다"); }
      } catch (er) { if (er.status === 401) { CPB.logout(); return loginView(el); } if (errEl) errEl.textContent = er.message; else CP.toast(er.message); t.disabled = false; if (a === "approve") t.textContent = "승인"; }
    });
    el.addEventListener("change", async function (e) {
      var t = e.target, a = t.getAttribute("data-ad"); if (a !== "photo" && a !== "pphoto") return;
      var file = t.files && t.files[0]; if (!file) return;
      try {
        if (a === "photo") {
          var item = t.closest(".adm-item"), x = subs.filter(function (s) { return s.id === item.getAttribute("data-id"); })[0];
          var b = await CPB.processImage(file, x.kind === "teacher" ? 3 / 4 : 1, x.kind === "teacher" ? 600 : 256);
          replace[x.id] = { blob: b, url: URL.createObjectURL(b) };
          $("[data-pv]", item).innerHTML = preview(x, editsOf(item, x).pl);
          CP.toast("사진을 바꿨습니다 — 승인할 때 이 사진이 올라갑니다");
        } else {
          var row = t.closest(".adm-prow"), kind = row.getAttribute("data-pk");
          var b2 = await CPB.processImage(file, kind === "teacher" ? 3 / 4 : 1, kind === "teacher" ? 600 : 256);
          await CPB.replacePublishedPhoto(kind, row.getAttribute("data-pid"), b2);
          await after(el, "공개 사진을 바꿨습니다");
        }
      } catch (er) { CP.toast(er.message); }
      t.value = "";
    });
  }
  window.CPAdmin = { html: html, mount: mount };
})();

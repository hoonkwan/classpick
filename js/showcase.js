/* 클래스픽 v6 — 학원 전용 쇼케이스 · 내 시간표(플래너) · 학원용 공유 도구
 *
 *  #/p/{학원id}                 학원 전용 페이지 (그 학원 수업·선생님만. 다른 학원은 나오지 않음)
 *  #/p/{학원id}?g=고1&sc=해운대고  맞춤 링크 — 그 학년·학교 수업만 먼저 보여 줌
 *  #/p/{학원id}/t/{강사}         학원 안 선생님 페이지
 *  #/plan                        내 시간표 — 담은 수업 + 직접 넣은 일정, 겹침 표시, 이미지 저장·링크 공유
 *  #/kit/{학원id}                학원용 — 상담 링크·QR·안내 문구
 *
 *  짧은 주소 /a/{학원id} · /t/{강사} 는 scripts/build_share_pages.py 가 만든 정적 페이지
 *  (카톡 미리보기용 og 태그 + 위 해시 주소로 이동)
 */
(function () {
  "use strict";
  var K_PLAN = "classpick:plan:v1";
  var DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  var SITE = location.origin && /^https?:/.test(location.origin) ? location.origin : "https://classpick.vercel.app";
  function C() { return window.CP; }
  function E(s) { return C().esc(s); }
  function enc(s) { return encodeURIComponent(s); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function toMin(t) { var p = String(t).split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function hm(m) { return Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2); }
  function qsGet(qs, k) { var m = ("&" + (qs || "")).match(new RegExp("&" + k + "=([^&]*)")); try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; } }
  function loadScript(src) { return new Promise(function (ok, no) { if ($('script[src="' + src + '"]')) return ok(); var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }

  /* ───────── 내 시간표 저장 ───────── */
  function getPlan() { var p = C().lget(K_PLAN, null); if (!p || typeof p !== "object") p = {}; p.c = p.c || {}; p.b = p.b || []; return p; }
  function setPlan(p) { C().lset(K_PLAN, p); }
  function has(id) { return !!getPlan().c[id]; }
  function count() { var p = getPlan(); return Object.keys(p.c).filter(function (id) { return C().byId(id); }).length + p.b.length; }
  function toggle(id) {
    var p = getPlan(), c = C().byId(id); if (!c) return;
    if (p.c[id]) delete p.c[id]; else p.c[id] = { sec: c.secs.length > 1 ? 0 : -1, at: Date.now() };
    setPlan(p);
    var on = !!p.c[id];
    $$('[data-pick="' + id + '"]').forEach(function (b) { b.setAttribute("aria-pressed", on); b.textContent = b.classList.contains("cp-pick") ? (on ? "✓ 내 시간표에 담김" : "+ 내 시간표에 담기") : (on ? "✓ 담김" : "+ 담기"); });
    C().toast(on ? "내 시간표에 담았습니다 · " + count() + "개" : "내 시간표에서 뺐습니다");
    C().headRefresh(); tray();
    if (curSub === "plan") rerenderPlan();
    if (curSub === "p") { var w = $("#sc-mine"); if (w) w.innerHTML = mineHTML(); }
  }

  /* ───────── 주간 시간 격자 ───────── */
  /* items: {d, s, e, t(제목), sub, subj, cid?, bid?, lb?} */
  function itemsOfCourse(c, secIdx) {
    var out = [];
    c.secs.forEach(function (sec, si) {
      if (secIdx != null && secIdx >= 0 && si !== secIdx) return;
      sec.slots.forEach(function (sl) {
        sl.days.forEach(function (d) {
          out.push({ d: d, s: sl.s, e: sl.e, t: c.name, subj: c.subject, cid: c.id, lb: sl.label || sec.label || "", sub: c.teacher ? C().tName(c.teacher) : "", ac: c.ac.name });
        });
      });
    });
    return out;
  }
  function markConflicts(items) {
    var n = 0;
    DAYS.forEach(function (d) {
      var it = items.filter(function (x) { return x.d === d; });
      for (var i = 0; i < it.length; i++) for (var j = i + 1; j < it.length; j++) {
        var a = it[i], b = it[j];
        if ((a.cid && a.cid === b.cid) || (a.bid && a.bid === b.bid)) continue;
        if (a.s < b.e && b.s < a.e) { if (!a.conf || !b.conf) n++; a.conf = b.conf = true; }
      }
    });
    return n;
  }
  function gridHTML(items, opt) {
    opt = opt || {};
    var lo = 24 * 60, hi = 0;
    items.forEach(function (x) { lo = Math.min(lo, x.s); hi = Math.max(hi, x.e); });
    if (!items.length) { lo = 14 * 60; hi = 22 * 60; }
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60; if (hi - lo < 240) hi = lo + 240;
    var K = opt.k || 1; // px / 분 (CSS 에서 화면 폭에 따라 배율)
    var maxL = {};
    var cols = DAYS.map(function (d, di) {
      var it = items.filter(function (x) { return x.d === d; }).sort(function (a, b) { return a.s - b.s || b.e - a.e; });
      var lanes = [];
      it.forEach(function (x) { for (var l = 0; l < lanes.length; l++) if (lanes[l] <= x.s) break; x.lane = l; lanes[l] = x.e; });
      // 겹치는 묶음마다 폭 나누기
      it.forEach(function (x) { x.lanes = 1 + Math.max.apply(null, it.filter(function (y) { return y.s < x.e && x.s < y.e; }).map(function (y) { return y.lane; })); });
      maxL[d] = Math.max(1, lanes.length);
      var h = it.map(function (x) {
        var w = 100 / x.lanes, top = (x.s - lo) * K, ht = Math.max(26, (x.e - x.s) * K - 3);
        var cls = "tg-it" + (x.bid ? " blk" : " s-" + x.subj) + (x.conf ? " conf" : "") + (ht < 54 ? " sm" : "");
        var attr = x.cid ? ' data-course="' + E(x.cid) + '"' : (x.bid ? ' data-blk="' + E(x.bid) + '"' : "");
        return '<button type="button" class="' + cls + '"' + attr + ' style="top:calc(' + top + 'px * var(--k));height:calc(' + ht + 'px * var(--k));left:' + (x.lane * w) + '%;width:calc(' + w + '% - 3px)">'
          + '<b>' + E(x.t) + '</b><span>' + hm(x.s) + '–' + hm(x.e) + (x.lb ? ' · ' + E(x.lb) : '') + '</span>' + (x.sub && !opt.noSub ? '<span class="who2">' + E(x.sub) + '</span>' : '')
          + (x.conf ? '<i class="tg-x">겹침</i>' : '') + '</button>';
      }).join("");
      return '<div class="tg-col' + (di > 4 ? ' we' : '') + '">' + h + '</div>';
    }).join("");
    var hours = ""; for (var m = lo; m <= hi; m += 60) hours += '<span style="top:calc(' + ((m - lo) * K) + 'px * var(--k))">' + (m / 60) + '시</span>';
    // 요일 폭 = 그 요일에 나란히 놓이는 반 수만큼 (겹치는 요일이 좁아지지 않게). 좁은 화면은 가로로 밀어 봄
    var fr = DAYS.map(function (d) { return "minmax(0," + Math.min(maxL[d], 4) + "fr)"; }).join(" ");
    var minW = 44 + DAYS.reduce(function (s, d) { return s + Math.min(maxL[d], 4) * 74; }, 0);
    return '<div class="tg-scroll"><div class="tg" style="--cols:' + fr + ';min-width:' + minW + 'px"><div class="tg-head"><span></span>' + DAYS.map(function (d, i) { return '<b' + (i > 4 ? ' class="we"' : '') + '>' + d + '</b>'; }).join("") + '</div>'
      + '<div class="tg-body" style="height:calc(' + ((hi - lo) * K) + 'px * var(--k) + 16px)"><div class="tg-hours">' + hours + '</div><div class="tg-cols" style="background-size:100% calc(' + (60 * K) + 'px * var(--k))">' + cols + '</div></div></div></div>';
  }

  /* ───────── 학원 전용 쇼케이스 ───────── */
  var SF = { g: "", s: "", sc: "" }, curSub = "", curAc = null, curT = "";
  function acCourses(acId) { return C().all().filter(function (c) { return c.acId === acId; }); }
  function teachersOf(cs) {
    var T = C(); return T.uniq(cs.map(function (c) { return c.teacher; })).filter(function (n) { return n && !T.isTeam(n); })
      .sort(function (x, y) { return T.idx(["국어", "영어", "수학", "과학", "사회"], (T.teacher(x) || {}).s) - T.idx(["국어", "영어", "수학", "과학", "사회"], (T.teacher(y) || {}).s) || x.localeCompare(y, "ko"); });
  }
  function sameBrand(a) { // 같은 학원명(센텀점·사직점)은 한 쇼케이스 안에서 지점 전환
    return (C().academies() || []).filter(function (x) { return x.name === a.name; });
  }
  function filt(cs) {
    var T = C(), gset = null; T.GCHIPS.forEach(function (g) { if (g[0] === SF.g) gset = g[2]; });
    return cs.filter(function (c) {
      if (gset && !c.grades.some(function (x) { return gset.indexOf(x) >= 0; })) return false;
      if (SF.s && c.subject !== SF.s) return false;
      if (SF.sc && c.school !== SF.sc) return false;
      return true;
    });
  }
  function presetLabel() {
    var g = SF.g ? (C().GTITLE[SF.g] || SF.g).replace(" · PRE H", "") : "";
    if (SF.sc) return SF.sc + (g && g !== "고등 정규 (전학년)" ? " " + g.replace(/^고/, "") .replace(/^(\d)$/, "$1학년") : "");
    return [g, SF.s].filter(Boolean).join(" ");
  }
  function showcase(r) {
    curSub = "p";
    var T = C(), a = T.acad(r.arg);
    if (!a) return '<div class="wrap"><div class="empty" style="margin-top:40px">학원 페이지를 찾을 수 없습니다. 주소를 확인해 주세요.</div></div>';
    curAc = a;
    if (r.p[2] === "t" && r.p[3]) { curT = r.p[3]; return teacherShow(a, r.p[3]); }
    curT = "";
    SF = { g: qsGet(r.qs, "g"), s: qsGet(r.qs, "s"), sc: qsGet(r.qs, "sc") };
    var preset = !!(SF.g || SF.s || SF.sc);
    var all = acCourses(a.id);
    // 맞춤 링크가 아니면 첫 학년 과정부터 (전 학년을 한 격자에 넣으면 너무 빽빽함)
    if (!preset) { var g0 = T.GCHIPS.filter(function (g) { return all.some(function (c) { return T.chipOf(c) === g[0]; }); })[0]; if (g0 && all.length > 12) SF.g = g0[0]; }
    var ts = teachersOf(all), subs = T.uniq(all.map(function (c) { return c.subject; })).sort(function (x, y) { return T.idx(T.SUBJ, x) - T.idx(T.SUBJ, y); });
    var soon = all.filter(function (c) { var d = T.soonDiff(c); return d != null && d >= 0 && d <= 30; }).length;
    var schools = T.uniq(all.map(function (c) { return c.school; })).filter(Boolean);
    var brand = sameBrand(a);
    var tutor = a.kind === "tutor";
    var pre = preset ? presetLabel() : "", picked = filt(all);
    var h = '<div class="sc">'
      + topBar(a, brand)
      + '<section class="sc-hero"><div class="aur"><i></i><i></i><i></i></div><div class="sc-in">'
      + '<div class="sc-eb"><span class="dot"></span>부산 ' + E(a.area) + (tutor ? ' · 개인 과외' : '') + ' · ' + E(subs.join(" · ")) + '</div>'
      + '<h1 class="sc-h1">' + E(a.name) + (a.branch ? '<small>' + E(a.branch) + '</small>' : '') + '</h1>'
      + '<p class="sc-lead">' + E(a.tagline || "요일·시간·선생님·진도까지, 상담에서 들으신 수업을 이 한 페이지에 담았습니다.") + '</p>'
      + (pre ? '<div class="sc-for"><span>맞춤</span><b>' + E(pre) + '</b> 학부모님께 맞는 수업 <em>' + picked.length + '개</em>를 먼저 보여 드립니다</div>' : '')
      + '<div class="sc-cta"><a class="mp-btn glow" href="#sc-list" data-scroll="sc-list">수업 고르고 시간표 짜기</a><a class="mp-btn ghost" href="#sc-week" data-scroll="sc-week">한 주 시간표 보기</a>'
      + (a.tel ? '<a class="mp-btn ghost" href="tel:' + E(a.tel.replace(/[^0-9]/g, "")) + '">상담 전화</a>' : '') + '</div>'
      + '<div class="sc-stats"><div><b data-count="' + all.length + '">' + all.length + '</b><span>개설 수업</span></div><div><b>' + ts.length + '</b><span>선생님</span></div>'
      + (soon ? '<div><b>' + soon + '</b><span>30일 안 개강</span></div>' : '<div><b>' + T.uniq(all.map(function (c) { return T.chipOf(c); })).filter(Boolean).length + '</b><span>학년 과정</span></div>')
      + '<div><b>' + schools.length + '</b><span>학교 내신반</span></div></div>'
      + (ts.length ? '<div class="sc-faces">' + ts.slice(0, 8).map(function (n) { var p = T.photo(n); return '<span>' + (p ? '<img src="' + E(p) + '" alt="">' : E(n.slice(0, 1))) + '</span>'; }).join("") + '<em>' + ts.length + '명의 선생님</em></div>' : '')
      + '</div></section>'
      // 선생님 화보
      + (ts.length ? '<section class="sc-sec dark"><div class="sc-in"><div class="sc-h"><span class="mp-eb">Teachers</span><h2>선생님</h2><p>사진을 누르면 그 선생님의 한 주 수업이 나옵니다.</p></div>'
        + '<div class="sc-reel">' + ts.map(function (n) {
          var t = T.teacher(n) || {}, k = all.filter(function (c) { return c.teacher === n; }).length;
          return '<a class="sc-tc" href="#/p/' + enc(a.id) + '/t/' + enc(n) + '"><div class="ph">' + (t.photo ? '<img src="' + E(t.photo) + '" alt="' + E(n) + ' 선생님" loading="lazy">' : '<span class="nf">' + E(n.slice(0, 1)) + '</span>') + '</div>'
            + '<div class="cap"><span class="pill p-' + E(t.s || "") + '">' + E(t.s || "") + '</span><b>' + E(n) + '</b>' + (t.quote ? '<q>' + E(t.quote) + '</q>' : '') + '<em>수업 ' + k + '개 →</em></div></a>';
        }).join("") + '</div></div></section>' : '')
      // 필터 + 주간 격자 + 수업
      + '<section class="sc-sec" id="sc-week"><div class="sc-in"><div class="sc-h"><span class="mp-eb">This week</span><h2>한 주 한눈에</h2><p>칸을 누르면 수업 상세(대상·교재·진도)가 열리고, 바로 내 시간표에 담을 수 있습니다.</p></div>'
      + '<div class="sc-filt" id="sc-filt">' + filtHTML(all, schools) + '</div>'
      + '<div id="sc-grid"></div></div></section>'
      + '<section class="sc-sec soft" id="sc-list"><div class="sc-in"><div class="sc-h"><span class="mp-eb">Classes</span><h2>수업 고르기</h2><p><b>+ 담기</b>를 누르면 <b>내 시간표</b>에 모입니다. 다니는 다른 학원·학교 일정도 넣어서 겹치는 시간을 확인해 보세요.</p></div>'
      + '<div id="sc-res"></div></div></section>'
      + '<section class="sc-sec"><div class="sc-in"><div class="sc-how">'
      + '<div><i>1</i><b>담기</b><span>마음에 드는 수업을 「+ 담기」</span></div>'
      + '<div><i>2</i><b>다른 일정 넣기</b><span>다니는 학원·방과후·운동을 요일·시간으로</span></div>'
      + '<div><i>3</i><b>겹침 확인</b><span>겹치는 시간은 빨갛게 표시</span></div>'
      + '<div><i>4</i><b>저장·공유</b><span>이미지로 저장하거나 가족에게 링크로</span></div>'
      + '</div><div id="sc-mine">' + mineHTML() + '</div></div></section>'
      + showFoot(a)
      + '</div>';
    return h;
  }
  function topBar(a, brand) {
    return '<header class="sc-top"><div class="sc-in"><a class="sc-brand" href="#/p/' + enc(a.id) + '">' + logoTile(a) + '<span><b>' + E(a.name) + '</b><small>' + E(a.branch || (a.kind === "tutor" ? "개인 과외" : "")) + '</small></span></a>'
      + (brand.length > 1 ? '<div class="sc-br">' + brand.map(function (x) { return '<a href="#/p/' + enc(x.id) + '" aria-pressed="' + (x.id === a.id) + '">' + E(x.branch || x.area) + '</a>'; }).join("") + '</div>' : '')
      + '<a class="sc-mine-btn" href="#/plan">내 시간표 <b id="sc-cnt">' + count() + '</b></a></div></header>';
  }
  function logoTile(a) { return '<span class="sc-logo">' + (a.logo ? '<img src="' + E(a.logo) + '" alt="">' : E(a.name.slice(0, 1))) + '</span>'; }
  function filtHTML(all, schools) {
    var T = C(), gs = T.GCHIPS.filter(function (g) { return all.some(function (c) { return T.chipOf(c) === g[0]; }); });
    var ss = T.uniq(all.map(function (c) { return c.subject; }));
    return '<div class="chips">' + '<button type="button" class="chip" data-sf="g" data-val="" aria-pressed="' + (!SF.g) + '">전체 학년</button>' + gs.map(function (g) { return '<button type="button" class="chip" data-sf="g" data-val="' + E(g[0]) + '" aria-pressed="' + (SF.g === g[0]) + '">' + E(g[1]) + '</button>'; }).join("")
      + '<span class="vsep"></span>' + ss.map(function (s) { return '<button type="button" class="chip" data-sf="s" data-val="' + E(s) + '" aria-pressed="' + (SF.s === s) + '">' + E(s) + '</button>'; }).join("") + '</div>'
      + (schools.length ? '<div class="chips" style="margin-top:8px">' + schools.sort(function (x, y) { return x.localeCompare(y, "ko"); }).map(function (s) { return '<button type="button" class="chip sm" data-sf="sc" data-val="' + E(s) + '" aria-pressed="' + (SF.sc === s) + '">' + E(s) + '</button>'; }).join("") + '</div>' : '');
  }
  function renderShowRes() {
    if (!curAc || curT) return;
    var T = C(), cs = filt(acCourses(curAc.id));
    var items = []; cs.forEach(function (c) { items = items.concat(itemsOfCourse(c)); });
    var g = $("#sc-grid"); if (g) g.innerHTML = (cs.length ? gridHTML(items, { noSub: false }) : '<div class="empty">조건에 맞는 수업이 없습니다.</div>');
    var res = $("#sc-res"); if (!res) return;
    if (!cs.length) { res.innerHTML = '<div class="empty">조건에 맞는 수업이 없습니다.</div>'; return; }
    var groups = [];
    T.GCHIPS.forEach(function (x) { var it = cs.filter(function (c) { return T.chipOf(c) === x[0]; }).sort(T.byRank); if (it.length) groups.push({ t: T.GTITLE[x[0]], items: it }); });
    var etc = cs.filter(function (c) { return !T.chipOf(c); }); if (etc.length) groups.push({ t: "기타", items: etc });
    res.innerHTML = groups.map(function (g2) { return '<section class="grp"><div class="grp-h"><h2>' + E(g2.t) + '</h2><span>' + g2.items.length + '개</span></div>' + T.cardsHTML(g2.items) + '</section>'; }).join("");
  }
  function teacherShow(a, n) {
    var T = C(), t = T.teacher(n) || {}, cs = acCourses(a.id).filter(function (c) { return c.teacher === n; });
    if (!cs.length) return topBar(a, sameBrand(a)) + '<div class="wrap"><div class="empty" style="margin-top:30px">이 학원 시간표에 없는 선생님입니다. <a class="u" href="#/p/' + enc(a.id) + '">학원 페이지로</a></div></div>';
    var bio = (t.bio || "").split(/\s+·\s+/).filter(Boolean);
    var items = []; cs.forEach(function (c) { items = items.concat(itemsOfCourse(c)); });
    var schools = T.uniq(cs.map(function (c) { return c.school; })).filter(Boolean);
    return '<div class="sc">' + topBar(a, [])
      + '<section class="sc-hero tch"><div class="aur"><i></i><i></i><i></i></div><div class="sc-in"><a class="sc-back" href="#/p/' + enc(a.id) + '">← ' + E(a.full) + '</a>'
      + '<div class="tch-in"><div class="tch-ph">' + (t.photo ? '<img src="' + E(t.photo) + '" alt="' + E(n) + ' 선생님">' : '<span class="nf">' + E(n.slice(0, 1)) + '</span>') + '</div><div class="tch-tx">'
      + '<span class="pill p-' + E(t.s || cs[0].subject) + '">' + E(t.s || cs[0].subject) + '</span><h1 class="sc-h1">' + E(n) + '<small>선생님</small></h1>'
      + (t.quote ? '<p class="tch-q">“' + E(t.quote) + '”</p>' : '')
      + (bio.length ? '<ul class="tch-bio">' + bio.map(function (b) { return '<li>' + E(b) + '</li>'; }).join("") + '</ul>' : '')
      + '<div class="sc-stats sm"><div><b>' + cs.length + '</b><span>수업</span></div><div><b>' + T.uniq(cs.map(function (c) { return T.chipOf(c); })).filter(Boolean).length + '</b><span>학년</span></div><div><b>' + schools.length + '</b><span>학교 내신</span></div></div>'
      + '</div></div><p class="sc-src">사진·소개: 학원이 공개한 자료</p></div></section>'
      + '<section class="sc-sec"><div class="sc-in"><div class="sc-h"><span class="mp-eb">This week</span><h2>' + E(n) + ' 선생님의 한 주</h2></div>' + gridHTML(items, { noSub: true }) + '</div></section>'
      + '<section class="sc-sec soft"><div class="sc-in"><div class="sc-h"><span class="mp-eb">Classes</span><h2>수업 ' + cs.length + '개</h2></div>' + T.cardsHTML(cs.slice().sort(T.byRank)) + '</div></section>'
      + showFoot(a) + '</div>';
  }
  function showFoot(a) {
    var T = C();
    return '<footer class="sc-foot"><div class="sc-in">'
      + '<div class="sc-fb">' + logoTile(a) + '<div><b>' + E(a.full) + '</b><span>부산 ' + E(a.area) + (a.kind === "tutor" ? ' · 개인과외교습자' + (a.license ? ' 신고번호 ' + E(a.license) : '') : '') + '</span></div></div>'
      + '<div class="sc-fl">' + (a.tel ? '<a href="tel:' + E(a.tel.replace(/[^0-9]/g, "")) + '">상담 ' + E(a.tel) + '</a>' : '') + (a.site ? '<a href="' + E(a.site) + '" target="_blank" rel="noopener noreferrer">공식 홈페이지</a>' : '')
      + '<a href="mailto:' + T.MAIL + '?subject=' + enc("[클래스픽] 정정·삭제 요청 - " + a.full) + '">정정·삭제 요청</a></div>'
      + '<p>' + E(T.source()) + '. 시간·요일·강사는 바뀔 수 있으니 등록 전 학원에 확인해 주세요. 수강료·후기는 싣지 않습니다.</p>'
      + '<p class="sc-made">이 페이지는 <a href="#/">클래스픽</a>에서 만든 학원 페이지입니다 · <a href="#/kit/' + enc(a.id) + '">학원용: 상담 링크·QR 받기</a></p>'
      + '</div></footer>';
  }
  function mineHTML() {
    var n = count();
    return n ? '<a class="sc-minecard" href="#/plan"><span><b>내 시간표</b> 담은 수업·일정 ' + n + '개</span><em>열기 →</em></a>'
      : '<div class="sc-minecard empty2"><span>아직 담은 수업이 없습니다. 위 수업 카드에서 <b>+ 담기</b>를 눌러 보세요.</span></div>';
  }

  /* ───────── 내 시간표 ───────── */
  var shared = null;
  function plan(r) {
    curSub = "plan"; curAc = null;
    var s = qsGet(r.qs, "share"); shared = null;
    if (s) { try { shared = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { shared = null; } }
    return '<div class="pl"><section class="sc-hero pl-hero"><div class="aur"><i></i><i></i><i></i></div><div class="sc-in">'
      + '<div class="sc-eb"><span class="dot"></span>' + (shared ? '공유받은 시간표' : '이 기기에만 저장됩니다') + '</div>'
      + '<h1 class="sc-h1">' + (shared ? '함께 보는 시간표' : '내 시간표') + '</h1>'
      + '<p class="sc-lead">' + (shared ? '가족이 보낸 시간표입니다. 내 시간표로 가져와서 고칠 수 있습니다.' : '담은 수업과 직접 넣은 일정을 한 주 격자로 맞춰 봅니다. 겹치는 시간은 빨갛게 표시됩니다.') + '</p>'
      + '<div class="pl-sum" id="pl-sum"></div></div></section>'
      + '<section class="sc-sec"><div class="sc-in"><div id="pl-cap" class="pl-cap"></div>'
      + '<div class="pl-acts">' + (shared ? '<button type="button" class="mp-btn pri" data-pl="import">내 시간표로 가져오기</button>' : '<button type="button" class="mp-btn pri" data-pl="img">이미지로 저장</button><button type="button" class="mp-btn sec" data-pl="share">가족에게 링크 보내기</button><button type="button" class="mp-btn sec" data-pl="clear">모두 지우기</button>') + '</div>'
      + (shared ? '' : '<div class="pl-cols"><div><h2 class="h2">담은 수업</h2><div id="pl-list"></div></div><div><h2 class="h2">다른 일정 넣기</h2>' + blockForm() + '<div id="pl-blocks"></div></div></div>')
      + '</div></section></div>';
  }
  function blockForm() {
    return '<form class="pl-form form" id="pl-form" novalidate><label class="field">이름<input name="n" maxlength="20" placeholder="예: 수학학원, 방과후, 피아노"></label>'
      + '<div class="field">요일<div class="chips">' + DAYS.map(function (d) { return '<button type="button" class="chip sm" data-bd="' + d + '" aria-pressed="false">' + d + '</button>'; }).join("") + '</div></div>'
      + '<div class="fgrid"><label class="field">시작<input type="time" name="s" value="18:00"></label><label class="field">끝<input type="time" name="e" value="20:00"></label></div>'
      + '<button type="submit" class="btn pri" style="margin-top:12px;width:100%">일정 넣기</button><p class="rg-hint">학원 이름을 적어도 클래스픽에 저장되거나 전송되지 않습니다 (이 기기에만).</p></form>';
  }
  function planData() {
    if (shared) {
      return { c: (shared.c || []).map(function (x) { return { id: x[0], sec: x[1] }; }).filter(function (x) { return C().byId(x.id); }), b: (shared.b || []).map(function (x, i) { return { id: "s" + i, n: x[0], d: x[1], s: x[2], e: x[3] }; }) };
    }
    var p = getPlan();
    return { c: Object.keys(p.c).filter(function (id) { return C().byId(id); }).map(function (id) { return { id: id, sec: p.c[id].sec }; }), b: p.b };
  }
  function rerenderPlan() {
    var T = C(), d = planData(), items = [];
    d.c.forEach(function (x) { items = items.concat(itemsOfCourse(T.byId(x.id), x.sec)); });
    d.b.forEach(function (b) { b.d.split("").forEach(function (day) { items.push({ d: day, s: toMin(b.s), e: toMin(b.e), t: b.n, bid: b.id, sub: "내 일정" }); }); });
    var conf = markConflicts(items);
    var mins = 0; items.forEach(function (x) { mins += x.e - x.s; });
    var sum = $("#pl-sum"); if (sum) sum.innerHTML = '<div><b>' + d.c.length + '</b><span>담은 수업</span></div><div><b>' + d.b.length + '</b><span>내 일정</span></div><div><b>' + (Math.round(mins / 6) / 10) + '</b><span>주간 시간</span></div><div class="' + (conf ? 'bad' : 'ok') + '"><b>' + conf + '</b><span>' + (conf ? '겹침' : '겹침 없음') + '</span></div>';
    var cap = $("#pl-cap");
    if (cap) cap.innerHTML = (items.length ? gridHTML(items) : '<div class="empty">아직 비어 있습니다. 학원 페이지나 <a class="u" href="#/">클래스픽</a>에서 수업을 <b>+ 담기</b> 하세요.</div>')
      + (items.length ? '<p class="pl-mark">클래스픽 · 내 시간표 · ' + new Date().toLocaleDateString("ko-KR") + '</p>' : '');
    var list = $("#pl-list");
    if (list) list.innerHTML = d.c.length ? d.c.map(function (x) {
      var c = T.byId(x.id);
      return '<div class="pl-row"><span class="pill p-' + E(c.subject) + '">' + E(c.subject) + '</span><div class="pl-rt"><b>' + E(c.name) + '</b><span>' + E(c.ac.full) + (c.teacher ? ' · ' + E(T.tName(c.teacher)) : '') + '</span>'
        + (c.secs.length > 1 ? '<select data-plsec="' + E(c.id) + '">' + c.secs.map(function (s, i) { return '<option value="' + i + '"' + (x.sec === i ? ' selected' : '') + '>' + E(s.label || ("반 " + (i + 1))) + ' — ' + E(s.slots.map(function (sl) { return sl.days.join("") + " " + T.fmt(sl); }).join(", ")) + '</option>'; }).join("") + '</select>' : '')
        + '</div><button type="button" class="rg-x" data-pick="' + E(c.id) + '">빼기</button></div>';
    }).join("") : '<div class="empty">담은 수업이 없습니다.</div>';
    var bl = $("#pl-blocks");
    if (bl) bl.innerHTML = d.b.map(function (b) { return '<div class="pl-row"><span class="pill blk">일정</span><div class="pl-rt"><b>' + E(b.n) + '</b><span>' + E(b.d.split("").join("·")) + ' ' + E(b.s) + '–' + E(b.e) + '</span></div><button type="button" class="rg-x" data-rmblk="' + E(b.id) + '">빼기</button></div>'; }).join("");
  }
  function shareURL() {
    var d = planData(), o = { c: d.c.map(function (x) { return [x.id, x.sec]; }), b: d.b.map(function (b) { return [b.n, b.d, b.s, b.e]; }) };
    var s = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return SITE + "/#/plan?share=" + s;
  }
  async function saveImage() {
    var cap = $("#pl-cap"); if (!cap) return;
    C().toast("이미지를 만드는 중…");
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      var cv = await window.html2canvas(cap, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      var a = document.createElement("a"); a.download = "내시간표_클래스픽.png"; a.href = cv.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove();
      C().toast("이미지를 저장했습니다");
    } catch (e) { C().toast("이미지를 만들지 못했습니다. 화면 캡처를 이용해 주세요"); }
  }
  async function shareLink(url, title, text) {
    if (navigator.share) { try { await navigator.share({ title: title, text: text, url: url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); C().toast("링크를 복사했습니다. 카톡에 붙여 넣으세요"); }
    catch (e) { window.prompt("아래 링크를 복사하세요", url); }
  }

  /* ───────── 학원용 공유 도구 ───────── */
  function kit(r) {
    curSub = "kit"; curAc = null;
    var T = C(), acs = T.academies(), a = T.acad(r.arg) || acs[0];
    if (!a) return '<div class="wrap"><div class="empty" style="margin-top:30px">등록된 학원이 없습니다.</div></div>';
    var all = acCourses(a.id), ts = teachersOf(all), schools = T.uniq(all.map(function (c) { return c.school; })).filter(Boolean).sort(function (x, y) { return x.localeCompare(y, "ko"); });
    var gs = T.GCHIPS.filter(function (g) { return all.some(function (c) { return T.chipOf(c) === g[0]; }); });
    return '<div class="kit"><section class="sc-hero kit-hero"><div class="aur"><i></i><i></i><i></i></div><div class="sc-in">'
      + '<div class="sc-eb"><span class="dot"></span>학원용 · 상담 도구</div><h1 class="sc-h1">상담 링크·QR</h1>'
      + '<p class="sc-lead">상담 끝에 시간표 이미지 대신 이 링크를 보내 주세요. 학부모는 우리 학원 수업·선생님·진도만 보고, 수업을 담아 <b>자기 아이 시간표</b>를 직접 짜 봅니다. 시간표가 바뀌어도 링크는 그대로입니다.</p></div></section>'
      + '<section class="sc-sec"><div class="sc-in kit-grid"><div class="form">'
      + '<label class="field">학원<select id="kit-ac">' + acs.map(function (x) { return '<option value="' + E(x.id) + '"' + (x.id === a.id ? ' selected' : '') + '>' + E(x.full) + '</option>'; }).join("") + '</select></label>'
      + '<label class="field" style="margin-top:12px">링크 종류<select id="kit-type"><option value="">학원 전체</option>'
      + gs.map(function (g) { return '<option value="g:' + E(g[0]) + '">학년 맞춤 — ' + E(g[1]) + '</option>'; }).join("")
      + schools.map(function (s) { return '<option value="sc:' + E(s) + '">학교 맞춤 — ' + E(s) + '</option>'; }).join("")
      + ts.map(function (n) { return '<option value="t:' + E(n) + '">선생님 — ' + E(n) + '</option>'; }).join("") + '</select></label>'
      + '<label class="field" style="margin-top:12px">링크<input id="kit-url" readonly></label>'
      + '<div class="pl-acts" style="margin-top:12px"><button type="button" class="mp-btn pri" data-kit="copy">링크 복사</button><button type="button" class="mp-btn sec" data-kit="open">미리 보기</button><button type="button" class="mp-btn sec" data-kit="share">카톡으로 보내기</button></div>'
      + '<label class="field" style="margin-top:18px">보낼 문구<textarea id="kit-msg" rows="5"></textarea></label>'
      + '<button type="button" class="btn" data-kit="copymsg" style="margin-top:8px;width:100%">문구 + 링크 복사</button>'
      + '</div><div class="kit-qr form"><div id="kit-qr"></div><p class="rg-hint" id="kit-qr-cap"></p><button type="button" class="btn pri" data-kit="qrpng" style="width:100%;margin-top:10px">QR 이미지 저장</button><p class="rg-hint">상담실 책상·안내문·전단에 붙여 두세요.</p></div></div></section></div>';
  }
  function kitURL() {
    var id = ($("#kit-ac") || {}).value, ty = ($("#kit-type") || {}).value || "";
    var stubs = window.CP_SHARE || { a: {}, t: {} };
    if (ty.indexOf("t:") === 0) { var n = ty.slice(2), slug = (stubs.t || {})[n]; return slug && slug.a === id ? SITE + "/t/" + slug.s : SITE + "/#/p/" + enc(id) + "/t/" + enc(n); }
    var base = (stubs.a || {})[id] ? SITE + "/a/" + id : SITE + "/#/p/" + enc(id);
    if (ty.indexOf("g:") === 0) return base + "?g=" + enc(ty.slice(2));
    if (ty.indexOf("sc:") === 0) return base + "?sc=" + enc(ty.slice(3));
    return base;
  }
  async function kitRefresh() {
    var u = kitURL(), a = C().acad(($("#kit-ac") || {}).value) || {}, ty = ($("#kit-type") || {}).value || "";
    var what = ty.indexOf("t:") === 0 ? ty.slice(2) + " 선생님 수업" : ty.indexOf("sc:") === 0 ? ty.slice(3) + " 수업" : ty.indexOf("g:") === 0 ? (C().GTITLE[ty.slice(2)] || ty.slice(2)) + " 수업" : "수업";
    $("#kit-url").value = u;
    var msg = $("#kit-msg"); if (msg && !msg.dataset.touched) msg.value = "안녕하세요, " + (a.full || "") + "입니다.\n상담에서 말씀드린 " + what + "의 요일·시간·선생님·진도를 아래 링크에 정리해 두었습니다.\n마음에 드는 수업을 「담기」 하시면 다니는 다른 학원 일정과 겹치는지도 바로 확인하실 수 있습니다.\n";
    $("#kit-qr-cap").textContent = u.replace(/^https?:\/\//, "");
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
      var box = $("#kit-qr"); box.innerHTML = "";
      new window.QRCode(box, { text: u, width: 220, height: 220, colorDark: "#0B1412", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M });
    } catch (e) { $("#kit-qr").innerHTML = '<div class="empty">QR을 불러오지 못했습니다</div>'; }
  }

  /* ───────── 떠 있는 「내 시간표」 띠 ───────── */
  function tray() {
    var el = $("#cp-tray"); if (!el) { el = document.createElement("a"); el.id = "cp-tray"; el.href = "#/plan"; document.body.appendChild(el); }
    var n = count(); var on = n > 0 && curSub !== "plan" && curSub !== "kit" && !/^#\/(register|admin)/.test(location.hash);
    el.className = on ? "on" : "";
    if (on) {
      var d = planData(), items = []; d.c.forEach(function (x) { items = items.concat(itemsOfCourse(C().byId(x.id), x.sec)); });
      d.b.forEach(function (b) { b.d.split("").forEach(function (day) { items.push({ d: day, s: toMin(b.s), e: toMin(b.e), bid: b.id }); }); });
      var cf = markConflicts(items);
      el.innerHTML = '<span class="n">' + n + '</span><span>내 시간표</span>' + (cf ? '<em class="bad">겹침 ' + cf + '</em>' : '<em>겹침 없음</em>') + '<b>보기 →</b>';
    }
    var c2 = $("#sc-cnt"); if (c2) c2.textContent = n;
  }

  /* ───────── 화면 붙이기 · 이벤트 ───────── */
  function mount(r) {
    if (r.sub === "p" && !curT) renderShowRes();
    if (r.sub === "plan") rerenderPlan();
    if (r.sub === "kit") kitRefresh();
    if (r.sub !== "p") curT = "";
    tray();
    // 쇼케이스 숫자 올라가기
    $$(".sc-stats b").forEach(function (b) { var to = +b.textContent; if (!(to > 1)) return; var t0 = performance.now(); b.textContent = "0"; (function step(t) { var k = Math.min(1, (t - t0) / 700); b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0); });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-sf],[data-scroll],[data-pl],[data-bd],[data-rmblk],[data-kit]"); if (!t) return;
    if (t.hasAttribute("data-sf")) { var k = t.getAttribute("data-sf"), v = t.getAttribute("data-val"); SF[k] = (SF[k] === v && k !== "g") ? "" : v; $$('[data-sf="' + k + '"]').forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-val") === SF[k]); }); renderShowRes(); return; }
    if (t.hasAttribute("data-scroll")) { e.preventDefault(); var el = document.getElementById(t.getAttribute("data-scroll")); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.hasAttribute("data-bd")) { t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true"); return; }
    if (t.hasAttribute("data-rmblk")) { var p = getPlan(), id = t.getAttribute("data-rmblk"); p.b = p.b.filter(function (b) { return b.id !== id; }); setPlan(p); rerenderPlan(); C().headRefresh(); return; }
    if (t.hasAttribute("data-pl")) {
      var a = t.getAttribute("data-pl");
      if (a === "img") saveImage();
      else if (a === "share") { if (!count()) { C().toast("먼저 수업이나 일정을 담아 주세요"); return; } shareLink(shareURL(), "내 시간표 · 클래스픽", "아이 시간표 같이 봐 줘"); }
      else if (a === "clear") { if (window.confirm("담은 수업과 일정을 모두 지울까요?")) { setPlan({ c: {}, b: [] }); rerenderPlan(); C().headRefresh(); } }
      else if (a === "import") { var d = planData(), p2 = getPlan(); d.c.forEach(function (x) { p2.c[x.id] = { sec: x.sec, at: Date.now() }; }); d.b.forEach(function (b, i) { p2.b.push({ id: "b" + Date.now() + i, n: b.n, d: b.d, s: b.s, e: b.e }); }); setPlan(p2); location.hash = "#/plan"; C().toast("내 시간표로 가져왔습니다"); }
      return;
    }
    if (t.hasAttribute("data-kit")) {
      var k2 = t.getAttribute("data-kit"), u = $("#kit-url").value;
      if (k2 === "copy") navigator.clipboard.writeText(u).then(function () { C().toast("링크를 복사했습니다"); }, function () { window.prompt("복사하세요", u); });
      else if (k2 === "open") window.open(u, "_blank", "noopener");
      else if (k2 === "share") shareLink(u, "수업 안내", $("#kit-msg").value);
      else if (k2 === "copymsg") { var m = $("#kit-msg").value + u; navigator.clipboard.writeText(m).then(function () { C().toast("문구와 링크를 복사했습니다"); }, function () { window.prompt("복사하세요", m); }); }
      else if (k2 === "qrpng") { var img = $("#kit-qr img"), cv = $("#kit-qr canvas"); var src = cv ? cv.toDataURL("image/png") : (img && img.src); if (!src) return; var l = document.createElement("a"); l.download = "클래스픽_QR.png"; l.href = src; document.body.appendChild(l); l.click(); l.remove(); }
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches && t.matches("[data-plsec]")) { var p = getPlan(), id = t.getAttribute("data-plsec"); if (p.c[id]) { p.c[id].sec = +t.value; setPlan(p); rerenderPlan(); } }
    if (t.id === "kit-ac") location.hash = "#/kit/" + enc(t.value);
    if (t.id === "kit-type") kitRefresh();
  });
  document.addEventListener("input", function (e) { if (e.target.id === "kit-msg") e.target.dataset.touched = "1"; });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "pl-form") return; e.preventDefault();
    var f = e.target, n = f.elements.n.value.trim() || "내 일정", s = f.elements.s.value, en = f.elements.e.value;
    var days = $$("[data-bd][aria-pressed=true]", f).map(function (b) { return b.getAttribute("data-bd"); }).join("");
    if (!days) { C().toast("요일을 골라 주세요"); return; }
    if (!s || !en || s >= en) { C().toast("끝나는 시간이 시작보다 늦어야 합니다"); return; }
    var p = getPlan(); p.b.push({ id: "b" + Date.now(), n: n.slice(0, 20), d: days, s: s, e: en }); setPlan(p);
    f.reset(); $$("[data-bd]", f).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    rerenderPlan(); C().headRefresh(); C().toast("일정을 넣었습니다");
  });

  function leave() { curSub = ""; curAc = null; curT = ""; tray(); }
  window.CPS = { has: has, count: count, toggle: toggle, showcase: showcase, plan: plan, kit: kit, mount: mount, tray: tray, leave: leave };
})();

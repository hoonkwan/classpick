/* 클래스픽 학원용 등록 — 학원 정보 → 강사(사진 업로드) → 수업. 제출하면 전부 「승인 대기」.
 * 관리자 승인 전에는 공개 화면에 나오지 않는다. 백엔드가 꺼져 있으면(off) index.html 의 메일 신청 화면을 쓴다. */
(function () {
  "use strict";
  function E(s) { return window.CP ? CP.esc(s) : String(s == null ? "" : s); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  var seq = 0;
  var blobs = {}; // key → Blob (강사 사진·학원 로고)
  var done = null;

  function on() { return !!(window.CPB && CPB.mode !== "off"); }
  function html() {
    if (!on()) return "";
    return '<div class="wrap" id="reg-root"></div>';
  }
  function opt(list, sel) { return list.map(function (v) { var val = v.v != null ? v.v : v, l = v.l || v; return '<option value="' + E(val) + '"' + (String(sel) === String(val) ? " selected" : "") + ">" + E(l) + "</option>"; }).join(""); }

  function teacherBlock(k, existing) {
    return '<div class="rg-block" data-tk="' + k + '">'
      + '<div class="rg-bh"><b>강사</b><button type="button" class="rg-x" data-rg="rm-t" aria-label="이 강사 빼기">빼기</button></div>'
      + (existing.length ? '<label class="field full">등록 방식<select data-k="op">' + opt([{ v: "", l: "새 강사 등록" }].concat(existing.map(function (n) { return { v: "tn-" + n, l: "기존 강사 정보 수정: " + n }; }))) + '</select></label>' : '')
      + '<div class="fgrid">'
      + '<label class="field">이름 *<input data-k="name" maxlength="20" autocomplete="off"></label>'
      + '<label class="field">과목 *<select data-k="subject">' + opt(CP.SUBJ) + '</select></label>'
      + '<label class="field full">한줄 소개<input data-k="quote" maxlength="60" placeholder="예: 문장 구조로 읽는 영어"></label>'
      + '<label class="field full">약력 (줄마다 하나)<textarea data-k="bio" maxlength="400" rows="3" placeholder="예: ○○대학교 영어영문학과 졸업"></textarea></label>'
      + '</div>'
      + '<div class="rg-photo"><div class="rg-ph" data-k="ph"><span>사진</span></div><div>'
      + '<label class="btn sm rg-file">사진 올리기<input type="file" accept="image/jpeg,image/png,image/webp" data-rg="photo" hidden></label>'
      + '<p class="rg-hint">jpg·png·webp, 10MB 이하. 세로 3:4 로 자동으로 맞추고 줄여서 올립니다. 학원이 공개해도 되는 프로필 사진만 올려 주세요.</p>'
      + '<p class="rg-st" data-k="st"></p></div></div>'
      + '</div>';
  }
  function timeRow() {
    return '<div class="rg-time"><div class="chips">' + DAYS.map(function (d) { return '<button type="button" class="chip sm" data-rg="day" data-d="' + d + '" aria-pressed="false">' + d + '</button>'; }).join("") + '</div>'
      + '<div class="rg-tt"><input type="time" data-k="s" value="17:00" aria-label="시작"><span>–</span><input type="time" data-k="e" value="20:00" aria-label="종료"><input data-k="l" maxlength="12" placeholder="반 이름 (선택)" aria-label="반 이름"><button type="button" class="rg-x" data-rg="rm-time">빼기</button></div></div>';
  }
  function courseBlock(k, existingCourses) {
    return '<div class="rg-block" data-ck="' + k + '">'
      + '<div class="rg-bh"><b>수업</b><button type="button" class="rg-x" data-rg="rm-c" aria-label="이 수업 빼기">빼기</button></div>'
      + (existingCourses.length ? '<label class="field full">등록 방식<select data-k="op">' + opt([{ v: "", l: "새 수업 등록" }].concat(existingCourses.map(function (c) { return { v: c.id, l: "기존 수업 수정: " + c.name + (c.target && c.target !== c.name.split(" ")[0] ? " (" + c.target + ")" : "") }; }))) + '</select></label>' : '')
      + '<div class="fgrid">'
      + '<label class="field full">강좌명 * <span class="rg-sub">강사 이름은 넣지 마세요</span><input data-k="name" maxlength="60" placeholder="예: 해운대고1 영어"></label>'
      + '<label class="field">과목 *<select data-k="subject">' + opt(CP.SUBJ) + '</select></label>'
      + '<label class="field">학년 *<select data-k="grade">' + opt(CP.GRADES) + '</select></label>'
      + '<label class="field">학교 (선택)<input data-k="school" maxlength="20" placeholder="예: 해운대고"></label>'
      + '<label class="field">과정 (선택)<select data-k="prog">' + opt([{ v: "", l: "선택 안 함" }].concat(CP.PROGS)) + '</select></label>'
      + '</div>'
      + '<div class="field" style="margin-top:12px">요일·시간 *<div data-k="times">' + timeRow() + '</div><button type="button" class="rg-add" data-rg="add-time">+ 시간 추가</button></div>'
      + '<div class="fgrid" style="margin-top:12px">'
      + '<label class="field">개강일<input data-k="start" maxlength="20" placeholder="예: 12/1(월)"></label>'
      + '<label class="field">강사<select data-k="teacher"></select></label>'
      + '<label class="field full">수업 내용<textarea data-k="content" maxlength="300" rows="2"></textarea></label>'
      + '</div></div>';
  }

  function mount(root) {
    var el = $("#reg-root", root); if (!el) return;
    if (done) { el.innerHTML = doneHTML(done); return; }
    var acads = CP.academies();
    var areaOpts = [{ v: "센텀", l: "센텀" }, { v: "사직", l: "사직" }];
    el.innerHTML = '<a class="back" href="#/">← 처음으로</a>'
      + '<div class="rg-head"><h1>수업 등록 <span>학원용</span></h1><p>학원·강사·수업 정보를 보내 주시면 운영팀이 확인한 뒤 공개합니다. <b>승인 전에는 사이트에 나오지 않습니다.</b> 등록·노출 비용은 없습니다.</p>'
      + (CPB.mode === "mock" ? '<p class="rg-mock">모의 모드 — 이 PC 브라우저에만 저장됩니다 (시연용)</p>' : '') + '</div>'
      + '<form id="regx" class="rg" novalidate>'
      + '<input type="text" name="website" class="rg-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      // 1 학원
      + '<section class="form rg-sec"><h2><i>1</i>학원 정보</h2>'
      + '<div class="seg" role="group" aria-label="학원 선택"><button type="button" data-rg="amode" data-mv="new" aria-pressed="true">새 학원</button><button type="button" data-rg="amode" data-mv="old" aria-pressed="false"' + (acads.length ? "" : " disabled") + '>이미 등록된 학원</button></div>'
      + '<div data-a="old" class="hidden" style="margin-top:14px"><label class="field">학원 선택<select id="rg-acad">' + opt(acads.map(function (a) { return { v: a.id, l: a.full }; })) + '</select></label>'
      + '<label class="rg-chk"><input type="checkbox" id="rg-aedit"> 학원 정보(이름·지점·홈페이지·로고)도 고칠게요</label></div>'
      + '<div data-a="fields" style="margin-top:14px"><div class="fgrid">'
      + '<label class="field">학원명 *<input id="rg-an" maxlength="40"></label>'
      + '<label class="field">지점<input id="rg-ab" maxlength="20" placeholder="예: 센텀점"></label>'
      + '<label class="field">동네 *<select id="rg-aa">' + opt(areaOpts) + '</select></label>'
      + '<label class="field">공식 홈페이지<input id="rg-as" maxlength="200" placeholder="https://"></label>'
      + '</div><div class="rg-photo"><div class="rg-ph sq" id="rg-logo-ph"><span>로고</span></div><div><label class="btn sm rg-file">로고 올리기<input type="file" accept="image/jpeg,image/png,image/webp" data-rg="logo" hidden></label><p class="rg-hint">정사각으로 맞춰 줄입니다. 학원이 공개 중인 로고만.</p><p class="rg-st" id="rg-logo-st"></p></div></div></div>'
      + '<h3 class="rg-h3">담당자 연락처 <span>운영팀만 봅니다 · 공개 안 함</span></h3><div class="fgrid">'
      + '<label class="field">이름 *<input id="rg-cn" maxlength="40" autocomplete="name"></label>'
      + '<label class="field">전화<input id="rg-cp" maxlength="30" inputmode="tel" autocomplete="tel"></label>'
      + '<label class="field full">이메일<input id="rg-ce" maxlength="120" type="email" autocomplete="email"></label>'
      + '</div><p class="rg-hint">전화나 이메일 중 하나는 꼭 적어 주세요. 승인·반려 결과를 알려 드리는 데만 씁니다.</p></section>'
      // 2 강사
      + '<section class="form rg-sec"><h2><i>2</i>강사</h2><p class="rg-hint" style="margin-top:-4px">수업을 맡는 강사를 등록합니다. 강사 없이 수업만 보내도 됩니다.</p><div id="rg-ts"></div><button type="button" class="rg-add" data-rg="add-t">+ 강사 추가</button></section>'
      // 3 수업
      + '<section class="form rg-sec"><h2><i>3</i>수업</h2><div id="rg-cs"></div><button type="button" class="rg-add" data-rg="add-c">+ 수업 추가</button></section>'
      + '<section class="form rg-sec"><label class="rg-chk"><input type="checkbox" id="rg-agree"> <span>이미 공개한 강좌 정보와 강사 본인이 동의한 프로필만 보내며, 학생 정보는 넣지 않았습니다. <a class="u" href="terms.html" target="_blank" rel="noopener">이용약관</a>·<a class="u" href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의합니다.</span></label>'
      + '<button type="submit" class="btn pri rg-submit">승인 요청 보내기</button><p class="rg-hint">보낸 내용은 운영팀 확인 후 공개됩니다. 공개 후에도 언제든 사유 없이 수정·삭제를 요청할 수 있습니다 (영업일 1일 이내).</p><p class="rg-err" id="rg-err" role="alert"></p></section>'
      + '</form>';
    addTeacher(el); addCourse(el);
    bind(el);
  }
  function curAcad(el) {
    var old = $('[data-rg=amode][data-mv=old]', el).getAttribute("aria-pressed") === "true";
    return old ? $("#rg-acad", el).value : "";
  }
  function addTeacher(el) {
    var k = "t" + (++seq), id = curAcad(el);
    $("#rg-ts", el).insertAdjacentHTML("beforeend", teacherBlock(k, id ? CP.teachersOf(id) : []));
    refreshTeacherSelects(el);
  }
  function addCourse(el) {
    var k = "c" + (++seq), id = curAcad(el);
    $("#rg-cs", el).insertAdjacentHTML("beforeend", courseBlock(k, id ? CP.coursesOf(id) : []));
    refreshTeacherSelects(el);
  }
  function teacherNames(el) {
    var names = $$("[data-tk] [data-k=name]", el).map(function (i) { return i.value.trim(); }).filter(Boolean);
    var id = curAcad(el); if (id) names = names.concat(CP.teachersOf(id));
    return names.filter(function (n, i, a) { return a.indexOf(n) === i; });
  }
  function refreshTeacherSelects(el) {
    var names = teacherNames(el);
    $$("[data-ck] [data-k=teacher]", el).forEach(function (s) {
      var v = s.value; s.innerHTML = '<option value="">미정 · 학원 문의</option>' + names.map(function (n) { return '<option' + (n === v ? " selected" : "") + ">" + E(n) + "</option>"; }).join("");
    });
  }
  function setAMode(el, v) {
    $$("[data-rg=amode]", el).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mv") === v); });
    $('[data-a=old]', el).classList.toggle("hidden", v !== "old");
    $('[data-a=fields]', el).classList.toggle("hidden", v === "old" && !$("#rg-aedit", el).checked);
    if (v === "old") fillAcad(el);
    // 기존 학원이면 강사·수업 블록을 다시 만들어 「기존 항목 수정」 선택지를 넣는다
    $("#rg-ts", el).innerHTML = ""; $("#rg-cs", el).innerHTML = ""; addTeacher(el); addCourse(el);
  }
  function fillAcad(el) {
    var a = CP.academies().filter(function (x) { return x.id === $("#rg-acad", el).value; })[0]; if (!a) return;
    $("#rg-an", el).value = a.name; $("#rg-ab", el).value = a.branch || ""; $("#rg-aa", el).value = a.area; $("#rg-as", el).value = a.site || "";
  }
  async function onPhoto(input, ratio, w, phEl, stEl, key) {
    var f = input.files && input.files[0]; if (!f) return;
    stEl.textContent = "사진 줄이는 중…"; stEl.className = "rg-st";
    try {
      var b = await CPB.processImage(f, ratio, w);
      blobs[key] = b;
      phEl.innerHTML = '<img alt="" src="' + URL.createObjectURL(b) + '">';
      stEl.textContent = "준비됨 · " + Math.round(b.size / 1024) + "KB (" + (b.type === "image/webp" ? "webp" : "jpg") + ")";
    } catch (e) { delete blobs[key]; stEl.textContent = e.message; stEl.className = "rg-st bad"; }
    input.value = "";
  }
  function bind(el) {
    el.addEventListener("click", function (e) {
      var t = e.target.closest("[data-rg]"); if (!t) return;
      var a = t.getAttribute("data-rg");
      if (a === "amode") { if (!t.disabled) setAMode(el, t.getAttribute("data-mv")); }
      else if (a === "add-t") addTeacher(el);
      else if (a === "add-c") addCourse(el);
      else if (a === "rm-t") { var b = t.closest("[data-tk]"); delete blobs[b.getAttribute("data-tk")]; b.remove(); refreshTeacherSelects(el); }
      else if (a === "rm-c") t.closest("[data-ck]").remove();
      else if (a === "add-time") t.previousElementSibling.insertAdjacentHTML("beforeend", timeRow());
      else if (a === "rm-time") { var box = t.closest("[data-k=times]"); if (box.children.length > 1) t.closest(".rg-time").remove(); }
      else if (a === "day") t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true");
    });
    el.addEventListener("change", function (e) {
      var t = e.target;
      if (t.getAttribute("data-rg") === "photo") { var b = t.closest("[data-tk]"); onPhoto(t, 3 / 4, 600, $("[data-k=ph]", b), $("[data-k=st]", b), b.getAttribute("data-tk")); }
      else if (t.getAttribute("data-rg") === "logo") onPhoto(t, 1, 256, $("#rg-logo-ph", el), $("#rg-logo-st", el), "logo");
      else if (t.id === "rg-acad") { fillAcad(el); setAMode(el, "old"); }
      else if (t.id === "rg-aedit") $('[data-a=fields]', el).classList.toggle("hidden", !t.checked);
      else if (t.getAttribute("data-k") === "op" && t.closest("[data-tk]") && t.value) { var nm = $("[data-k=name]", t.closest("[data-tk]")); nm.value = t.value.replace(/^tn-/, ""); var info = CP.teacher(nm.value) || {}; $("[data-k=subject]", t.closest("[data-tk]")).value = info.s || "영어"; $("[data-k=quote]", t.closest("[data-tk]")).value = info.quote || ""; $("[data-k=bio]", t.closest("[data-tk]")).value = (info.bio || "").split(/\s+·\s+/).join("\n"); refreshTeacherSelects(el); }
      else if (t.getAttribute("data-k") === "op" && t.closest("[data-ck]") && t.value) prefillCourse(el, t.closest("[data-ck]"), t.value);
    });
    el.addEventListener("input", function (e) { if (e.target.getAttribute("data-k") === "name" && e.target.closest("[data-tk]")) refreshTeacherSelects(el); });
    $("#regx", el).addEventListener("submit", function (e) { e.preventDefault(); submit(el); });
  }
  function prefillCourse(el, b, id) {
    var c = CP.coursesOf(curAcad(el)).filter(function (x) { return x.id === id; })[0]; if (!c) return;
    $("[data-k=name]", b).value = c.name; $("[data-k=subject]", b).value = c.subject; $("[data-k=grade]", b).value = c.grades[0] || "고1";
    $("[data-k=school]", b).value = c.school; $("[data-k=prog]", b).value = c.prog || ""; $("[data-k=start]", b).value = c.start; $("[data-k=content]", b).value = c.content;
    var box = $("[data-k=times]", b); box.innerHTML = "";
    c.secs.forEach(function (sec) {
      // 같은 시간대 슬롯은 한 줄로
      var groups = {};
      sec.slots.forEach(function (sl) { var key = (sl.label || sec.label) + "|" + sl.start + "|" + sl.end; (groups[key] = groups[key] || { l: sl.label || sec.label, s: sl.start, e: sl.end, d: [] }).d = groups[key].d.concat(sl.days); });
      Object.keys(groups).forEach(function (k) { var g = groups[k]; box.insertAdjacentHTML("beforeend", timeRow()); var row = box.lastElementChild; $$("[data-rg=day]", row).forEach(function (x) { x.setAttribute("aria-pressed", g.d.indexOf(x.getAttribute("data-d")) >= 0); }); $("[data-k=s]", row).value = g.s.padStart(5, "0"); $("[data-k=e]", row).value = g.e.padStart(5, "0"); $("[data-k=l]", row).value = g.l || ""; });
    });
    if (!box.children.length) box.insertAdjacentHTML("beforeend", timeRow());
    refreshTeacherSelects(el); $("[data-k=teacher]", b).value = c.teacher && !/TEAM$/.test(c.teacher) ? c.teacher : "";
  }
  function val(b, k) { var x = $("[data-k=" + k + "]", b); return x ? String(x.value || "").trim() : ""; }
  async function submit(el) {
    var err = $("#rg-err", el); err.textContent = "";
    var fail = function (m, focus) { err.textContent = m; if (focus) focus.focus(); };
    var f = $("#regx", el);
    var old = curAcad(el), aedit = $("#rg-aedit", el).checked;
    var area = $("#rg-aa", el).value;
    if (old) { var oa = CP.academies().filter(function (x) { return x.id === old; })[0]; if (!aedit && oa) area = oa.area; }
    var acadPl = { name: $("#rg-an", el).value.trim(), branch: $("#rg-ab", el).value.trim(), area: area, site: $("#rg-as", el).value.trim() };
    if ((!old || aedit) && !acadPl.name) return fail("학원명을 적어 주세요", $("#rg-an", el));
    if (acadPl.site && !/^https?:\/\//.test(acadPl.site)) return fail("홈페이지 주소는 http:// 또는 https:// 로 시작해야 합니다", $("#rg-as", el));
    var contact = { name: $("#rg-cn", el).value.trim(), phone: $("#rg-cp", el).value.trim(), email: $("#rg-ce", el).value.trim() };
    if (!contact.name) return fail("담당자 이름을 적어 주세요", $("#rg-cn", el));
    if (!contact.phone && !contact.email) return fail("담당자 전화나 이메일 중 하나를 적어 주세요", $("#rg-cp", el));
    if (contact.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) return fail("이메일 형식을 확인해 주세요", $("#rg-ce", el));
    var teachers = [], courses = [];
    $$("[data-tk]", el).forEach(function (b) {
      var name = val(b, "name"); if (!name) return;
      var op = val(b, "op");
      var pl = { name: name, subject: val(b, "subject"), quote: val(b, "quote"), bio: val(b, "bio").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean).join(" · ") };
      if (old) pl.academy_id = old;
      teachers.push({ op: op ? "edit" : "create", target_id: op || null, payload: pl, photoBlob: blobs[b.getAttribute("data-tk")] || null });
    });
    for (var bi = 0, cbs = $$("[data-ck]", el); bi < cbs.length; bi++) {
      var b = cbs[bi], rawName = val(b, "name"); if (!rawName) continue;
      var name = CPB.stripT(rawName);
      var secs = [], bad = false;
      $$(".rg-time", b).forEach(function (row) {
        var days = $$("[data-rg=day][aria-pressed=true]", row).map(function (x) { return x.getAttribute("data-d"); });
        var s = $("[data-k=s]", row).value, e = $("[data-k=e]", row).value, l = $("[data-k=l]", row).value.trim();
        if (!days.length) return;
        if (!s || !e || s >= e) { bad = true; return; }
        secs.push({ l: l, t: [days.join("") + " " + s + "-" + e] });
      });
      if (bad) return fail("「" + name + "」 종료 시간이 시작 시간보다 늦어야 합니다");
      if (!secs.length) return fail("「" + name + "」 요일을 하나 이상 골라 주세요");
      // 라벨 없는 시간 줄은 한 반으로 합친다
      var plain = secs.filter(function (x) { return !x.l; }), labeled = secs.filter(function (x) { return x.l; });
      var sections = (plain.length ? [{ l: "", t: [].concat.apply([], plain.map(function (x) { return x.t; })) }] : []).concat(labeled);
      var school = val(b, "school"), grade = val(b, "grade");
      var pl2 = { name: name, subject: val(b, "subject"), grade: grade, school: school, target: school && /\d/.test(grade) ? school + grade.replace(/^\D+/, "") : grade, prog: val(b, "prog"), sections: sections, start: val(b, "start"), content: val(b, "content"), teacher: val(b, "teacher"), area: area, months: [new Date().getMonth() + 1] };
      if (old) pl2.academy_id = old;
      var cop = val(b, "op");
      courses.push({ op: cop ? "edit" : "create", target_id: cop || null, payload: pl2 });
    }
    var academy = (!old || aedit) ? { op: old ? "edit" : "create", target_id: old || null, payload: acadPl, logoBlob: blobs.logo || null } : null;
    if (!academy && !teachers.length && !courses.length) return fail("보낼 강사나 수업을 하나 이상 적어 주세요");
    if (!$("#rg-agree", el).checked) return fail("안내 문구에 동의해 주세요", $("#rg-agree", el));
    var btn = $(".rg-submit", el); btn.disabled = true; btn.textContent = "보내는 중…";
    try {
      var r = await CPB.submitBundle({ website: f.elements.website.value, contact: contact, academy: academy, teachers: teachers, courses: courses });
      done = { n: r.count, a: academy ? 1 : 0, t: teachers.length, c: courses.length, name: acadPl.name || (CP.academies().filter(function (x) { return x.id === old; })[0] || {}).full };
      blobs = {}; el.innerHTML = doneHTML(done); window.scrollTo(0, 0);
    } catch (e2) { fail(e2.message || "보내지 못했습니다. 잠시 후 다시 시도해 주세요"); btn.disabled = false; btn.textContent = "승인 요청 보내기"; }
  }
  function doneHTML(d) {
    return '<div class="rg-done form"><div class="rg-ok">✓</div><h1>승인 요청을 받았습니다</h1>'
      + '<p><b>' + E(d.name || "") + '</b> — 학원 ' + d.a + ' · 강사 ' + d.t + ' · 수업 ' + d.c + '건이 <b>승인 대기</b> 상태입니다.</p>'
      + '<p>운영팀이 확인한 뒤 공개하며, 결과는 적어 주신 연락처로 알려 드립니다. 승인 전에는 사이트에 나오지 않습니다.</p>'
      + '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap"><a class="btn" href="#/">처음으로</a><button type="button" class="btn pri" data-rg-again>더 등록하기</button></div></div>';
  }
  document.addEventListener("click", function (e) { if (e.target.closest("[data-rg-again]")) { done = null; var r = document.getElementById("reg-root"); if (r) mount(r.parentNode); } });

  window.CPRegister = { on: on, html: html, mount: mount };
})();

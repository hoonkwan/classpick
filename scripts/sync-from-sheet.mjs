#!/usr/bin/env node
/**
 * ClassPick — Google Sheet → db/courses.json sync
 *
 * Source of truth: 교육in시간표 (Google Sheets)
 * https://docs.google.com/spreadsheets/d/157tm9BGGbVzkOGTJN1QysDlkqVyGBhcUTOtXvylVBHs/edit
 *
 * Run:
 *   node scripts/sync-from-sheet.mjs
 *
 * GitHub Actions runs this every 48h (.github/workflows/sync.yml)
 *
 * Requires: Node 18+ (standard fetch). No npm install needed.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(ROOT, "db/courses.json");

const SHEET_ID = "157tm9BGGbVzkOGTJN1QysDlkqVyGBhcUTOtXvylVBHs";

/**
 * 8 tabs. If the actual sheet uses slightly different names, edit here.
 * Each entry: [tabName, defaultArea, defaultTerm]
 *   defaultArea: "센텀" or "사직" (overridden by row prefix tag)
 *   defaultTerm: "regular-may" or "summer-2026" or "" (teacher tabs)
 */
const TABS = [
  { name: "(센텀) 5월 전체강의실",   area: "센텀", term: "regular-may"  },
  { name: "(센텀) 여름방학시간표",   area: "센텀", term: "summer-2026"  },
  { name: "(사직) 5월 강의실",       area: "사직", term: "regular-may"  },
  { name: "(사직) 여름방학 시간표",  area: "사직", term: "summer-2026"  },
  { name: "수학강사별 시간표",       area: "",     term: "" },
  { name: "영어강사별 시간표",       area: "",     term: "" },
  { name: "국어강사별 시간표",       area: "",     term: "" },
  { name: "탐구강사별 시간표",       area: "",     term: "" },
];

/* ============================================================
 * 1) CSV fetch
 * ============================================================ */
function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchTab(tab) {
  const url = csvUrl(tab.name);
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) {
    throw new Error(`[fetch] ${tab.name} → HTTP ${r.status} (${url})`);
  }
  const text = await r.text();
  // Google returns HTML when access denied
  if (text.startsWith("<") || text.includes("<HTML") || text.includes("<html")) {
    throw new Error(`[fetch] ${tab.name} → HTML response (sheet not public yet?)`);
  }
  return text;
}

/* ============================================================
 * 2) Minimal CSV parser (handles quoted multi-line cells)
 * ============================================================ */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ============================================================
 * 3) Cell parser
 *    Expected shape (multi-line, " / " separator possible):
 *      [prefix tag] subject / title-or-class / 요일 시간 [/ 요일 시간] / 강사T
 *    Examples:
 *      "(센텀) 영어 / 부산외고2 / 토 09:00-13:00 / 윤훈관T"
 *      "수학 / 해운대고1 / 토/일 10-13 / 이영환T"
 *      "(특강) 영어 / 고 1,2 통합 모의고사 / 금 14:00-17:00 / 정준호T"
 * ============================================================ */
const SUBJECT_WORDS = ["국어", "영어", "수학", "과학", "사회", "탐구", "한국사", "물리", "화학", "생명", "지구"];
const SCHOOL_LIST = [
  "부일고", "해운대고", "부산외고", "부산예고", "해강고",
  "센텀여고", "센텀고", "학산여고", "덕문여고", "동여고",
  "이사벨고", "양정고", "사직여고", "사직고", "동래여고",
  "연합고", "남일고",
];
const PREFIX_TAGS = {
  "(센텀)": { area: "센텀", coursePrefix: "센텀" },
  "(사직)": { area: "사직", coursePrefix: "사직" },
  "(명작)": { area: "센텀", coursePrefix: "명작", academy: "명작학원" },
  "(특강)": { area: null,   coursePrefix: "특강",  courseType: "방학특강" },
};

/**
 * Returns parsed course object or null.
 * @param {string} raw cell text
 * @param {object} tab tab descriptor (area, term)
 */
function parseCell(raw, tab) {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  // Skip obvious non-data cells
  if (/^(요일|시간|강의실|구분|학년|월|화|수|목|금|토|일)$/.test(s)) return null;
  if (s.length < 5) return null;

  // Extract prefix tag
  let area = tab.area || "";
  let academy = "교육인학원 " + (area === "사직" ? "사직점" : "센텀점");
  let academyTag = area || "센텀";
  let courseTypeFromTag = "";
  for (const [tag, meta] of Object.entries(PREFIX_TAGS)) {
    if (s.startsWith(tag)) {
      s = s.slice(tag.length).trim();
      if (meta.area) { area = meta.area; academyTag = meta.area; }
      if (meta.academy) academy = meta.academy;
      if (meta.courseType) courseTypeFromTag = meta.courseType;
      break;
    }
  }

  // Split by "/" but ignore "/" inside time ranges (10-13/ 토 ...) heuristic:
  // We'll split by " / " (with spaces) or by \n
  const parts = s.split(/\s*\/\s*|\n+/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  // Find subject
  let subject = "";
  let subjectIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    for (const sw of SUBJECT_WORDS) {
      if (parts[i] === sw || parts[i].startsWith(sw + " ") || parts[i].endsWith(" " + sw)) {
        subject = sw === "탐구" ? "사회" : (sw === "한국사" ? "사회" : (["물리","화학","생명","지구"].includes(sw) ? "과학" : sw));
        subjectIdx = i;
        break;
      }
    }
    if (subject) break;
  }
  if (!subject) return null;

  // Find teacher (마지막 ~T 패턴)
  let teacher = "";
  let teacherIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^([가-힣]{2,4})T\s*$/);
    if (m) { teacher = m[1]; teacherIdx = i; break; }
  }

  // Find time-bearing part
  const TIME_RE = /([월화수목금토일])(?:\s*[\/·,]\s*[월화수목금토일])*\s*([0-9]{1,2})\s*[:시]?\s*([0-9]{0,2})\s*[-~]\s*([0-9]{1,2})\s*[:시]?\s*([0-9]{0,2})/;
  let timeStart = "";
  let timeEnd = "";
  let days = [];
  let scheduleParts = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === subjectIdx || i === teacherIdx) continue;
    const m = parts[i].match(TIME_RE);
    if (m) {
      scheduleParts.push(parts[i]);
      // collect all 요일 tokens from this part
      const dayMatches = parts[i].match(/[월화수목금토일]/g) || [];
      // Heuristic: 요일 token immediately preceding time → all those days apply
      const dayClusterMatch = parts[i].match(/([월화수목금토일](?:\s*[\/·,]\s*[월화수목금토일])*)\s*[0-9]/);
      if (dayClusterMatch) {
        (dayClusterMatch[1].match(/[월화수목금토일]/g) || []).forEach(d => { if (!days.includes(d)) days.push(d); });
      } else {
        dayMatches.forEach(d => { if (!days.includes(d)) days.push(d); });
      }
      if (!timeStart) {
        const sh = m[2].padStart(2, "0");
        const sm = (m[3] || "00").padStart(2, "0");
        const eh = m[4].padStart(2, "0");
        const em = (m[5] || "00").padStart(2, "0");
        timeStart = `${sh}:${sm}`;
        timeEnd = `${eh}:${em}`;
      }
    }
  }
  if (days.length === 0 || !timeStart) return null;

  // Title = remaining parts
  const titleIdxs = [];
  for (let i = 0; i < parts.length; i++) {
    if (i === subjectIdx) continue;
    if (i === teacherIdx) continue;
    if (scheduleParts.includes(parts[i])) continue;
    titleIdxs.push(i);
  }
  let title = titleIdxs.map(i => parts[i]).join(" ").trim();
  if (!title) title = parts[subjectIdx].replace(subject, "").trim() || subject;

  // School inference (from title)
  let school = "";
  for (const sc of SCHOOL_LIST) {
    if (title.includes(sc)) { school = sc; break; }
  }

  // Grade inference
  let grade = "";
  const gradeMatch = (title + " " + raw).match(/(고\s*[123])|(중\s*[123])|예비\s*고1|고\s*1\s*[~,]\s*고?\s*2/);
  if (gradeMatch) {
    const g = gradeMatch[0].replace(/\s+/g, "");
    if (/예비고1/.test(g)) grade = "고1";
    else if (/고1[~,]고?2/.test(g)) grade = "고1~고2";
    else if (/고1/.test(g)) grade = "고1";
    else if (/고2/.test(g)) grade = "고2";
    else if (/고3/.test(g)) grade = "고3";
    else if (/중1/.test(g)) grade = "중1";
    else if (/중2/.test(g)) grade = "중2";
    else if (/중3/.test(g)) grade = "중3";
  } else if (school) {
    // school name often has a trailing digit: 부일고1, 해운대고1, etc.
    const schG = title.match(new RegExp(school + "\\s*([123])"));
    if (schG) grade = "고" + schG[1];
  }

  // courseType inference
  let courseType = courseTypeFromTag || "";
  if (!courseType) {
    if (/특강|모의고사|수파르타/.test(title)) courseType = "방학특강";
    else if (/자사|특목|외고|예고|국제계열/.test(title)) courseType = "자사특목";
    else if (/수능|모의/.test(title)) courseType = "수능대비";
    else if (/심화/.test(title)) courseType = "심화";
    else if (/클리닉/.test(title)) courseType = "클리닉";
    else if (/개별진도/.test(title)) courseType = "개별진도";
    else if (/문법/.test(title)) courseType = "문법";
    else if (/독해/.test(title)) courseType = "독해";
    else if (/단어|보카/.test(title)) courseType = "단어";
    else if (school) courseType = "학교내신";
    else courseType = "일반";
  }

  const schedule = scheduleParts.length
    ? scheduleParts.join(" / ")
    : `${days.join("")} ${timeStart}-${timeEnd}`;

  return {
    academy,
    academyTag,
    area,
    subject,
    title,
    schedule,
    days,
    timeStart,
    timeEnd,
    teacher,
    school,
    grade,
    courseType,
    term: tab.term || "",
    sourceTab: tab.name,
  };
}

/* ============================================================
 * 4) Tab walk: flatten matrix → cells → courses
 * ============================================================ */
function extractCellsFromMatrix(rows) {
  const cells = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const v = (rows[r][c] || "").trim();
      if (!v) continue;
      cells.push({ r, c, raw: v });
    }
  }
  return cells;
}

/* ============================================================
 * 5) Dedupe — key = academy|teacher|subject|grade|days|timeStart
 * ============================================================ */
function dedupe(courses) {
  // Two-pass dedupe:
  //   Pass 1 (strict): merge identical slots (same academy+teacher+subject+grade+days+time+term)
  //   Pass 2 (cross-tab): collapse (none)-term records into matching termful records
  const strict = new Map();
  for (const c of courses) {
    const key = [
      c.academy, c.teacher, c.subject, c.grade,
      (c.days || []).join(""), c.timeStart, c.term,
    ].join("|");
    if (!strict.has(key)) {
      strict.set(key, { ...c, sourceTabAll: [c.sourceTab] });
    } else {
      const prev = strict.get(key);
      if (!prev.sourceTabAll.includes(c.sourceTab)) prev.sourceTabAll.push(c.sourceTab);
      // Prefer richer school/title when current has more info
      if (!prev.school && c.school) prev.school = c.school;
      if (!prev.grade && c.grade) prev.grade = c.grade;
      if (c.title && c.title.length > (prev.title || "").length) prev.title = c.title;
    }
  }

  // Pass 2: collapse (none)-term records when matching termful exists
  const records = [...strict.values()];
  const byTermlessKey = new Map(); // key without term
  for (const r of records) {
    const k = [r.academy, r.teacher, r.subject, (r.days || []).join(""), r.timeStart].join("|");
    if (!byTermlessKey.has(k)) byTermlessKey.set(k, []);
    byTermlessKey.get(k).push(r);
  }
  const drop = new Set();
  for (const group of byTermlessKey.values()) {
    if (group.length < 2) continue;
    const hasTermful = group.some(r => r.term);
    if (!hasTermful) continue;
    for (const r of group) {
      if (!r.term) {
        // merge sourceTabs into the termful records
        const target = group.find(x => x.term);
        if (target) {
          r.sourceTabAll.forEach(t => { if (!target.sourceTabAll.includes(t)) target.sourceTabAll.push(t); });
          if (!target.school && r.school) target.school = r.school;
          if (!target.grade && r.grade) target.grade = r.grade;
        }
        drop.add(r);
      }
    }
  }
  return records.filter(r => !drop.has(r));
}

/* ============================================================
 * 6) Main
 * ============================================================ */
(async () => {
  const startedAt = new Date();
  console.log(`[sync] start ${startedAt.toISOString()}`);
  console.log(`[sync] sheet ${SHEET_ID}`);

  const tabReport = [];
  let allCourses = [];

  for (const tab of TABS) {
    try {
      const csv = await fetchTab(tab);
      const rows = parseCSV(csv);
      const cells = extractCellsFromMatrix(rows);
      let parsed = 0;
      const courses = [];
      for (const cell of cells) {
        const c = parseCell(cell.raw, tab);
        if (c) { courses.push(c); parsed++; }
      }
      tabReport.push({ tab: tab.name, rows: rows.length, cells: cells.length, parsed });
      allCourses.push(...courses);
      console.log(`  · ${tab.name}: ${rows.length} rows, ${cells.length} cells, ${parsed} parsed`);
    } catch (e) {
      tabReport.push({ tab: tab.name, error: e.message });
      console.warn(`  · ${tab.name}: ERROR — ${e.message}`);
    }
  }

  const before = allCourses.length;
  const deduped = dedupe(allCourses);
  console.log(`[sync] ${before} raw → ${deduped.length} dedup`);

  if (deduped.length === 0) {
    console.error(`[sync] FATAL: 0 courses parsed. Aborting (check sheet sharing).`);
    process.exit(1);
  }

  // Assign deterministic ids and syncedAt
  const syncedAt = startedAt.toISOString();
  const final = deduped.map((c, i) => ({
    id: "auto-" + String(i + 1).padStart(3, "0"),
    syncedAt,
    ...c,
  }));

  // Collect distinct academies and teachers
  const academiesMap = new Map();
  for (const c of final) {
    const id = `${c.academy.includes("센텀") ? "eduin-centum" : (c.academy.includes("사직") ? "eduin-sajik" : "etc-" + (c.academy || "x"))}`;
    if (!academiesMap.has(id)) {
      academiesMap.set(id, { id, name: c.academy, area: c.area || "센텀" });
    }
  }
  const teachers = [...new Set(final.map(c => c.teacher).filter(Boolean))].sort();

  const out = {
    lastSyncedAt: syncedAt,
    source: `google-sheets:${SHEET_ID}`,
    tabReport,
    academies: [...academiesMap.values()],
    teachers,
    courses: final,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");

  const tabsOk = tabReport.filter(t => !t.error).length;
  console.log(`[sync] ${tabsOk}/${TABS.length} tabs OK → ${before} cells → ${deduped.length} dedup → ${OUT_PATH}`);
  console.log(`[sync] teachers: ${teachers.length}, academies: ${academiesMap.size}`);
  console.log(`[sync] done`);
})().catch(err => {
  console.error("[sync] crash:", err);
  process.exit(2);
});

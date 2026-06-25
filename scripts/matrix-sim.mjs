#!/usr/bin/env node
/* One-shot — replay inferCohorts heuristic on db/courses.json to print
 * the 8-grade × 4-subject matrix distribution. Used to verify
 * matrix coverage after the 학년 축 확장. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = JSON.parse(readFileSync(resolve(__dirname, "..", "db/courses.json"), "utf8"));

const GRADES = ["초5·6", "중1", "중2", "중3", "예비고1", "고1", "고2", "고3", "전 학년"];
const SUBJECTS = ["영어", "수학", "국어", "사회"];

function inferCohorts(c) {
  const g = (c.grade || "").trim();
  if (GRADES.includes(g) && g !== "전 학년") return [g];
  const t = String(c.title || c.course || "");
  const ct = (c.courseType || "").trim();
  if (/FREE\s*M\b/i.test(t)) return ["초5·6", "중1"];
  if (/FREE\s*SU\.?MID/i.test(t)) return ["중1", "중2", "중3"];
  const mMatch = t.match(/(?:^|\s)M\s*([123])(?:\s|$|문법|독해|단어|어휘)/);
  if (mMatch) return ["중" + mMatch[1]];
  const suMatch = t.match(/SU\.?MID\s*([123])/i);
  if (suMatch) return ["중" + suMatch[1]];
  if (/^SU\.?MID/i.test(t)) {
    if (t.includes("중등")) return ["중1", "중2", "중3"];
    if (t.includes("미적분") || t.includes("확통")) return ["고2"];
    return ["중1", "중2", "중3"];
  }
  if (/PRE\s*H/i.test(t) || /PRE\s*BH/i.test(t) || /PRE\s*BSFH/i.test(t) || /PRE\s*HH/i.test(t) || t.includes("예비고1")) return ["예비고1"];
  if (t.includes("정시파이터") || t.includes("수능실전")) return ["고3"];
  const schG = t.match(/[가-힣]+(중|고)([1-3])/);
  if (schG) {
    const tag = schG[1] + schG[2];
    if (GRADES.includes(tag)) return [tag];
  }
  if (t.includes("공통수학") || t.includes("공1심쟁") || t.includes("공2심쟁") || t.includes("대수")) return ["고1"];
  if (t.includes("미적분") || t.includes("확통")) return ["고2"];
  if (t.includes("중등")) return ["중1", "중2", "중3"];
  if (g === "중2") return ["중2"];
  if (g === "중1") return ["중1"];
  if (ct === "클리닉" || ct === "개별진도") return ["전 학년"];
  if (t.includes("자사특목고 정규")) return ["예비고1"];
  if (t.includes("문법") || t.includes("독해")) {
    if (/LEVEL\s*1/i.test(t)) return ["중1"];
    if (/LEVEL\s*2/i.test(t)) return ["중2"];
    if (/LEVEL\s*3/i.test(t)) return ["중3"];
    return ["고1"];
  }
  if (ct === "단어") {
    if (t.includes("중등")) return ["중1", "중2", "중3"];
    return ["고1"];
  }
  return g ? [g] : ["전 학년"];
}

const cell = {};
GRADES.forEach(g => { cell[g] = {}; SUBJECTS.forEach(s => { cell[g][s] = 0 }) });

let unique = 0, multi = 0;
for (const c of db.courses) {
  const gs = inferCohorts(c);
  const s = (c.subject || "").trim();
  if (!SUBJECTS.includes(s)) continue;
  if (gs.length > 1) multi++; else unique++;
  gs.forEach(g => { if (cell[g]) cell[g][s]++ });
}

// 박승혜·SU.MID 샘플 출력
const samples = db.courses.filter(c => /FREE\s*M|FREE\s*SU|^M[123]|^SU\.?MID|중[123]|초[56]/i.test(c.title || ""));
console.log("=== 박승혜·중등 키워드 매칭 강좌 ===");
for (const c of samples.slice(0, 15)) {
  console.log(`  ${c.teacher}T | ${c.subject} | ${c.title} | → ${inferCohorts(c).join(", ")}`);
}

console.log("\n=== 매트릭스 분포 (강좌 카운트, 다학년 강좌는 다중 카운트됨) ===");
console.log("학년".padEnd(10) + SUBJECTS.map(s => s.padStart(5)).join("") + "  합계");
for (const g of GRADES) {
  const row = SUBJECTS.map(s => cell[g][s]);
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum === 0) continue;
  console.log(g.padEnd(10) + row.map(v => String(v).padStart(5)).join("") + "  " + sum);
}

console.log(`\n총 강좌 ${db.courses.length} (단일학년 ${unique}, 다학년 ${multi})`);

#!/usr/bin/env node
/**
 * One-shot — fix area=사직 → 센텀 bug for 박승혜 courses in courses.json.
 * (sync-from-sheet.mjs 강사별 시간표 탭은 area=빈문자로 시작하지만 마지막
 *  매핑이 사직이라 area="사직"으로 새는 버그가 있음. academy가
 *  "교육인학원 센텀점"이면 area를 "센텀"으로 보정.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(__dirname, "..", "db/courses.json");

const db = JSON.parse(readFileSync(PATH, "utf8"));
let fixed = 0;
for (const c of db.courses) {
  // academy와 area/academyTag 불일치 보정
  const expected = c.academy.includes("사직") ? "사직" : "센텀";
  if (c.area !== expected || c.academyTag !== expected) {
    c.area = expected;
    c.academyTag = expected;
    fixed++;
  }
}
writeFileSync(PATH, JSON.stringify(db, null, 2), "utf8");
console.log(`[fix] ${fixed} course(s) had area/academyTag mismatch with academy. fixed.`);

#!/usr/bin/env node
/**
 * One-shot purge — apply teacher/academy whitelist to db/courses.json in-place.
 * Used after merging a remote sync that contained non-whitelisted data.
 *
 * Run:
 *   node scripts/purge-whitelist.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(__dirname, "..", "db/courses.json");
const SEED_PATH = resolve(__dirname, "..", "db/seed.sql");

const TEACHER_WHITELIST = new Set([
  "윤훈관", "정준호", "이영환", "김형석",
  "차동우", "권정은", "강필",   "김규생",
  "박승혜",
]);
const ACADEMY_WHITELIST = new Set([
  "교육인학원 센텀점",
  "교육인학원 사직점",
]);

const db = JSON.parse(readFileSync(PATH, "utf8"));
const before = (db.courses || []).length;

db.courses = (db.courses || []).filter(c =>
  TEACHER_WHITELIST.has(c.teacher) && ACADEMY_WHITELIST.has(c.academy)
);

const after = db.courses.length;

// Refresh academies index
const academiesMap = new Map();
for (const c of db.courses) {
  const id = c.academy.includes("사직") ? "eduin-sajik" : "eduin-centum";
  if (!academiesMap.has(id)) {
    academiesMap.set(id, { id, name: c.academy, area: id === "eduin-sajik" ? "사직" : "센텀" });
  }
}
db.academies = [...academiesMap.values()];

// Refresh teachers
db.teachers = [...new Set(db.courses.map(c => c.teacher).filter(Boolean))].sort();

writeFileSync(PATH, JSON.stringify(db, null, 2), "utf8");

console.log(`[purge] ${before} → ${after} courses`);
console.log(`[purge] academies: ${db.academies.map(a => a.name).join(", ")}`);
console.log(`[purge] teachers : ${db.teachers.join(", ")}`);

/* ============================================================
 * seed.sql — drop INSERT + matching "on conflict" pair when teacher
 * is not in the whitelist. The two lines always come together.
 * ============================================================ */
const teacherRe = /'([가-힣\s]{2,8})'\s*,'(고|중|초)/;  // insert (... ,teacher,'grade)
let seed = readFileSync(SEED_PATH, "utf8");
const lines = seed.split(/\r?\n/);
const kept = [];
let dropPair = false;
let droppedSeed = 0;
for (const line of lines) {
  if (dropPair) {
    // skip the matching "on conflict ..." follow-up line
    dropPair = false;
    droppedSeed++;
    continue;
  }
  if (line.startsWith("insert into public.courses")) {
    const m = line.match(/,'([가-힣\s]{2,12})','(?:고|중|초)/);
    if (m) {
      const t = m[1].trim();
      if (!TEACHER_WHITELIST.has(t)) {
        dropPair = true;
        droppedSeed++;
        continue;
      }
    }
  }
  kept.push(line);
}
writeFileSync(SEED_PATH, kept.join("\n"), "utf8");
console.log(`[purge] seed.sql: ${droppedSeed} lines dropped (${droppedSeed/2} course inserts)`);

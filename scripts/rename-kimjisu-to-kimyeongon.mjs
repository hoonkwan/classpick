#!/usr/bin/env node
/**
 * One-shot — restore 김지수 courses from remote sync commit (0efa598),
 * rename teacher → 김영온, merge into current db/courses.json.
 * (subject 보정: 국어 강사이므로 시트가 다른 과목으로 잡았다면 강제 국어로)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(__dirname, "..", "db/courses.json");
const REMOTE_COMMIT = "0efa598";
const OLD_TEACHER = "김지수";
const NEW_TEACHER = "김영온";

const remoteRaw = execSync(`git show ${REMOTE_COMMIT}:db/courses.json`, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
const remote = JSON.parse(remoteRaw);
const oldCourses = (remote.courses || []).filter(c => c.teacher === OLD_TEACHER);

console.log(`[rename] found ${oldCourses.length} ${OLD_TEACHER} course(s) in ${REMOTE_COMMIT}:`);
for (const c of oldCourses) {
  console.log(`  · ${c.academy} | ${c.subject} | ${c.title || c.course} | ${c.days?.join("")} ${c.timeStart}-${c.timeEnd}`);
}

if (oldCourses.length === 0) {
  console.log(`[rename] no ${OLD_TEACHER} courses found. exiting.`);
  process.exit(0);
}

const db = JSON.parse(readFileSync(PATH, "utf8"));
db.courses = db.courses || [];

// Dedupe key — title + days + timeStart + academy
const existKey = new Set(db.courses.map(c =>
  [c.teacher, c.title, (c.days || []).join(""), c.timeStart, c.academy].join("|")
));

let added = 0;
let skipped = 0;
let nextId = db.courses.length + 1;
for (const c of oldCourses) {
  // academy↔area 일관성 보정
  const area = c.academy.includes("사직") ? "사직" : "센텀";
  const renamed = {
    ...c,
    id: `auto-${String(nextId++).padStart(3, "0")}`,
    teacher: NEW_TEACHER,
    subject: "국어",
    area,
    academyTag: area,
  };
  const k = [renamed.teacher, renamed.title, (renamed.days || []).join(""), renamed.timeStart, renamed.academy].join("|");
  if (existKey.has(k)) { skipped++; continue; }
  db.courses.push(renamed);
  existKey.add(k);
  added++;
}

// Refresh teachers index
db.teachers = [...new Set(db.courses.map(c => c.teacher).filter(Boolean))].sort();

writeFileSync(PATH, JSON.stringify(db, null, 2), "utf8");

console.log(`[rename] added ${added} ${NEW_TEACHER} course(s), skipped ${skipped} dup`);
console.log(`[rename] teachers now: ${db.teachers.join(", ")}`);
console.log(`[rename] total courses: ${db.courses.length}`);

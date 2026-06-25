#!/usr/bin/env node
/**
 * One-shot — restore 박승혜 courses from remote sync commit (0efa598)
 * into current db/courses.json, refresh teachers list.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(__dirname, "..", "db/courses.json");
const REMOTE_COMMIT = "0efa598";

const remoteRaw = execSync(`git show ${REMOTE_COMMIT}:db/courses.json`, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
const remote = JSON.parse(remoteRaw);
const park = (remote.courses || []).filter(c => c.teacher === "박승혜");

console.log(`[restore] found ${park.length} 박승혜 course(s) in ${REMOTE_COMMIT}:`);
for (const c of park) {
  console.log(`  · ${c.academy} | ${c.subject} | ${c.title || c.course} | ${c.days?.join("")} ${c.timeStart}-${c.timeEnd} | ${c.term || "-"}`);
}

if (park.length === 0) {
  console.log("[restore] no 박승혜 courses found. exiting.");
  process.exit(0);
}

const db = JSON.parse(readFileSync(PATH, "utf8"));
db.courses = db.courses || [];

// Avoid duplicates: key by teacher|days|timeStart|subject|grade
const existKey = new Set(db.courses.map(c =>
  [c.teacher, (c.days || []).join(""), c.timeStart, c.subject, c.grade].join("|")
));

let added = 0;
let skipped = 0;
let nextId = db.courses.length + 1;
for (const c of park) {
  const k = [c.teacher, (c.days || []).join(""), c.timeStart, c.subject, c.grade].join("|");
  if (existKey.has(k)) { skipped++; continue; }
  // Reassign id to avoid collision
  const newId = `auto-${String(nextId++).padStart(3, "0")}`;
  db.courses.push({ ...c, id: newId });
  existKey.add(k);
  added++;
}

// Refresh teachers index
db.teachers = [...new Set(db.courses.map(c => c.teacher).filter(Boolean))].sort();

writeFileSync(PATH, JSON.stringify(db, null, 2), "utf8");

console.log(`[restore] added ${added}, skipped ${skipped} duplicate(s)`);
console.log(`[restore] teachers now: ${db.teachers.join(", ")}`);
console.log(`[restore] total courses: ${db.courses.length}`);

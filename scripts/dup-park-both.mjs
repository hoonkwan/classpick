#!/usr/bin/env node
/**
 * One-shot — duplicate 박승혜 courses to both campuses (센텀·사직).
 * 양점 공용 특강이라 양쪽 점에서 노출되어야 함.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(__dirname, "..", "db/courses.json");

const db = JSON.parse(readFileSync(PATH, "utf8"));

// Find 박승혜 courses
const park = db.courses.filter(c => c.teacher === "박승혜");
const others = db.courses.filter(c => c.teacher !== "박승혜");

console.log(`[dup] found ${park.length} 박승혜 course(s) before expansion`);

// Take only 센텀 records as canonical (dedupe by title+days+timeStart)
const canonicalMap = new Map();
for (const c of park) {
  const key = `${c.title}|${(c.days || []).join("")}|${c.timeStart}`;
  if (!canonicalMap.has(key)) {
    canonicalMap.set(key, c);
  }
}
const canonical = [...canonicalMap.values()];
console.log(`[dup] canonical (deduped by title|days|time): ${canonical.length}`);

// Build expanded list: each canonical → 센텀 + 사직 copy
const expanded = [];
let nextId = others.length + 1;
for (const c of canonical) {
  expanded.push({
    ...c,
    id: `auto-${String(nextId++).padStart(3, "0")}`,
    academy: "교육인학원 센텀점",
    academyTag: "센텀",
    area: "센텀",
  });
  expanded.push({
    ...c,
    id: `auto-${String(nextId++).padStart(3, "0")}`,
    academy: "교육인학원 사직점",
    academyTag: "사직",
    area: "사직",
  });
}

db.courses = [...others, ...expanded];

// Refresh teachers
db.teachers = [...new Set(db.courses.map(c => c.teacher).filter(Boolean))].sort();

writeFileSync(PATH, JSON.stringify(db, null, 2), "utf8");
console.log(`[dup] 박승혜: ${park.length} → ${expanded.length} (canonical × 2 campuses)`);
console.log(`[dup] total courses: ${db.courses.length}`);
console.log(`[dup] teachers: ${db.teachers.join(", ")}`);

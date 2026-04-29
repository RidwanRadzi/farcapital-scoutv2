#!/usr/bin/env node
/**
 * Usage: node scripts/seedProjects.mjs [path-to-csv]
 * Default CSV path: scripts/projects.csv
 *
 * CSV column convention:
 *   col 0 — project name
 *   col 1 — developer
 *   col 2 or 3 — state
 *   any column — completion year (4-digit, 2018–2030)
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const csvPath = resolve(process.argv[2] ?? "scripts/projects.csv");

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    // Simple CSV split — handles quoted fields
    const cols = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    rows.push(cols);
  }
  return rows;
}

function findYear(cols) {
  for (const col of cols) {
    const m = col.match(/\b(201[8-9]|202[0-9]|2030)\b/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

const text = readFileSync(csvPath, "utf-8");
const rows = parseCSV(text);

// Skip header row if first cell looks like a label
const dataRows = rows[0]?.[0]?.toLowerCase().includes("project")
  ? rows.slice(1)
  : rows;

const projects = [];

for (const cols of dataRows) {
  const name = cols[0]?.trim();
  if (!name) continue;

  const developer = cols[1]?.trim() ?? "";
  const state = (cols[3]?.trim() || cols[2]?.trim()) ?? "";
  const completion_year = findYear(cols);

  projects.push({ name, developer, state, ...(completion_year !== undefined ? { completion_year } : {}) });
}

console.log(`Parsed ${projects.length} projects from ${csvPath}`);

if (projects.length === 0) {
  console.log("Nothing to seed.");
  process.exit(0);
}

const argsJson = JSON.stringify({ projects });

try {
  const output = execSync(`npx convex run projects:seedFromCSV '${argsJson.replace(/'/g, "'\\''")}'`, {
    stdio: ["pipe", "pipe", "inherit"],
  }).toString();

  const result = JSON.parse(output.trim());
  console.log(`Seeded: ${result.inserted} inserted, ${result.skipped} skipped (already exist)`);
} catch (err) {
  console.error("Failed to run convex:", err.message);
  process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Checks every army of data/index.json. Paths are compared with their exact spelling: GitHub Pages is
// case-sensitive, while Windows and macOS are not, so "ear-de/chaos" would work locally and give a 404 online.
const root = fileURLToPath(new URL("../data/", import.meta.url));
const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));

function existsExact(relPath) {
  let dir = root;
  const parts = relPath.split("/");
  for (let i = 0; i < parts.length; i++) {
    const names = readdirSync(dir);
    if (!names.includes(parts[i])) return false;
    dir = join(dir, parts[i]);
  }
  return true;
}

test("every army of the index has its data file and profile file under exactly that path", () => {
  const missing = [];
  for (const a of index.armies)
    for (const file of [`${a.id}.json`, `${a.id}.profiles.json`]) if (!existsExact(file)) missing.push(file);
  assert.deepEqual(missing, []);
});

test("army ids are unique and every army belongs to a ruleset of the index", () => {
  const ids = index.armies.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  const rulesets = new Set(index.rulesets.map((r) => r.id));
  for (const a of index.armies) assert.ok(rulesets.has(a.ruleset), `${a.id}: ruleset ${a.ruleset}`);
});

test("every army file can be read and carries units, formations and upgrades", () => {
  for (const a of index.armies) {
    const d = JSON.parse(readFileSync(join(root, `${a.id}.json`), "utf8"));
    for (const key of ["units", "formations", "upgrades", "sections"]) assert.ok(d[key], `${a.id}: ${key}`);
    const p = JSON.parse(readFileSync(join(root, `${a.id}.profiles.json`), "utf8"));
    assert.ok(p.units || p.profiles, `${a.id}: profiles`);
  }
});

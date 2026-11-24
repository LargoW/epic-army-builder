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

test("all formation upgrades are strings and resolve to an existing upgrade definition", () => {
  const issues = [];
  for (const a of index.armies) {
    const d = JSON.parse(readFileSync(join(root, `${a.id}.json`), "utf8"));
    const upgrades = new Set((d.upgrades || []).map((u) => u.id));
    for (const f of d.formations || []) {
      for (const up of f.upgrades || []) {
        if (typeof up !== "string") issues.push(`${a.id} formation ${f.id}: malformed non-string upgrade ${JSON.stringify(up)}`);
        else if (!upgrades.has(up)) issues.push(`${a.id} formation ${f.id}: dangling upgrade ref ${up}`);
      }
    }
  }
  assert.deepEqual(issues, [], "no malformed or dangling formation upgrades");
});

test("all units referenced in formations and upgrade effects resolve to an existing unit definition", () => {
  const issues = [];
  for (const a of index.armies) {
    const d = JSON.parse(readFileSync(join(root, `${a.id}.json`), "utf8"));
    const unitIds = new Set(Object.keys(d.units || {}));
    for (const f of d.formations || []) {
      for (const u of f.units || []) {
        const slots = u.oneOf ? u.oneOf.map((x) => (typeof x === "string" ? x : x.unit)) : (u.unit ? [u.unit] : []);
        for (const uid of slots) {
          if (!unitIds.has(uid)) issues.push(`${a.id} formation ${f.id}: missing unit ${uid}`);
        }
      }
    }
    for (const up of d.upgrades || []) {
      for (const v of up.variants || []) {
        for (const fx of v.effects || []) {
          if (fx.unit && !unitIds.has(fx.unit)) issues.push(`${a.id} upgrade ${up.id}: missing add unit ${fx.unit}`);
          if (fx.from && !unitIds.has(fx.from)) issues.push(`${a.id} upgrade ${up.id}: missing replace from unit ${fx.from}`);
          if (fx.to && !unitIds.has(fx.to)) issues.push(`${a.id} upgrade ${up.id}: missing replace to unit ${fx.to}`);
        }
      }
    }
  }
  assert.deepEqual(issues, [], "no dangling unit references");
});

test("all formations referenced in sections resolve to an existing formation definition", () => {
  const issues = [];
  for (const a of index.armies) {
    const d = JSON.parse(readFileSync(join(root, `${a.id}.json`), "utf8"));
    const formIds = new Set((d.formations || []).map((f) => f.id));
    for (const s of d.sections || []) {
      for (const fid of s.formations || []) {
        if (!formIds.has(fid)) issues.push(`${a.id} section ${s.id}: missing formation ${fid}`);
      }
    }
  }
  assert.deepEqual(issues, [], "no dangling section formations");
});

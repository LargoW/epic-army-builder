import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, summarize, validate, withProfiles, rosterProfiles,
} from "../engine/engine.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const base = load("../data/ear-de/ig/steellegion.json");
const profiles = load("../data/ear-de/ig/steellegion.profiles.json");
const data = withProfiles(base, profiles);

test("every unit id has a profile with stats and resolved weapons", () => {
  for (const id of Object.keys(base.units)) {
    const p = profiles.units[id];
    assert.ok(p, `profile for ${id}`);
    assert.ok(p.type, `type of ${id}`);
    assert.ok(Array.isArray(p.weapons) && Array.isArray(p.specialRules));
  }
});

test("profiles carry weapon modes, counts and rule texts", () => {
  const chimera = profiles.units.chimera;
  assert.equal(chimera.type, "AV");
  assert.equal(chimera.speed, 30);
  assert.ok(chimera.weapons.length >= 2);
  assert.ok(chimera.weapons.every((w) => w.modes.length > 0 && w.modes[0].firepower));
  assert.equal(chimera.specialRules[0].name, "Transport");
  assert.match(chimera.notes, /Infanterieeinheiten/);
  const counted = Object.values(profiles.units).flatMap((u) => u.weapons).filter((w) => w.count);
  assert.ok(counted.length > 0);
  assert.ok(counted.every((w) => typeof w.count === "number" || /^[\d-]+$/.test(w.count)));
});

test("army-level special rules are included with text", () => {
  assert.equal(profiles.specialRules[0].name, "Mut, Disziplin und Loyalität");
  assert.ok(profiles.specialRules[0].description);
});

test("rosterProfiles lists each unit of a formation with its profile", () => {
  let s = addFormation(createState(), "mech-company");
  const { entries } = summarize(data, s);
  const list = rosterProfiles(data, entries[0].roster);
  assert.deepEqual(list.map((r) => r.unit), ["commander", "commissar", "infantry", "chimera"]);
  assert.equal(list.find((r) => r.unit === "chimera").count, 5);
  assert.ok(list.every((r) => r.profile));
});

test("rosterProfiles reflects replace effects (Manticores, not Basilisks)", () => {
  let s = addFormation(createState(), "art-company");
  s = setUpgrade(s, 1, "manticores-6", "6");
  const list = rosterProfiles(data, summarize(data, s).entries[0].roster);
  assert.deepEqual(list.map((r) => r.unit), ["commissar", "manticore"]);
});

test("carriability uses profile rules: Rough Riders are Beritten and not carried", () => {
  assert.ok(data.units["rough-rider"].rules.includes("Beritten"));
  assert.ok(!data.units.infantry.rules.includes("Beritten"));
  let s = addFormation(createState(), "mech-company");
  s = setUpgrade(s, 1, "ogryns", "1", 1);
  assert.deepEqual(validate(data, s), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, setSize, summarize, validate, withProfiles, rosterProfiles,
} from "../engine/engine.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

// T'au Vior'la (Epic UK). Expected values are taken from data/euk/tau/tauViorla.json.
// Tests marked `todo` describe the intended behaviour but fail on the current data/engine;
// see the reason string. They do not fail the run. Remove `todo` once the cause is fixed.
const load = (p) => JSON.parse(readFileSync(new URL(`../data/euk/tau/${p}.json`, import.meta.url), "utf8"));
const raw = load("tauViorla");
const profiles = load("tauViorla.profiles");
const data = withProfiles(raw, profiles);
const ARMY = "euk/tau/tauViorla";

function army(...ids) {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
}
const codes = (s) => validate(data, s).map((v) => v.code);
const entry = (s, i = 0) => summarize(data, s).entries[i];
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

// ---------------------------------------------------------------- data integrity

test("all unit, upgrade and section references resolve and every unit has a profile", () => {
  const units = new Set(Object.keys(data.units));
  const upgrades = new Set(data.upgrades.map((u) => u.id));
  const formations = new Set(data.formations.map((f) => f.id));
  for (const f of data.formations) {
    for (const slot of f.units) for (const u of [slot.unit, ...(slot.oneOf || [])].filter(Boolean)) assert.ok(units.has(u), `${f.id}: unit ${u}`);
    for (const z of f.sizes || []) for (const slot of z.units || []) assert.ok(units.has(slot.unit), `${f.id}/${z.id}: unit ${slot.unit}`);
    for (const u of f.upgrades) assert.ok(upgrades.has(u), `${f.id}: upgrade ${u}`);
  }
  for (const u of data.upgrades)
    for (const v of u.variants)
      for (const fx of v.effects) for (const id of [fx.unit, fx.from, fx.to].filter(Boolean)) assert.ok(units.has(id), `${u.id}/${v.id}: unit ${id}`);
  const inSection = data.sections.flatMap((s) => s.formations);
  for (const id of inSection) assert.ok(formations.has(id), `section lists unknown formation ${id}`);
  for (const f of data.formations) assert.equal(inSection.filter((x) => x === f.id).length, 1, `${f.id} in exactly one section`);
  for (const id of units) assert.ok(profiles.units[id], `profile for ${id}`);
  assert.deepEqual(data.upgrades.filter((u) => !data.formations.some((f) => f.upgrades.includes(u.id))), [], "unused upgrades");
});

test("section and tag agree: cadres are core, support is support, air and ships are navytitan", () => {
  const tagOf = { cadres: "core", support: "support", air: "navytitan" };
  for (const s of data.sections)
    for (const id of s.formations) assert.ok(data.formations.find((f) => f.id === id).tags.includes(tagOf[s.id]), `${id} in ${s.id}`);
});

test("every formation is valid in its base configuration (support needs a core, navy/titans are limited by share)", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    const allowed = [...(f.tags.includes("navytitan") ? ["share-limit"] : []), ...(f.tags.includes("support") ? ["formation-limit"] : [])];
    assert.deepEqual(codes(s).filter((c) => !allowed.includes(c)), [], f.id);
  }
});

test("constraint selectors point at existing tags, formations or upgrades", () => {
  const tags = new Set(data.formations.flatMap((f) => f.tags || []));
  const ids = new Set([...data.formations.map((f) => f.id), ...data.upgrades.map((u) => u.id)]);
  const bad = [];
  const check = (where, sel) => arr(sel).forEach((s) => {
    if (s === "*") return;
    if (s.startsWith("tag:") ? !tags.has(s.slice(4)) : !ids.has(s)) bad.push(`${where}: "${s}"`);
  });
  for (const c of raw.formationConstraints || []) { check(`${c.id}.from`, c.from); check(`${c.id}.forEach`, c.forEach); }
  for (const c of raw.upgradeConstraints || []) { check(`${c.id}.from`, c.from); check(`${c.id}.appliesTo`, c.appliesTo); }
  (raw.initiative || []).forEach((i, n) => check(`initiative[${n}]`, i.formations));
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- base formations

test("base points and units of every formation", () => {
  const expected = {
    "f-crisis-cadre": [325, { "shas-el": 1, "xv8-crisis": 6 }],
    "f-stealth-cadre": [225, { "xv15-stealth": 6 }],
    "f-breacher-cadre": [225, { "viorla-fire-warriors": 8 }],
    "f-pathfinder-group": [200, { "pathfinder-team": 4, devilfish: 2, "gun-drone": 2 }],
    "f-heavy-battlesuit": [350, { "shas-el": 1, riptide: 3 }],
    "f-stormsurge-formation": [250, { stormsurge: 2 }],
    "f-supremacy-formation": [225, { supremacy: 1 }],
    "f-broadside-group": [300, { "xv88-broadside": 6, "gun-drone": 2 }],
    "f-razorshark": [200, { razorshark: 3 }],
    "f-sunshark": [200, { sunshark: 2 }],
    "f-orca": [150, { orca: 1 }],
    "f-cruiser": [200, { "protector-cruiser": 1 }],
    "f-manta": [650, { manta: 1 }],
  };
  assert.deepEqual(Object.keys(expected).sort(), data.formations.map((f) => f.id).sort(), "table covers every formation");
  for (const [id, [pts, roster]] of Object.entries(expected)) {
    const [s] = army(id);
    assert.equal(entry(s).pts, pts, `${id} points`);
    assert.deepEqual(entry(s).roster, roster, `${id} roster`);
  }
});

test("rosterProfiles resolves a profile for every unit of every formation", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    const list = rosterProfiles(data, entry(s).roster);
    assert.ok(list.length > 0, f.id);
    assert.ok(list.every((r) => r.profile && r.name), `${f.id}: profile and name`);
  }
});

// ---------------------------------------------------------------- upgrades

test("switching between variants of one upgrade replaces the previous choice (never adds)", () => {
  for (const f of data.formations)
    for (const upId of f.upgrades) {
      const up = data.upgrades.find((u) => u.id === upId);
      const basePts = entry(army(f.id)[0]).pts;
      for (const a of up.variants)
        for (const b of up.variants) {
          let [s, [u]] = army(f.id);
          s = setUpgrade(s, u, up.id, a.id);
          s = setUpgrade(s, u, up.id, b.id);
          assert.equal(s.formations[0].upgrades.length, 1, `${f.id}/${up.id} ${a.id}->${b.id}: one entry`);
          assert.equal(entry(s).pts, basePts + b.pts, `${f.id}/${up.id} ${a.id}->${b.id}: points`);
        }
    }
});

test("crisis cadre: Shas'O, extra Crisis suits and Gun Drones add units and points", () => {
  let [s, [u]] = army("f-crisis-cadre");
  s = setUpgrade(s, u, "u-shas-o", "1");
  s = setUpgrade(s, u, "u-crisis", "2");
  s = setUpgrade(s, u, "u-gun-drones", "1");
  assert.equal(entry(s).pts, 325 + 50 + 75 + 25);
  assert.deepEqual(entry(s).roster, { "shas-el": 1, "xv8-crisis": 8, "shas-o": 1, "gun-drone": 2 });
  assert.deepEqual(codes(s), []);
});

test("breacher cadre: Fire Warriors with Devilfish, Skyray, Broadsides and the points-only Bonded Team", () => {
  let [s, [u]] = army("f-breacher-cadre");
  s = setUpgrade(s, u, "u-fire-warriors", "1");
  assert.deepEqual(entry(s).roster, { "viorla-fire-warriors": 10 });
  s = setUpgrade(s, u, "u-fire-warriors", "2");
  assert.equal(entry(s).pts, 225 + 75);
  assert.deepEqual(entry(s).roster, { "viorla-fire-warriors": 10, devilfish: 1 });
  s = setUpgrade(s, u, "u-skyray", "1");
  s = setUpgrade(s, u, "u-broadsides", "1");
  assert.equal(entry(s).pts, 225 + 75 + 100 + 150);
  assert.deepEqual(entry(s).roster, { "viorla-fire-warriors": 10, devilfish: 1, skyray: 1, "xv88-broadside": 3 });
  s = setUpgrade(s, u, "u-bonded-team", "1");
  assert.equal(entry(s).pts, 225 + 75 + 100 + 150 + 25, "Bonded Team costs points but adds no unit");
  assert.equal(Object.values(entry(s).roster).reduce((a, b) => a + b, 0), 10 + 1 + 1 + 3);
  assert.deepEqual(codes(s), []);
});

test("heavy battlesuit formation: one extra Riptide, R'varna or Y'vahra for 100", () => {
  const expected = { 1: { "shas-el": 1, riptide: 4 }, 2: { "shas-el": 1, riptide: 3, rvarna: 1 }, 3: { "shas-el": 1, riptide: 3, yvahra: 1 } };
  for (const [variant, roster] of Object.entries(expected)) {
    let [s, [u]] = army("f-heavy-battlesuit");
    s = setUpgrade(s, u, "u-heavy-battlesuit", variant);
    assert.equal(entry(s).pts, 450, variant);
    assert.deepEqual(entry(s).roster, roster, variant);
  }
});

test("upgrades are only offered where the formation lists them", () => {
  let [s, [u]] = army("f-crisis-cadre");
  s = setUpgrade(s, u, "u-broadsides", "1");
  assert.ok(codes(s).includes("upgrade-not-allowed"));
  [s, [u]] = army("f-stormsurge-formation");
  s = setUpgrade(s, u, "u-gun-drones", "1");
  assert.ok(codes(s).includes("upgrade-not-allowed"));
});

test("Ghostkeel: every purchased suit replaces one Stealth suit, price per suit, at most 3", () => {
  const expected = { 1: [250, { "xv15-stealth": 5, "xv95-ghostkeel": 1 }], 2: [275, { "xv15-stealth": 4, "xv95-ghostkeel": 2 }], 3: [300, { "xv15-stealth": 3, "xv95-ghostkeel": 3 }] };
  for (const [n, [pts, roster]] of Object.entries(expected)) {
    let [s, [u]] = army("f-stealth-cadre");
    s = setUpgrade(s, u, "u-ghostkeel", "1", 0, Number(n));
    assert.equal(entry(s).pts, pts, `${n} Ghostkeel points`);
    assert.deepEqual(entry(s).roster, roster, `${n} Ghostkeel roster`);
    assert.deepEqual(codes(s), [], `${n} Ghostkeel valid`);
  }
  let [s, [u]] = army("f-stealth-cadre");
  s = setUpgrade(s, u, "u-ghostkeel", "1", 0, 4);
  assert.deepEqual(codes(s), ["variant-max"], "a fourth Ghostkeel is over the limit but still enough Stealths");
  s = setUpgrade(s, u, "u-ghostkeel", "1", 0, 7);
  assert.deepEqual(codes(s).sort(), ["replace-insufficient", "variant-max"], "seven Ghostkeels would need seven Stealths");
});

test("Ghostkeel is only available to the Stealth cadre", () => {
  const [s, [u]] = army("f-crisis-cadre");
  assert.ok(codes(setUpgrade(s, u, "u-ghostkeel", "1", 0, 1)).includes("upgrade-not-allowed"));
});

// ---------------------------------------------------------------- limits

test("navy and titans: at most one third of the army (exactly one third is allowed)", () => {
  let [s] = army("f-crisis-cadre", "f-razorshark");
  assert.deepEqual(codes(s), ["share-limit"]);
  [s] = army("f-crisis-cadre", "f-crisis-cadre", "f-crisis-cadre", "f-crisis-cadre", "f-manta");
  assert.equal(summarize(data, s).total, 1950);
  assert.deepEqual(codes(s), [], "650 of 1950 is exactly one third");
  [s] = army("f-crisis-cadre", "f-crisis-cadre", "f-crisis-cadre", "f-crisis-cadre", "f-manta", "f-orca");
  assert.deepEqual(codes(s), ["share-limit"], "one more navy formation tips it over");
});

test("support formations: at most two per core formation, none without a core", () => {
  let [s] = army("f-crisis-cadre", "f-pathfinder-group", "f-heavy-battlesuit");
  assert.deepEqual(codes(s), [], "two support formations for one core");
  [s] = army("f-crisis-cadre", "f-pathfinder-group", "f-heavy-battlesuit", "f-broadside-group");
  assert.ok(codes(s).includes("formation-limit"), "three support formations for one core");
  [s] = army("f-crisis-cadre", "f-stealth-cadre", "f-pathfinder-group", "f-heavy-battlesuit", "f-broadside-group", "f-stormsurge-formation");
  assert.deepEqual(codes(s), [], "two cores allow four support formations");
  [s] = army("f-pathfinder-group");
  assert.ok(codes(s).includes("formation-limit"), "support formation without any core");
});

test("a core formation may take at most four upgrades", () => {
  const four = ["u-bonded-team", "u-fireblade", "u-ethereal", "u-gun-drones"];
  let [s, [u]] = army("f-breacher-cadre");
  for (const up of four) s = setUpgrade(s, u, up, "1");
  assert.deepEqual(codes(s), [], "four upgrades");
  s = setUpgrade(s, u, "u-skyray", "1");
  assert.ok(codes(s).includes("upgrade-limit"), "five upgrades");
});

// ---------------------------------------------------------------- exchange

test("export -> link -> import round-trips sizes, per-unit counts and upgrades", () => {
  let [s, [crisis, stealth, breacher]] = army("f-crisis-cadre", "f-stealth-cadre", "f-breacher-cadre");
  s = setUpgrade(s, crisis, "u-crisis", "2");
  s = setUpgrade(s, stealth, "u-ghostkeel", "1", 0, 3);
  s = setSize(s, breacher, "transport");
  const { total, entries } = summarize(data, s);
  const exp = buildExport({ army: ARMY, armyVersion: raw.version, name: "Stress Test Tau", state: s, entries, total });
  assert.equal(exp.ruleset, "euk");
  assert.equal(exp.formations[1].upgrades[0].count, 3);
  assert.equal(exp.formations[2].size, "transport");
  const back = sanitize(parseInput(toToken(exp)), data);
  assert.deepEqual(back.state, s);
  assert.equal(back.dropped, 0);
  assert.equal(summarize(data, back.state).total, total);
});

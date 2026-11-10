import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, summarize, validate, withProfiles, rosterProfiles,
} from "../engine/engine.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

// Thousand Sons (Epic UK). Expected values are taken from data/euk/chaos/ts.json.
// Tests marked `todo` describe the intended behaviour but fail on the current data/engine;
// see the reason string. They do not fail the run. Remove `todo` once the cause is fixed.
const load = (p) => JSON.parse(readFileSync(new URL(`../data/euk/chaos/${p}.json`, import.meta.url), "utf8"));
const raw = load("ts");
const profiles = load("ts.profiles");
const data = withProfiles(raw, profiles);
const ARMY = "euk/chaos/ts";

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

test("all unit, upgrade and section references resolve", () => {
  const units = new Set(Object.keys(data.units));
  const upgrades = new Set(data.upgrades.map((u) => u.id));
  const formations = new Set(data.formations.map((f) => f.id));
  for (const f of data.formations) {
    for (const slot of f.units) for (const u of [slot.unit, ...(slot.oneOf || [])].filter(Boolean)) assert.ok(units.has(u), `${f.id}: unit ${u}`);
    for (const u of f.upgrades) assert.ok(upgrades.has(u), `${f.id}: upgrade ${u}`);
  }
  for (const u of data.upgrades)
    for (const v of u.variants) {
      for (const fx of v.effects) for (const id of [fx.unit, fx.from, fx.to].filter(Boolean)) assert.ok(units.has(id), `${u.id}/${v.id}: unit ${id}`);
      for (const id of u.show || []) assert.ok(units.has(id), `${u.id}: show ${id}`);
    }
  assert.ok(units.has(raw.transport[0].vehicle), "transport vehicle");
  const inSection = data.sections.flatMap((s) => s.formations);
  for (const id of inSection) assert.ok(formations.has(id), `section lists unknown formation ${id}`);
  for (const f of data.formations) assert.equal(inSection.filter((x) => x === f.id).length, 1, `${f.id} in exactly one section`);
  assert.deepEqual(data.upgrades.filter((u) => !data.formations.some((f) => f.upgrades.includes(u.id))), [], "unused upgrades");
});

test("every unit has a profile, except the three rule markers", () => {
  const without = Object.keys(data.units).filter((id) => !profiles.units[id]).sort();
  assert.deepEqual(without, ["daemonic-pact", "lesser-daemon", "ts-teleport"]);
  for (const f of data.formations) {
    const [s] = army(f.id);
    const list = rosterProfiles(data, entry(s).roster);
    assert.ok(list.every((r) => r.name), `${f.id}: names`);
  }
});

test("every formation is valid in its base configuration (support/elite need a core, navy/titans are limited by share)", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    const allowed = [
      ...(f.tags.includes("navy-titan") ? ["share-limit"] : []),
      ...(f.tags.includes("support") || f.tags.includes("elite") ? ["formation-limit"] : []),
    ];
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
  for (const t of raw.transport || []) check(`transport ${t.id}.appliesTo`, t.appliesTo);
  (raw.initiative || []).forEach((i, n) => check(`initiative[${n}]`, i.formations));
  assert.deepEqual(bad, []);
});

test("a formation's tag matches the section it is listed in (core, elite, support)", () => {
  for (const s of data.sections.filter((x) => ["core", "elite", "support"].includes(x.id)))
    for (const id of s.formations) assert.ok(data.formations.find((f) => f.id === id).tags.includes(s.id), `${id} is listed under ${s.id}`);
});

// ---------------------------------------------------------------- base formations

test("base points and units of every formation", () => {
  const expected = {
    "f-ts-retinue": [275, { "cabal-of-sorcerers": 1, "thousand-sons": 5 }],
    "f-ts-terminators": [350, { "csm-lord": 1, "ts-terminators": 4 }],
    "f-spawn-horde": [225, { "chaos-spawn": 5 }],
    "f-armoured-company": [175, { "chaos-predator": 4 }],
    "f-defiler-pack": [275, { "ts-defiler": 4 }],
    "f-disc-riders": [275, { "csm-lord": 1, "ts-disc-riders": 8 }],
    "f-silver-towers": [300, { "chaos-silver-tower": 4 }],
    "f-tzaangor-herd": [200, { tzaangor: 10 }],
    "f-doomwings": [150, { "chaos-doomwing": 3 }],
    "f-firelords": [250, { "chaos-firelord": 2 }],
    "f-navy-cruiser": [150, { "devastation-cruiser": 1 }],
    "f-warphound": [300, { "warphound-titan": 1 }],
    "f-mutator": [650, { "mutator-titan": 1 }],
    "f-warplord": [800, { "warplord-titan": 1 }],
    "f-lesser-daemon-pool": [0, {}],
    "f-greater-daemon-pool": [0, {}],
  };
  assert.deepEqual(Object.keys(expected).sort(), data.formations.map((f) => f.id).sort(), "table covers every formation");
  for (const [id, [pts, roster]] of Object.entries(expected)) {
    const [s] = army(id);
    assert.equal(entry(s).pts, pts, `${id} points`);
    assert.deepEqual(entry(s).roster, roster, `${id} roster`);
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

test("numbered upgrades add n units for the listed price", () => {
  const rows = [
    ["f-ts-retinue", "u-land-raiders", "csm-land-raider", 0, [75, 125, 200, 275]],
    ["f-armoured-company", "u-vindicators", "csm-vindicator", 0, [35, 70, 105]],
    ["f-armoured-company", "u-defilers", "ts-defiler", 0, [75, 150, 225]],
    ["f-defiler-pack", "u-dreadnoughts", "chaos-dreadnought", 0, [50, 100, 150]],
    ["f-armoured-company", "u-extra-predators", "chaos-predator", 4, [50, 100, 150, 200, 250]],
  ];
  for (const [formation, upgrade, unit, inBase, prices] of rows)
    prices.forEach((price, i) => {
      let [s, [u]] = army(formation);
      const basePts = entry(s).pts;
      s = setUpgrade(s, u, upgrade, String(i + 1));
      assert.equal(entry(s).pts, basePts + price, `${formation}/${upgrade}/${i + 1} points`);
      assert.equal(entry(s).roster[unit], inBase + i + 1, `${formation}/${upgrade}/${i + 1} ${unit}`);
      assert.deepEqual(codes(s).filter((c) => c !== "formation-limit"), [], `${formation}/${upgrade}/${i + 1}`); // support formations stand alone here
    });
  let [s, [u]] = army("f-firelords");
  s = setUpgrade(s, u, "u-extra-firelord", "1");
  assert.equal(entry(s).pts, 350);
  assert.equal(entry(s).roster["chaos-firelord"], 3);
});

test("retinue characters and extra units", () => {
  let [s, [u]] = army("f-ts-retinue");
  s = setUpgrade(s, u, "u-champion", "1");
  s = setUpgrade(s, u, "u-icon-bearer", "1");
  assert.equal(entry(s).pts, 275 + 50 + 25);
  assert.deepEqual(entry(s).roster, { "cabal-of-sorcerers": 1, "thousand-sons": 5, "csm-champion": 1, "csm-icon-bearer": 1 });
  s = setUpgrade(s, u, "u-retinue-extra-units", "3");
  assert.equal(entry(s).pts, 275 + 50 + 25 + 175);
  assert.equal(entry(s).roster["thousand-sons"], 8);
  assert.deepEqual(codes(s), []);
});

test("Daemonic Pact and Teleport add their rule markers", () => {
  let [s, [u]] = army("f-ts-terminators");
  s = setUpgrade(s, u, "u-daemonic-pact", "1");
  s = setUpgrade(s, u, "u-teleport", "1");
  assert.equal(entry(s).pts, 350 + 25 + 50);
  assert.equal(entry(s).roster["daemonic-pact"], 1);
  assert.equal(entry(s).roster["ts-teleport"], 1);
});

test("Warlord and Daemon Prince replace the commander, Supreme Daemon Prince replaces the Warlord", () => {
  let [s, [u]] = army("f-ts-terminators", "f-ts-retinue"); // Terminators are elite and need a core formation
  s = setUpgrade(s, u, "u-warlord", "1");
  assert.equal(entry(s).pts, 400);
  assert.deepEqual(entry(s).roster, { "ts-warlord": 1, "ts-terminators": 4 });
  s = setUpgrade(s, u, "u-daemon-prince", "2");
  assert.equal(entry(s).pts, 450);
  assert.deepEqual(entry(s).roster, { "ts-daemon-prince-supreme": 1, "ts-terminators": 4 });
  assert.deepEqual(codes(s), []);

  [s, [u]] = army("f-ts-terminators");
  s = setUpgrade(s, u, "u-daemon-prince", "1");
  assert.equal(entry(s).pts, 400);
  assert.deepEqual(entry(s).roster, { "ts-daemon-prince": 1, "ts-terminators": 4 });

  s = setUpgrade(s, u, "u-warlord", "1");
  assert.ok(codes(s).includes("replace-insufficient"), "the commander cannot be replaced twice");
});

test("retinue has no Chaos Lord: Warlord must replace the Cabal of Sorcerers (variant 2)", () => {
  let [s, [u]] = army("f-ts-retinue");
  s = setUpgrade(s, u, "u-warlord", "1");
  assert.ok(codes(s).includes("replace-insufficient"));
  s = setUpgrade(s, u, "u-warlord", "2");
  assert.equal(entry(s).pts, 325);
  assert.deepEqual(entry(s).roster, { "ts-warlord": 1, "thousand-sons": 5 });
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "u-daemon-prince", "2");
  assert.equal(entry(s).pts, 375);
  assert.deepEqual(entry(s).roster, { "ts-daemon-prince-supreme": 1, "thousand-sons": 5 });
});

test("armoured company: swap Predators for Land Raiders at 25 points each", () => {
  let [s, [u]] = army("f-armoured-company");
  s = setUpgrade(s, u, "u-replace-predators-land-raiders", "4");
  assert.equal(entry(s).pts, 275);
  assert.deepEqual(entry(s).roster, { "csm-land-raider": 4 });
  s = setUpgrade(s, u, "u-replace-predators-land-raiders", "5");
  assert.ok(codes(s).includes("replace-insufficient"), "only four Predators to swap");

  // the extra Predators are picked first, so five can be swapped
  [s, [u]] = army("f-armoured-company");
  s = setUpgrade(s, u, "u-extra-predators", "4");
  s = setUpgrade(s, u, "u-replace-predators-land-raiders", "5");
  assert.equal(entry(s).pts, 175 + 200 + 125);
  assert.deepEqual(entry(s).roster, { "chaos-predator": 3, "csm-land-raider": 5 });
  assert.deepEqual(codes(s).filter((c) => c !== "formation-limit"), []);
});

test("daemon pools: price per daemon, Lesser Daemons show their Flamer/Screamer slots", () => {
  let [s, [u]] = army("f-lesser-daemon-pool");
  s = setUpgrade(s, u, "u-lesser-daemon", "n", 0, 3);
  assert.equal(entry(s).pts, 45);
  assert.deepEqual(entry(s).roster, { "lesser-daemon": 3, flamers: 0, screamers: 0 });
  assert.deepEqual(codes(s), []);
  [s, [u]] = army("f-greater-daemon-pool");
  s = setUpgrade(s, u, "u-greater-daemon", "n", 0, 2);
  assert.equal(entry(s).pts, 100);
  assert.deepEqual(entry(s).roster, { "lord-of-change": 2 });
});

// ---------------------------------------------------------------- transport

test("retinue Rhinos: 10 points each, they must carry every Thousand Sons unit as soon as one is bought", () => {
  let [s, [u]] = army("f-ts-retinue");
  assert.deepEqual(codes(s), [], "no Rhinos is fine");
  for (const n of [1, 2]) {
    s = setUpgrade(s, u, "u-csmrhinos", "n", 0, n);
    assert.equal(entry(s).pts, 275 + 10 * n);
    assert.deepEqual(codes(s), ["transport-incomplete"], `${n} Rhino(s) carry 6 INF`);
  }
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 3);
  assert.equal(entry(s).pts, 305);
  assert.deepEqual(entry(s).roster, { "cabal-of-sorcerers": 1, "thousand-sons": 5, "csm-rhino": 3 });
  assert.deepEqual(codes(s), [], "3 Rhinos carry 6 INF");
});

test("retinue Rhinos with extra units: 9 INF need 5 Rhinos", () => {
  let [s, [u]] = army("f-ts-retinue");
  s = setUpgrade(s, u, "u-retinue-extra-units", "3");
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 4);
  assert.deepEqual(codes(s), ["transport-incomplete"]);
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 5);
  assert.equal(entry(s).pts, 275 + 175 + 50);
  assert.deepEqual(codes(s), []);
});

test("retinue Rhinos: no more than needed", () => {
  let [s, [u]] = army("f-ts-retinue");
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 3);
  assert.deepEqual(codes(s), [], "3 Rhinos carry 6 INF");
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 4);
  assert.deepEqual(codes(s), ["vehicle-surplus"], "4 Rhinos have two spare seats");
  s = setUpgrade(s, u, "u-retinue-extra-units", "3");
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 5);
  assert.deepEqual(codes(s), [], "9 INF need 5 Rhinos");
});

test("Rhinos: at most five", () => {
  let [s, [u]] = army("f-ts-retinue");
  s = setUpgrade(s, u, "u-csmrhinos", "n", 0, 6);
  assert.ok(codes(s).includes("variant-max"));
});

// ---------------------------------------------------------------- limits

test("upgrade limits: at most four upgrades per formation", () => {
  let [s, [u]] = army("f-ts-retinue");
  s = setUpgrade(s, u, "u-warlord", "2");
  s = setUpgrade(s, u, "u-champion", "1");
  s = setUpgrade(s, u, "u-icon-bearer", "1");
  s = setUpgrade(s, u, "u-land-raiders", "1");
  assert.deepEqual(codes(s), [], "four upgrades");
  s = setUpgrade(s, u, "u-defilers", "1");
  assert.deepEqual(codes(s), ["upgrade-limit"], "five upgrades");
});

test("support formations: at most two per core formation, none without a core", () => {
  let [s] = army("f-ts-retinue", "f-armoured-company", "f-defiler-pack");
  assert.deepEqual(codes(s), []);
  [s] = army("f-ts-retinue", "f-armoured-company", "f-defiler-pack", "f-disc-riders");
  assert.deepEqual(codes(s), ["formation-limit"]);
  [s] = army("f-armoured-company");
  assert.deepEqual(codes(s), ["formation-limit"]);
});

test("elite formations: at most one per core formation, none without a core", () => {
  let [s] = army("f-ts-retinue", "f-spawn-horde");
  assert.deepEqual(codes(s), []);
  [s] = army("f-ts-retinue", "f-spawn-horde", "f-spawn-horde");
  assert.deepEqual(codes(s), ["formation-limit"]);
  [s] = army("f-spawn-horde");
  assert.deepEqual(codes(s), ["formation-limit"]);
});

test("navy and titans: at most one third of the army (exactly one third is allowed)",  () => {
  let [s] = army("f-ts-retinue", "f-warplord");
  assert.ok(codes(s).includes("share-limit"));
  [s] = army("f-ts-retinue", "f-spawn-horde", "f-firelords");
  assert.equal(summarize(data, s).total, 750);
  assert.deepEqual(codes(s), [], "250 of 750 is exactly one third");
  [s] = army("f-ts-retinue", "f-spawn-horde", "f-firelords", "f-doomwings");
  assert.ok(codes(s).includes("share-limit"));
});

test("0-1 Warlord per army", () => {
  let [s, [r, t]] = army("f-ts-retinue", "f-ts-terminators");
  s = setUpgrade(s, r, "u-warlord", "2");
  assert.deepEqual(codes(s), [], "one Warlord");
  s = setUpgrade(s, t, "u-warlord", "1");
  assert.notDeepEqual(codes(s), [], "two Warlords");
});

test("0-1 Daemon Prince per army", () => {
  let [s, [r, t]] = army("f-ts-retinue", "f-ts-terminators");
  s = setUpgrade(s, r, "u-warlord", "2");
  s = setUpgrade(s, r, "u-daemon-prince", "2");
  assert.deepEqual(codes(s), [], "one Daemon Prince");
  s = setUpgrade(s, t, "u-daemon-prince", "1");
  assert.notDeepEqual(codes(s), [], "two Daemon Princes");
});

// ---------------------------------------------------------------- order of selection

test("the order in which upgrades are picked does not change the result (Warlord -> Supreme Daemon Prince)", () => {
  const pick = (order) => {
    let [s, [u]] = army("f-ts-terminators");
    for (const [up, v] of order) s = setUpgrade(s, u, up, v);
    return entry(s);
  };
  const a = pick([["u-warlord", "1"], ["u-daemon-prince", "2"]]);
  const b = pick([["u-daemon-prince", "2"], ["u-warlord", "1"]]);
  assert.deepEqual(b.roster, a.roster);
  assert.deepEqual(b.problems, a.problems);
});

test("the order in which upgrades are picked does not change the result (extra Predators / Land Raiders)", () => {
  const pick = (order) => {
    let [s, [u]] = army("f-armoured-company");
    for (const [up, v] of order) s = setUpgrade(s, u, up, v);
    return entry(s);
  };
  const a = pick([["u-extra-predators", "4"], ["u-replace-predators-land-raiders", "5"]]);
  const b = pick([["u-replace-predators-land-raiders", "5"], ["u-extra-predators", "4"]]);
  assert.deepEqual(b.roster, a.roster);
  assert.deepEqual(b.problems, a.problems);
});

// ---------------------------------------------------------------- exchange

test("export -> link -> import round-trips per-unit counts and upgrades", () => {
  let [s, [retinue, , pool]] = army("f-ts-retinue", "f-armoured-company", "f-lesser-daemon-pool");
  s = setUpgrade(s, retinue, "u-warlord", "2");
  s = setUpgrade(s, retinue, "u-csmrhinos", "n", 0, 3);
  s = setUpgrade(s, 2, "u-extra-predators", "2");
  s = setUpgrade(s, pool, "u-lesser-daemon", "n", 0, 4);
  const { total, entries } = summarize(data, s);
  const exp = buildExport({ army: ARMY, armyVersion: raw.version, name: "Sorcerer Liste", state: s, entries, total });
  assert.equal(exp.ruleset, "euk");
  const back = sanitize(parseInput(toToken(exp)), data);
  assert.deepEqual(back.state, s);
  assert.equal(back.dropped, 0);
  assert.equal(summarize(data, back.state).total, total);
});

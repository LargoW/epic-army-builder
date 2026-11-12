import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, setSize, setChoice, summarize, validate, withProfiles, rosterProfiles,
} from "../engine/engine.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

// Tyranids (Epic UK quick reference). Expected values come from the PDF, not from the data file.
const dataUrl = (p) => new URL(`../data/${p}`, import.meta.url);
const load = (p) => JSON.parse(readFileSync(dataUrl(p), "utf8"));
const raw = load("euk/nid/tyranids.json");
const profiles = load("euk/nid/tyranids.profiles.json");
const data = withProfiles(raw, profiles);
const ARMY = "euk/nid/tyranids";

function army(...ids) {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
}
// Limits that depend on the rest of the army (support per core, rare share, 0-2 Dominatrix) are tested in the
// "limits" section with allCodes; every other test looks at one formation and ignores them.
const allCodes = (s) => validate(data, s).map((v) => v.code);
const codes = (s) => allCodes(s).filter((c) => c !== "formation-limit" && c !== "share-limit");
const entry = (s, i = 0) => summarize(data, s).entries[i];
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

// ---------------------------------------------------------------- data integrity

test("all unit, upgrade and section references resolve and every unit has a profile", () => {
  const units = new Set(Object.keys(data.units));
  const upgrades = new Set(data.upgrades.map((u) => u.id));
  const formations = new Set(data.formations.map((f) => f.id));
  for (const f of data.formations) {
    for (const slot of f.units) for (const u of [slot.unit, ...(slot.oneOf || [])].filter(Boolean)) assert.ok(units.has(u), `${f.id}: unit ${u}`);
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
  for (const f of data.formations) {
    const [s] = army(f.id);
    assert.ok(rosterProfiles(data, entry(s).roster).every((r) => r.profile && r.name), `${f.id}: profiles`);
  }
});

test("every variant adds or replaces something (no empty effects)", () => {
  for (const u of data.upgrades)
    for (const v of u.variants) {
      if (v.pts === 0 && v.effects.length === 0) continue;
      assert.ok(v.effects.length > 0, `${u.id}/${v.id} has no effects`);
    }
});

test("constraints and initiative have working selectors and an actual limit", () => {
  const tags = new Set(data.formations.flatMap((f) => f.tags || []));
  const ids = new Set([...data.formations.map((f) => f.id), ...data.upgrades.map((u) => u.id)]);
  const bad = [];
  const check = (where, sel) => arr(sel).forEach((s) => {
    if (s === "*") return;
    if (s.startsWith("tag:") ? !tags.has(s.slice(4)) : !ids.has(s)) bad.push(`${where}: "${s}"`);
  });
  for (const c of raw.formationConstraints || []) {
    check(`${c.id}.from`, c.from); check(`${c.id}.forEach`, c.forEach);
    if (!arr(c.from).length || (c.max == null && !c.maxShare)) bad.push(`${c.id}: needs from and max/maxShare`);
  }
  for (const c of raw.upgradeConstraints || []) {
    check(`${c.id}.from`, c.from); check(`${c.id}.appliesTo`, c.appliesTo);
    if (!arr(c.from).length || (c.max == null && c.maxTotal == null)) bad.push(`${c.id}: needs from and max/maxTotal`);
  }
  (raw.initiative || []).forEach((i, n) => check(`initiative[${n}]`, i.formations));
  assert.deepEqual(bad, []);
});

test("section and tag agree: core, support, rare", () => {
  for (const s of data.sections)
    for (const id of s.formations) assert.ok(data.formations.find((f) => f.id === id).tags.includes(s.id), `${id} in ${s.id}`);
});

test("every formation is valid in its base configuration (support needs a core, rare formations are limited by share)", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    assert.deepEqual(codes(s), [], f.id);
  }
});

// ---------------------------------------------------------------- formations

test("base points and units of every formation", () => {
  const expected = {
    "f-assault-swarm": [225, { "tyranid-warriors": 2, termagants: 8 }],
    "f-brute-swarm": [175, { "hive-tyrant": 1, exocrine: 3 }],
    "f-dominatrix": [500, { dominatrix: 1 }],
    "f-hybrid-swarm": [175, { "tyranid-warriors": 1, termagants: 3, exocrine: 2 }],
    "f-lictor-swarm": [200, { lictors: 5 }],
    "f-genestealers": [150, { genestealers: 6 }],
    "f-nest-swarm": [175, { "hive-nest": 1, termagants: 4 }],
    "f-spore-mine-swarm": [150, { "spore-mine-cluster": 6 }],
    "f-harassment-swarm": [250, { harridan: 1, gargoyles: 2 }],
    "f-hierophant": [250, { hierophant: 1 }],
    "f-hydraphant": [450, { hydraphant: 1 }],
    "f-subterranean-swarm": [250, { trygon: 1, raveners: 2 }],
  };
  assert.deepEqual(Object.keys(expected).sort(), data.formations.map((f) => f.id).sort(), "table covers every formation");
  for (const [id, [pts, roster]] of Object.entries(expected)) {
    const [s] = army(id);
    assert.equal(entry(s).pts, pts, `${id} points`);
    assert.deepEqual(entry(s).roster, roster, `${id} roster`);
  }
});

test("Big swarms cost the listed points and double the core units once (not twice)", () => {
  const expected = {
    "f-assault-swarm": [400, { "tyranid-warriors": 4, termagants: 16 }],
    "f-brute-swarm": [300, { "hive-tyrant": 2, exocrine: 6 }],
    "f-hybrid-swarm": [300, { "tyranid-warriors": 2, termagants: 6, exocrine: 4 }],
  };
  for (const [id, [pts, roster]] of Object.entries(expected)) {
    let [s, [u]] = army(id);
    s = setSize(s, u, "big");
    assert.equal(entry(s).pts, pts, `${id} Big points`);
    assert.deepEqual(entry(s).roster, roster, `${id} Big roster`);
    assert.deepEqual(codes(s), [], id);
  }
  for (const id of ["f-dominatrix", "f-lictor-swarm", "f-genestealers", "f-nest-swarm", "f-spore-mine-swarm", "f-harassment-swarm", "f-hierophant", "f-hydraphant", "f-subterranean-swarm"])
    assert.equal(data.formations.find((f) => f.id === id).sizes, undefined, `${id} has no Big size`);
});

test("units 'chosen from the following': Brute and Hybrid Swarm take Exocrines, Haruspexes or Malefactors, Nest Swarm Termagants or Hormagaunts", () => {
  let [s, [u]] = army("f-brute-swarm");
  s = setChoice(s, u, 1, { exocrine: 1, haruspex: 1, malefactor: 1 });
  assert.deepEqual(entry(s).roster, { "hive-tyrant": 1, exocrine: 1, haruspex: 1, malefactor: 1 });
  assert.deepEqual(codes(s), []);
  s = setChoice(s, u, 1, { zoanthrope: 3 });
  assert.ok(codes(s).includes("choice-invalid"), "Zoanthropes are not on the list");
  s = setChoice(s, u, 1, { haruspex: 2 });
  assert.ok(codes(s).includes("choice-invalid"), "three units are required");
  s = setSize(s, u, "big");
  assert.deepEqual(entry(s).roster, { "hive-tyrant": 2, exocrine: 6 }, "switching size resets the choice");
  s = setChoice(s, u, 1, { malefactor: 6 });
  assert.deepEqual(codes(s), [], "Big: six units");

  [s, [u]] = army("f-hybrid-swarm");
  s = setChoice(s, u, 2, { haruspex: 1, malefactor: 1 });
  assert.deepEqual(entry(s).roster, { "tyranid-warriors": 1, termagants: 3, haruspex: 1, malefactor: 1 });
  assert.deepEqual(codes(s), []);

  [s, [u]] = army("f-nest-swarm");
  s = setChoice(s, u, 1, { termagants: 2, hormagaunts: 2 });
  assert.deepEqual(entry(s).roster, { "hive-nest": 1, termagants: 2, hormagaunts: 2 });
  assert.deepEqual(codes(s), []);
  s = setChoice(s, u, 1, { termagants: 5 });
  assert.ok(codes(s).includes("choice-invalid"));
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

test("priced additions: points and units grow with the chosen number", () => {
  // [formation, upgrade, variant, n, price each, unit, units in the base formation]
  const rows = [
    ["f-assault-swarm", "u-termagants", "1", 5, 15, "termagants", 8],
    ["f-assault-swarm", "u-gargoyles", "1", 5, 20, "gargoyles", 0],
    ["f-assault-swarm", "u-biovores", "1", 3, 25, "biovore", 0],
    ["f-assault-swarm", "u-hive-tyrant", "1", 1, 50, "hive-tyrant", 0],
    ["f-assault-swarm", "u-carnifex", "1", 3, 40, "carnifex", 0],
    ["f-assault-swarm", "u-hierodule", "1", 1, 125, "hierodule", 0],
    ["f-assault-swarm", "u-raveners-zoanthropes", "raveners", 3, 35, "raveners", 0],
    ["f-assault-swarm", "u-raveners-zoanthropes", "zoanthrope", 2, 35, "zoanthrope", 0],
    ["f-assault-swarm", "u-large-creatures", "exocrine", 3, 35, "exocrine", 0],
    ["f-assault-swarm", "u-large-creatures", "malefactor", 3, 35, "malefactor", 0],
    ["f-assault-swarm", "u-large-creatures", "haruspex", 3, 35, "haruspex", 0],
    ["f-brute-swarm", "u-termagants", "1", 10, 15, "termagants", 0],
    ["f-brute-swarm", "u-biovores", "1", 3, 25, "biovore", 0],
    ["f-brute-swarm", "u-dactylis", "1", 4, 50, "dactylis", 0],
    ["f-brute-swarm", "u-hierodules", "1", 2, 125, "hierodule", 0],
    ["f-brute-swarm", "u-brute-monsters", "zoanthrope", 5, 35, "zoanthrope", 0],
    ["f-brute-swarm", "u-brute-monsters", "raveners", 7, 35, "raveners", 0],
    ["f-dominatrix", "u-termagants", "1", 10, 15, "termagants", 0],
    ["f-dominatrix", "u-hierodules-dominatrix", "1", 4, 125, "hierodule", 0],
    ["f-dominatrix", "u-dactylis-dominatrix", "1", 6, 50, "dactylis", 0],
    ["f-dominatrix", "u-carnifex-dominatrix", "1", 6, 40, "carnifex", 0],
    ["f-dominatrix", "u-dominatrix-creatures", "haruspex", 3, 35, "haruspex", 0],
    ["f-hybrid-swarm", "u-termagants", "1", 4, 15, "termagants", 3],
    ["f-hybrid-swarm", "u-biovores", "1", 3, 25, "biovore", 0],
    ["f-hybrid-swarm", "u-hybrid-creatures", "raveners", 4, 35, "raveners", 0],
    ["f-hybrid-swarm", "u-hybrid-gargoyles", "1", 2, 20, "gargoyles", 0],
    ["f-lictor-swarm", "u-lictors", "1", 3, 35, "lictors", 5],
    ["f-genestealers", "u-genestealers", "1", 3, 25, "genestealers", 6],
    ["f-nest-swarm", "u-termagants", "1", 6, 15, "termagants", 4],
    ["f-nest-swarm", "u-biovores-nest", "1", 4, 25, "biovore", 0],
    ["f-nest-swarm", "u-exocrines-nest", "1", 4, 35, "exocrine", 0],
    ["f-nest-swarm", "u-dactylis-nest", "1", 4, 50, "dactylis", 0],
    ["f-nest-swarm", "u-nest-creatures", "zoanthrope", 2, 35, "zoanthrope", 0],
    ["f-nest-swarm", "u-nest-creatures", "raveners", 5, 35, "raveners", 0],
    ["f-subterranean-swarm", "u-subterranean-raveners", "1", 4, 35, "raveners", 2],
  ];
  for (const [formation, upgrade, variant, n, price, unit, inBase] of rows) {
    let [s, [u]] = army(formation);
    const basePts = entry(s).pts;
    s = setUpgrade(s, u, upgrade, variant, 0, n);
    assert.equal(entry(s).pts, basePts + n * price, `${formation}/${upgrade}/${variant} points`);
    assert.equal(entry(s).roster[unit], inBase + n, `${formation}/${upgrade}/${variant} ${unit}`);
    assert.deepEqual(codes(s), [], `${formation}/${upgrade}/${variant}`);
  }
  let [s, [u]] = army("f-harassment-swarm");
  s = setUpgrade(s, u, "u-harassment-gargoyles", "1");
  assert.equal(entry(s).pts, 300);
  assert.equal(entry(s).roster.gargoyles, 6, "Harassment Swarm: four more Gargoyles for 50");
});

test("'up to N' limits are doubled for a Big formation, 'any number' has no limit", () => {
  // [formation, upgrade, variant, limit in a normal formation]
  const rows = [
    ["f-assault-swarm", "u-assault-hormagaunts", "1", 6],
    ["f-assault-swarm", "u-gargoyles", "1", 5],
    ["f-assault-swarm", "u-biovores", "1", 3],
    ["f-assault-swarm", "u-hive-tyrant", "1", 1],
    ["f-assault-swarm", "u-carnifex", "1", 3],
    ["f-assault-swarm", "u-hierodule", "1", 1],
    ["f-assault-swarm", "u-raveners-zoanthropes", "raveners", 3],
    ["f-assault-swarm", "u-large-creatures", "haruspex", 3],
    ["f-brute-swarm", "u-biovores", "1", 3],
    ["f-brute-swarm", "u-dactylis", "1", 4],
    ["f-brute-swarm", "u-hierodules", "1", 2],
    ["f-hybrid-swarm", "u-biovores", "1", 3],
    ["f-hybrid-swarm", "u-hybrid-gargoyles", "1", 2],
  ];
  for (const [formation, upgrade, variant, limit] of rows) {
    const bigAllowed = data.formations.find((f) => f.id === formation).sizes;
    for (const size of ["normal", "big"]) {
      const max = size === "big" ? limit * 2 : limit;
      let [s, [u]] = army(formation);
      s = setSize(s, u, size);
      s = setUpgrade(s, u, upgrade, variant, 0, max);
      assert.deepEqual(codes(s), [], `${formation}/${upgrade} ${size}: ${max} allowed`);
      s = setUpgrade(s, u, upgrade, variant, 0, max + 1);
      assert.deepEqual(codes(s), ["variant-max"], `${formation}/${upgrade} ${size}: ${max + 1} is one too many`);
      assert.ok(bigAllowed);
    }
  }
  const limits = { "f-dominatrix": [["u-hierodules-dominatrix", "1", 4], ["u-dactylis-dominatrix", "1", 6], ["u-carnifex-dominatrix", "1", 6], ["u-dominatrix-creatures", "haruspex", 3]],
    "f-lictor-swarm": [["u-lictors", "1", 3]], "f-genestealers": [["u-genestealers", "1", 3]],
    "f-nest-swarm": [["u-biovores-nest", "1", 4], ["u-exocrines-nest", "1", 4], ["u-dactylis-nest", "1", 4]],
    "f-subterranean-swarm": [["u-subterranean-raveners", "1", 4]] };
  for (const [formation, list] of Object.entries(limits))
    for (const [upgrade, variant, max] of list) {
      let [s, [u]] = army(formation);
      s = setUpgrade(s, u, upgrade, variant, 0, max);
      assert.deepEqual(codes(s), [], `${formation}/${upgrade}: ${max} allowed`);
      s = setUpgrade(s, u, upgrade, variant, 0, max + 1);
      assert.deepEqual(codes(s), ["variant-max"], `${formation}/${upgrade}: ${max + 1} is one too many`);
    }
  for (const [formation, upgrade, variant] of [["f-assault-swarm", "u-termagants", "1"], ["f-brute-swarm", "u-brute-monsters", "exocrine"], ["f-hybrid-swarm", "u-hybrid-creatures", "haruspex"], ["f-nest-swarm", "u-nest-creatures", "raveners"]]) {
    let [s, [u]] = army(formation);
    s = setUpgrade(s, u, upgrade, variant, 0, 25);
    assert.deepEqual(codes(s), [], `${formation}/${upgrade}: any number`);
  }
});

test("Assault Swarm: up to six Termagants become Hormagaunts for free", () => {
  for (const n of [1, 3, 6]) {
    let [s, [u]] = army("f-assault-swarm");
    s = setUpgrade(s, u, "u-assault-hormagaunts", "1", 0, n);
    assert.equal(entry(s).pts, 225, `${n}: free`);
    assert.deepEqual(entry(s).roster, { "tyranid-warriors": 2, termagants: 8 - n, hormagaunts: n }, `${n}`);
    assert.deepEqual(codes(s), [], `${n}`);
  }
  let [s, [u]] = army("f-assault-swarm");
  s = setSize(s, u, "big");
  s = setUpgrade(s, u, "u-assault-hormagaunts", "1", 0, 12);
  assert.deepEqual(entry(s).roster, { "tyranid-warriors": 4, termagants: 4, hormagaunts: 12 });
  assert.deepEqual(codes(s), [], "Big: up to twelve");
});

test("Brute and Hybrid Swarm: swap Exocrines, Haruspexes or Malefactors for Carnifex at 5 points each", () => {
  let [s, [u]] = army("f-brute-swarm");
  s = setUpgrade(s, u, "u-brute-carnifex-replace", "exocrine", 0, 3);
  assert.equal(entry(s).pts, 175 + 15);
  assert.deepEqual(entry(s).roster, { "hive-tyrant": 1, carnifex: 3 });
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "u-brute-carnifex-replace", "exocrine", 0, 4);
  assert.ok(codes(s).includes("replace-insufficient"), "only three Exocrines in the swarm");
  s = setUpgrade(s, u, "u-brute-carnifex-replace", "haruspex", 0, 1);
  assert.ok(codes(s).includes("replace-insufficient"), "the swarm has no Haruspex");

  // Exocrines bought as extra creatures can be swapped too (the formation lists creatures before swaps)
  [s, [u]] = army("f-brute-swarm");
  s = setUpgrade(s, u, "u-brute-carnifex-replace", "exocrine", 0, 6);
  s = setUpgrade(s, u, "u-brute-monsters", "exocrine", 0, 3);
  assert.equal(entry(s).pts, 175 + 105 + 30);
  assert.deepEqual(entry(s).roster, { "hive-tyrant": 1, carnifex: 6 });
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "u-brute-carnifex-replace", "exocrine", 0, 7);
  assert.ok(codes(s).includes("variant-max"), "up to six");

  [s, [u]] = army("f-hybrid-swarm");
  s = setChoice(s, u, 2, { malefactor: 2 });
  s = setUpgrade(s, u, "u-hybrid-carnifex-replace", "malefactor", 0, 2);
  assert.equal(entry(s).pts, 175 + 10);
  assert.deepEqual(entry(s).roster, { "tyranid-warriors": 1, termagants: 3, carnifex: 2 });
  assert.deepEqual(codes(s), []);
});

test("upgrades are only offered where the list allows them", () => {
  let [s, [u]] = army("f-lictor-swarm");
  assert.ok(codes(setUpgrade(s, u, "u-biovores", "1")).includes("upgrade-not-allowed"));
  [s, [u]] = army("f-dominatrix");
  assert.ok(codes(setUpgrade(s, u, "u-biovores", "1")).includes("upgrade-not-allowed"), "no Biovores for the Dominatrix");
  assert.ok(codes(setUpgrade(s, u, "u-hive-tyrant", "1")).includes("upgrade-not-allowed"));
  [s, [u]] = army("f-brute-swarm");
  assert.ok(codes(setUpgrade(s, u, "u-hybrid-gargoyles", "1")).includes("upgrade-not-allowed"));
  [s, [u]] = army("f-hierophant");
  assert.ok(codes(setUpgrade(s, u, "u-termagants", "1")).includes("upgrade-not-allowed"));
});

// ---------------------------------------------------------------- limits

test("support formations: one per core formation, none without a core", () => {
  let [s] = army("f-assault-swarm", "f-lictor-swarm");
  assert.deepEqual(allCodes(s), []);
  [s] = army("f-assault-swarm", "f-lictor-swarm", "f-genestealers");
  assert.deepEqual(allCodes(s), ["formation-limit"]);
  assert.equal(validate(data, s)[0].params.id, "support-per-core");
  [s] = army("f-assault-swarm", "f-brute-swarm", "f-lictor-swarm", "f-nest-swarm");
  assert.deepEqual(allCodes(s), [], "two cores allow two support formations");
  [s] = army("f-dominatrix", "f-hybrid-swarm", "f-genestealers", "f-nest-swarm", "f-lictor-swarm");
  assert.deepEqual(allCodes(s), ["formation-limit"], "three support formations for two cores");
  [s] = army("f-nest-swarm");
  assert.deepEqual(allCodes(s), ["formation-limit"], "support formation without a core");
});

test("0-2 Dominatrix", () => {
  let [s] = army("f-dominatrix", "f-dominatrix");
  assert.deepEqual(allCodes(s), []);
  [s] = army("f-dominatrix", "f-dominatrix", "f-dominatrix");
  assert.deepEqual(allCodes(s), ["formation-limit"]);
  assert.equal(validate(data, s)[0].params.id, "dominatrix-limit");
});

test("rare formations: at most one third of the army points (exactly one third is allowed)", () => {
  let [s] = army("f-dominatrix", "f-hierophant");
  assert.equal(summarize(data, s).total, 750);
  assert.deepEqual(allCodes(s), [], "250 of 750 is exactly one third");
  [s] = army("f-dominatrix", "f-hierophant", "f-spore-mine-swarm");
  assert.deepEqual(allCodes(s), ["share-limit"], "400 of 900");
  assert.equal(validate(data, s)[0].params.id, "rare-points-limit");
  [s] = army("f-hydraphant");
  assert.deepEqual(allCodes(s), ["share-limit"], "a rare formation alone");
  [s] = army("f-assault-swarm", "f-brute-swarm", "f-lictor-swarm", "f-subterranean-swarm");
  assert.deepEqual(allCodes(s), [], "250 of 850 is below one third");
});

// ---------------------------------------------------------------- profiles

test("unit profiles match the quick reference (type, speed, armour, close combat, firefight)", () => {
  const expected = {
    "hive-tyrant": ["AV", "20cm (30cm)", "4+ (5+)", "3+", "5+"],
    "tyranid-warriors": ["INF", "20cm", "5+", "3+", "5+"],
    termagants: ["INF", "20cm", null, "6+", "5+"],
    hormagaunts: ["INF", "20cm", null, "5+", null],
    gargoyles: ["INF", "30cm", null, "6+", "6+"],
    genestealers: ["INF", "20cm", "6+", "4+", null],
    lictors: ["INF", "20cm", "5+", "4+", null],
    raveners: ["INF", "20cm", "5+", "3+", "6+"],
    biovore: ["LV", "20cm", "6+", "6+", "5+"],
    "spore-mine-cluster": ["LV", "15cm", "5+", null, "5+"],
    carnifex: ["AV", "20cm", "4+", "3+", "6+"],
    zoanthrope: ["AV", "20cm", "5+", "6+", "5+"],
    dactylis: ["AV", "25cm", "5+", "6+", "5+"],
    exocrine: ["AV", "25cm", "5+", "5+", "5+"],
    haruspex: ["AV", "30cm", "5+", "5+", null],
    malefactor: ["AV", "25cm", "5+", "5+", "5+"],
    trygon: ["WE", "20cm", "4+", "3+", "5+"],
    hierodule: ["WE", "20cm", "5+", "4+", "5+"],
    harridan: ["WE", "35cm", "5+", "4+", "5+"],
    "hive-nest": ["WE", "0cm", "4+", "5+", "6+"],
    hierophant: ["WE", "25cm", "5+", "3+", "5+"],
    hydraphant: ["WE", "20cm", "4+", "3+", "4+"],
    dominatrix: ["WE", "20cm", "4+", "3+", "4+"],
  };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(profiles.units).sort(), "covers every unit");
  for (const [id, want] of Object.entries(expected)) {
    const p = profiles.units[id];
    assert.deepEqual([p.type, p.speed, p.armour, p.cc, p.ff], want, id);
  }
});

test("weapons match the quick reference (name | range | firepower; brackets around small-arms ranges omitted)", () => {
  const talons = "Scything Talons|Base Contact|Assault Wpn, MW, +1A";
  const expected = {
    "hive-tyrant": ["Venom Cannon|30cm|AP5+/AT6+", talons],
    "tyranid-warriors": ["Venom Cannon|30cm|AP5+/AT6+", "Death Spitters|15cm|Small Arms", "Rending Claws|Base Contact|Assault Wpn, +1A"],
    termagants: ["Fleshborers|15cm|Small Arms"],
    hormagaunts: ["Talons|Base Contact|Assault Wpn, +1A"],
    gargoyles: ["Fleshborers|15cm|Small Arms", "Swarm strike|15cm|AA6+"],
    genestealers: ["Rending Claws|Base Contact|Assault Wpn, +1A"],
    lictors: [talons],
    raveners: ["Death Spitters|15cm|Small Arms", talons],
    biovore: ["Spore Mines|30cm|1BP, Disrupt, Indirect"],
    "spore-mine-cluster": ["Explosive Spores|15cm|AP5+/AT5+/AA5+"],
    carnifex: ["Spore Cysts|15cm|Small Arms", talons],
    zoanthrope: ["Warp Blast|30cm|MW5+/AA6+, MW", "Warp Blast|15cm|Small Arms, MW"],
    dactylis: ["Heavy Spore Mines|45cm|1BP, Disrupt, Indirect"],
    exocrine: ["Heavy Venom Cannon|30cm|4 × AP5+/AT5+"],
    haruspex: ["2 × Scything Talons|Base Contact|Assault Wpn, MW, +1A"],
    malefactor: ["Spine Arms|15cm|Small Arms, +2A"],
    trygon: ["Bio-electric field|15cm|2 × AP3+/AT6+, Forward", talons],
    hierodule: ["Bio-cannon|45cm|2 × AP3+/AT4+, Forward", "Crushing Claws|Base Contact|Assault Wpn, MW, +1A"],
    harridan: ["Bio-cannon|45cm|2 × AP3+/AT4+, FF", "Crushing Claws|Base Contact|Assault Wpn, MW, +1A"],
    "hive-nest": ["Ripper Swarms|15cm|Small Arms", "Ripper Swarms|Base Contact|Assault Wpn, +1A"],
    hierophant: ["2 × Bio-cannon|45cm|2 × AP3+/AT4+, Forward", "Massive Claws|Base Contact|Assault Wpn, MW, +3A"],
    hydraphant: ["2 × Bio-cannon|45cm|2 × AP3+/AT4+, Forward", "Bio-Acid|15cm|3BP, IC, Forward", "Massive Claws|Base Contact|Assault Wpn, MW, +3A", "Ripper Tentacles|Base Contact|Assault Wpn, +2A, TK (D3)"],
    dominatrix: ["Bio-cannon|45cm|2 × AP3+/AT4+, FF", "Bio-Acid|15cm|3BP, IC, Forward", "Energy Pulse|30cm|AP4+/AT4+/AA5+", "Energy Pulse|15cm|Small Arms, MW, +1A", "Massive Claws|Base Contact|Assault Wpn, MW, +3A"],
  };
  for (const [id, want] of Object.entries(expected))
    assert.deepEqual(profiles.units[id].weapons.map((w) => `${w.name}|${w.range}|${w.firepower}`), want, id);
});

test("special rules match the quick reference", () => {
  const crit = "Critical Effect: 1 MW6+ base; 2–5 +1 damage; 6 D3 damage";
  const expected = {
    "hive-tyrant": ["Commander", "Fearless", "Synapse", "Reinforced Armour", "Leader", "May have wings"],
    "tyranid-warriors": ["Fearless", "Synapse", "Leader"],
    termagants: [],
    hormagaunts: ["Infiltrators"],
    gargoyles: ["Jump Packs"],
    genestealers: ["Infiltrators", "First Strike", "Scout", "Synapse"],
    lictors: ["Infiltrators", "First Strike", "Scout", "Teleport", "Commander"],
    raveners: ["Infiltrators", "Teleport"],
    biovore: [],
    "spore-mine-cluster": ["Skimmer", "Scout"],
    carnifex: ["Fearless", "Reinforced Armour"],
    zoanthrope: ["Skimmer", "Leader", "Reinforced Armour"],
    dactylis: ["Reinforced Armour"],
    exocrine: ["Reinforced Armour"],
    haruspex: ["Reinforced Armour"],
    malefactor: ["Reinforced Armour", "Transport (2) Warriors, Termagaunt, Hormagaunt"],
    trygon: ["Fearless", "Infiltrator", "Reinforced Armour", "Teleport", "Synapse", "Damage Capacity 2", "Critical: Killed"],
    hierodule: ["Fearless", "Reinforced Armour", "Damage Capacity 3", "Critical: Killed"],
    harridan: ["Fearless", "Reinforced Armour", "Leader", "Synapse", "Skimmer", "Transport (up to six Gargoyles)", "Damage Capacity 3", "Critical: Killed"],
    "hive-nest": ["Fearless", "Reinforced Armour", "Leader", "Synapse", "Thick Rear Armour", "Damage Capacity 3", "Critical: Killed"],
    hierophant: ["Fearless", "Reinforced Armour", "Invulnerable Save", "Synapse", "Damage Capacity 4", crit, "May step over qualifying terrain"],
    hydraphant: ["Fearless", "Reinforced Armour", "Invulnerable Save", "Synapse", "Damage Capacity 6", crit, "May step over qualifying terrain"],
    dominatrix: ["Commander", "Fearless", "Leader", "Reinforced Armour", "Invulnerable Save", "Synapse", "Damage Capacity 6", crit, "May re-roll one failed Initiative test per turn", "May step over qualifying terrain"],
  };
  for (const [id, want] of Object.entries(expected)) assert.deepEqual((profiles.units[id].specialRules || []).map((r) => r.name || r), want, id);
});

test("army rules and ratings match the quick reference", () => {
  assert.equal(raw.strategy, 1);
  assert.deepEqual(raw.initiative, [{ formations: ["*"], value: "2+" }]);
  assert.deepEqual(profiles.specialRules.map((r) => r.name).sort(), ["Fast and Slithering", "Synapse", "The Hunger"]);
});

// ---------------------------------------------------------------- exchange

test("export -> link -> import round-trips sizes, choices, per-unit counts and upgrades", () => {
  let [s, [brute, assault, nest]] = army("f-brute-swarm", "f-assault-swarm", "f-nest-swarm");
  s = setSize(s, brute, "big");
  s = setChoice(s, brute, 1, { exocrine: 2, haruspex: 2, malefactor: 2 });
  s = setUpgrade(s, brute, "u-brute-monsters", "zoanthrope", 0, 4);
  s = setUpgrade(s, assault, "u-assault-hormagaunts", "1", 0, 5);
  s = setUpgrade(s, assault, "u-large-creatures", "malefactor", 0, 2);
  s = setChoice(s, nest, 1, { termagants: 1, hormagaunts: 3 });
  const { total, entries } = summarize(data, s);
  const exp = buildExport({ army: ARMY, armyVersion: raw.version, name: "Hive Ärger", state: s, entries, total });
  assert.equal(exp.ruleset, "euk");
  assert.equal(exp.formations[0].size, "big");
  assert.equal(exp.formations[1].upgrades[0].count, 5);
  const back = sanitize(parseInput(toToken(exp)), data);
  assert.deepEqual(back.state, s);
  assert.equal(back.dropped, 0);
  assert.equal(summarize(data, back.state).total, total);
});

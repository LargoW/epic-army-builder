import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, removeUpgrade, setSize, setChoice, summarize, validate, withProfiles, rosterProfiles,
} from "../engine/engine.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

// Squats (Grindel Stronghold, NetEA). Expected values are taken from data/netea/squats/squats.json.
// The file defines no formation or upgrade constraints, so no limit tests exist here (see summary).
// Tests marked `todo` describe the intended behaviour but fail on the current data/engine;
// see the reason string. They do not fail the run. Remove `todo` once the cause is fixed.
const load = (p) => JSON.parse(readFileSync(new URL(`../data/netea/squats/${p}.json`, import.meta.url), "utf8"));
const raw = load("squats");
const profiles = load("squats.profiles");
const data = withProfiles(raw, profiles);
const ARMY = "netea/squats/squats";

function army(...ids) {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
}
// Limits that depend on the rest of the army (support per brotherhood, war-engine share) are tested in the
// "limits" section with allCodes; every other test looks at one formation and ignores them.
const allCodes = (s) => validate(data, s).map((v) => v.code);
const codes = (s) => allCodes(s).filter((c) => c !== "formation-limit" && c !== "share-limit");
const entry = (s, i = 0) => summarize(data, s).entries[i];

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
    for (const v of u.variants)
      for (const fx of v.effects) for (const id of [fx.unit, fx.from, fx.to].filter(Boolean)) assert.ok(units.has(id), `${u.id}/${v.id}: unit ${id}`);
  const inSection = data.sections.flatMap((s) => s.formations);
  for (const id of inSection) assert.ok(formations.has(id), `section lists unknown formation ${id}`);
  for (const f of data.formations) assert.equal(inSection.filter((x) => x === f.id).length, 1, `${f.id} in exactly one section`);
  assert.deepEqual(data.upgrades.filter((u) => !data.formations.some((f) => f.upgrades.includes(u.id))), [], "unused upgrades");
});

test("every unit that appears in a formation or upgrade has a type and a profile", () => {
  const used = new Set();
  for (const f of data.formations) for (const slot of f.units) [slot.unit, ...(slot.oneOf || [])].filter(Boolean).forEach((u) => used.add(u));
  for (const u of data.upgrades) for (const v of u.variants) for (const fx of v.effects) [fx.unit, fx.to].filter(Boolean).forEach((x) => used.add(x));
  for (const id of used) {
    assert.ok(data.units[id] && data.units[id].type, `type of ${id}`);
    assert.ok(profiles.units[id], `profile for ${id}`);
  }
  for (const f of data.formations) {
    const [s] = army(f.id);
    assert.ok(rosterProfiles(data, entry(s).roster).every((r) => r.profile && r.name), f.id);
  }
});

test("section and tag agree: core, support, warengines", () => {
  const tagOf = { core: "core", support: "support", warengines: "warengine" };
  for (const s of data.sections)
    for (const id of s.formations) assert.ok(data.formations.find((f) => f.id === id).tags.includes(tagOf[s.id]), `${id} in ${s.id}`);
});

test("every formation is valid in its base configuration (support and war engines need the rest of the army)", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    assert.deepEqual(codes(s), [], f.id);
  }
});

test("transport rules apply to existing formations and use existing vehicles", () => {
  const formations = new Set(data.formations.map((f) => f.id));
  const bad = [];
  for (const t of raw.transport)
    for (const id of t.appliesTo) if (id !== "*" && !id.startsWith("tag:") && !formations.has(id)) bad.push(`${t.id}: formation ${id}`);
  for (const t of raw.transport) if (!data.units[t.vehicle]) bad.push(`${t.id}: vehicle ${t.vehicle}`);
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- base formations and sizes

test("base points and units of every formation (smallest size)", () => {
  const expected = {
    "f-berserker": [175, { hearthguard: 1, berserkers: 5 }],
    "f-thunderer": [225, { thunderers: 5 }],
    "f-warrior": [250, { hearthguard: 1, warriors: 9 }],
    "f-air-attack-corps": [250, { overlord: 1 }],
    "f-artillery-battery": [150, { "mole-mortar": 5 }],
    "f-guild-robot-squadron": [200, { "colossus-robot": 5 }],
    "f-guild-squadron": [150, { guildmaster: 1, "guild-bikers": 5 }],
    "f-gyrocopter-wing": [225, { "iron-eagle": 3 }],
    "f-super-heavy-artillery": [200, { goliath: 1 }],
    "f-thunderfire-battery": [150, { thunderfire: 2 }],
    "f-colossus": [600, { "colossus-we": 1, "recon-iron-eagle": 1 }], // official list: one Colossus and one Recon Iron Eagle
    "f-cyclops": [600, { cyclops: 1 }],
    "f-landtrain": [275, { "land-train-engine": 1, "berserker-battlecar": 1 }],
    "f-leviathan": [400, { leviathan: 1 }],
  };
  assert.deepEqual(Object.keys(expected).sort(), data.formations.map((f) => f.id).sort(), "table covers every formation");
  for (const [id, [pts, roster]] of Object.entries(expected)) {
    const [s] = army(id);
    assert.equal(entry(s).pts, pts, `${id} points`);
    assert.deepEqual(entry(s).roster, roster, `${id} roster`);
  }
});

test("sizes: listed price, and every fixed unit is multiplied by 1, 2 or 3", () => {
  for (const f of data.formations.filter((x) => x.sizes)) {
    assert.deepEqual(f.sizes.map((z) => z.mult), [1, 2, 3], `${f.id} multipliers`);
    for (const z of f.sizes) {
      let [s, [u]] = army(f.id);
      s = setSize(s, u, z.id);
      assert.equal(entry(s).pts, z.pts, `${f.id}/${z.id} points`);
      for (const slot of f.units.filter((x) => x.unit)) assert.equal(entry(s).roster[slot.unit], slot.count * z.mult, `${f.id}/${z.id} ${slot.unit}`);
    }
  }
  let [s, [u]] = army("f-berserker");
  s = setSize(s, u, "g");
  assert.equal(entry(s).pts, 300);
  assert.deepEqual(entry(s).roster, { hearthguard: 2, berserkers: 10 });
  s = setSize(s, u, "r");
  assert.equal(entry(s).pts, 425);
  assert.deepEqual(entry(s).roster, { hearthguard: 3, berserkers: 15 });
  assert.deepEqual(codes(s), []);
});

test("formations without sizes stay single", () => {
  for (const id of ["f-guild-robot-squadron", "f-thunderfire-battery", "f-colossus", "f-cyclops", "f-landtrain", "f-leviathan"])
    assert.equal(data.formations.find((f) => f.id === id).sizes, undefined, id);
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

test("per-unit additions: price and units grow with the chosen number", () => {
  const rows = [
    ["f-berserker", "u-berserkers", 3, 175 + 60, "berserkers", 8],
    ["f-thunderer", "u-thunderers", 2, 225 + 80, "thunderers", 7],
    ["f-warrior", "u-warriors", 4, 250 + 80, "warriors", 13],
    ["f-guild-squadron", "u-guild-bikers-add", 3, 150 + 60, "guild-bikers", 8],
  ];
  for (const [formation, upgrade, n, pts, unit, count] of rows) {
    let [s, [u]] = army(formation);
    s = setUpgrade(s, u, upgrade, "n", 0, n);
    assert.equal(entry(s).pts, pts, `${formation}/${upgrade} points`);
    assert.equal(entry(s).roster[unit], count, `${formation}/${upgrade} ${unit}`);
    assert.deepEqual(codes(s), [], `${formation}/${upgrade}`);
  }
});

test("per-unit limits scale with the formation size (Rapiers: 3 per size step)", () => {
  let [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 3);
  assert.equal(entry(s).pts, 225 + 75);
  assert.deepEqual(entry(s).roster, { thunderers: 5, rapier: 3 });
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 4);
  assert.deepEqual(codes(s), ["variant-max"]);
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 6);
  assert.deepEqual(codes(s), [], "Medium allows 6");
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 7);
  assert.deepEqual(codes(s), ["variant-max"], "Medium: 7 is too many");
});

test("Warlord replaces a Hearthguard (each size step still has Hearthguard left over)", () => {
  let [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-warlord-replace", "1");
  assert.equal(entry(s).pts, 275);
  assert.deepEqual(entry(s).roster, { warlord: 1, warriors: 9 });
  [s, [u]] = army("f-warrior");
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "u-warlord-replace", "1");
  assert.equal(entry(s).pts, 450 + 25);
  assert.deepEqual(entry(s).roster, { hearthguard: 1, warlord: 1, warriors: 18 });
  [s, [u]] = army("f-berserker");
  s = setUpgrade(s, u, "u-warlord-replace", "1");
  assert.ok(codes(s).includes("upgrade-not-allowed"));
});

test("Hearthguard can be added to Thunderers; Grand Warlord and Living Ancestor add one character each", () => {
  let [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-hearthguard", "1");
  assert.equal(entry(s).pts, 275);
  assert.deepEqual(entry(s).roster, { thunderers: 5, hearthguard: 1 });
  [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-warlord-replace", "1");
  s = setUpgrade(s, u, "u-grandwarlord", "n");
  s = setUpgrade(s, u, "u-living-ancestor", "n");
  assert.equal(entry(s).pts, 250 + 25 + 50 + 50);
  assert.deepEqual(entry(s).roster, { warlord: 1, warriors: 9, "grand-warlord": 1, "living-ancestor": 1 });
  [s, [u]] = army("f-colossus");
  s = setUpgrade(s, u, "u-grandwarlord", "n");
  assert.equal(entry(s).pts, 650);
  assert.deepEqual(codes(s), []);
});

test("mixed slots: artillery, robots and gyrocopters take any distribution, the total must match", () => {
  let [s, [u]] = army("f-artillery-battery");
  assert.deepEqual(entry(s).roster, { "mole-mortar": 5 });
  s = setChoice(s, u, 0, { "mole-mortar": 3, tarantula: 2 });
  assert.deepEqual(entry(s).roster, { "mole-mortar": 3, tarantula: 2 });
  assert.deepEqual(codes(s), []);
  s = setChoice(s, u, 0, { "mole-mortar": 3 });
  assert.ok(codes(s).includes("choice-invalid"), "total must be 5");
  s = setChoice(s, u, 0, { goliath: 5 });
  assert.ok(codes(s).includes("choice-invalid"), "unit not in the list");
  s = setChoice(s, u, 0, { "thudd-gun": 5 });
  s = setUpgrade(s, u, "u-artillery-units", "tarantula", 0, 2);
  assert.equal(entry(s).pts, 150 + 50);
  assert.deepEqual(entry(s).roster, { "thudd-gun": 5, tarantula: 2 });

  [s, [u]] = army("f-guild-robot-squadron");
  s = setChoice(s, u, 0, { "colossus-robot": 2, "conqueror-robot": 3 });
  assert.deepEqual(entry(s).roster, { "colossus-robot": 2, "conqueror-robot": 3 });
  assert.deepEqual(codes(s), []);

  [s, [u]] = army("f-gyrocopter-wing");
  s = setChoice(s, u, 0, { "iron-eagle": 1, "steel-hawk": 1, "war-hawk": 1 });
  s = setUpgrade(s, u, "u-gyrocopter-units", "steel-hawk", 0, 2);
  assert.equal(entry(s).pts, 225 + 100);
  assert.deepEqual(entry(s).roster, { "iron-eagle": 1, "steel-hawk": 3, "war-hawk": 1 });
});

test("mixed slot scales with size; switching size resets the choice", () => {
  let [s, [u]] = army("f-artillery-battery");
  s = setSize(s, u, "g");
  assert.deepEqual(entry(s).roster, { "mole-mortar": 10 });
  s = setChoice(s, u, 0, { "thudd-gun": 4, tarantula: 6 });
  assert.deepEqual(codes(s), []);
  s = setSize(s, u, "r");
  assert.deepEqual(entry(s).roster, { "mole-mortar": 15 });
  assert.equal(entry(s).pts, 375);
});

test("Thunderfire battery: one extra Thunderfire", () => {
  let [s, [u]] = army("f-thunderfire-battery");
  s = setUpgrade(s, u, "u-thunderfire-add", "1");
  assert.equal(entry(s).pts, 175);
  assert.deepEqual(entry(s).roster, { thunderfire: 3 });
});

// ---------------------------------------------------------------- replace upgrades (per unit)

test("Guild Squadron: each Trike replaces one Biker for 5 points", () => {
  let [s, [u]] = army("f-guild-squadron");
  s = setUpgrade(s, u, "u-guild-trikes-replace", "n", 0, 3);
  assert.equal(entry(s).pts, 150 + 15);
  assert.deepEqual(entry(s).roster, { guildmaster: 1, "guild-bikers": 2, "guild-trike": 3 });
  s = setUpgrade(s, u, "u-guild-trikes-replace", "n", 0, 5);
  assert.equal(entry(s).pts, 175);
  assert.deepEqual(entry(s).roster, { guildmaster: 1, "guild-trike": 5 });
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "u-guild-trikes-replace", "n", 0, 6);
  assert.ok(codes(s).includes("replace-insufficient"), "only five Bikers to swap");

  [s, [u]] = army("f-guild-squadron");
  s = setUpgrade(s, u, "u-guild-bikers-add", "n", 0, 2);
  s = setUpgrade(s, u, "u-guild-trikes-replace", "n", 0, 6);
  assert.equal(entry(s).pts, 150 + 40 + 30);
  assert.deepEqual(entry(s).roster, { guildmaster: 1, "guild-bikers": 1, "guild-trike": 6 });
  assert.deepEqual(codes(s), []);
});

test("Land Train: up to three extra Battlecars (50 each); every replacement swaps one Battlecar", () => {
  let [s, [u]] = army("f-landtrain");
  s = setUpgrade(s, u, "u-berserkerbattlecar", "n", 0, 3);
  assert.equal(entry(s).pts, 275 + 150);
  assert.deepEqual(entry(s).roster, { "land-train-engine": 1, "berserker-battlecar": 4 });
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "u-berserkerbattlecar", "n", 0, 4);
  assert.deepEqual(codes(s), ["variant-max"]);

  const swaps = [
    ["u-replaceBerserkerCarForDragon", 25, { "dragon-battlecar": 1 }],
    ["u-replaceBerserkerCarForSkyhammer", 25, { "skyhammer-battlecar": 1 }],
    ["u-replaceBerserkerCarForMortar", 25, { "mortar-battlecar": 1 }],
    ["u-replaceBerserkerCarForIronEagle", 50, { "iron-eagle-battlecar": 1, "recon-iron-eagle": 1 }],
    ["u-replaceBerserkerCarForFireShield", 50, { "fire-shield-battlecar": 1 }],
    ["u-replaceBerserkerCarForBomb", 75, { "bomb-battlecar": 1 }],
  ];
  for (const [upgrade, price, added] of swaps) {
    [s, [u]] = army("f-landtrain");
    s = setUpgrade(s, u, upgrade, "replace", 0, 1);
    assert.equal(entry(s).pts, 275 + price, upgrade);
    assert.deepEqual(entry(s).roster, { "land-train-engine": 1, ...added }, upgrade);
    assert.deepEqual(codes(s), [], upgrade);
  }

  [s, [u]] = army("f-landtrain");
  s = setUpgrade(s, u, "u-replaceBerserkerCarForDragon", "replace", 0, 2);
  assert.ok(codes(s).includes("replace-insufficient"), "only one Battlecar to swap");

  [s, [u]] = army("f-landtrain");
  s = setUpgrade(s, u, "u-berserkerbattlecar", "n", 0, 2);
  s = setUpgrade(s, u, "u-replaceBerserkerCarForDragon", "replace", 0, 2);
  s = setUpgrade(s, u, "u-replaceBerserkerCarForSkyhammer", "replace", 0, 1);
  assert.equal(entry(s).pts, 275 + 100 + 50 + 25);
  assert.deepEqual(entry(s).roster, { "land-train-engine": 1, "dragon-battlecar": 2, "skyhammer-battlecar": 1 });
  assert.deepEqual(codes(s), []);

  [s, [u]] = army("f-landtrain");
  s = setUpgrade(s, u, "u-berserkerbattlecar", "n", 0, 1);
  s = setUpgrade(s, u, "u-replaceBerserkerCarForIronEagle", "replace", 0, 2);
  assert.equal(entry(s).pts, 275 + 50 + 100);
  assert.deepEqual(entry(s).roster, { "land-train-engine": 1, "iron-eagle-battlecar": 2, "recon-iron-eagle": 2 }, "the added recon unit scales with the chosen number too");
  assert.deepEqual(codes(s), []);
});

// ---------------------------------------------------------------- transport

test("Thunderers with Rhinos: 10 points each, all five Thunderers must be carried", () => {
  let [s, [u]] = army("f-thunderer");
  for (const n of [1, 2]) {
    s = setUpgrade(s, u, "u-rhino", "n", 0, n);
    assert.equal(entry(s).pts, 225 + 10 * n);
    assert.deepEqual(codes(s), ["transport-incomplete"], `${n} Rhino(s) carry 5 INF`);
  }
  s = setUpgrade(s, u, "u-rhino", "n", 0, 3);
  assert.equal(entry(s).pts, 255);
  assert.deepEqual(entry(s).roster, { thunderers: 5, rhino: 3 });
  assert.deepEqual(codes(s), []);

  [s, [u]] = army("f-thunderer");
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 4);
  assert.deepEqual(codes(s), ["transport-incomplete"], "Medium: 10 Thunderers need 5 Rhinos");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 5);
  assert.deepEqual(codes(s), []);
});

test("Warriors and Berserkers with Rhinos must carry all their infantry too", () => {
  let [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 1);
  assert.deepEqual(codes(s), ["transport-incomplete"], "10 INF, one Rhino");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 5);
  assert.deepEqual(codes(s), [], "5 Rhinos carry 10 INF");
  [s, [u]] = army("f-berserker");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 1);
  assert.deepEqual(codes(s), ["transport-incomplete"], "6 INF, one Rhino");
});

test("Rhinos may not be taken together with Termites or Moles (Termites and Moles may be combined)", () => {
  let [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-warriors", "n", 0, 1); // 11 INF: a Mole (10) plus a Termite (2) are both needed
  s = setUpgrade(s, u, "u-termite", "n", 0, 1);
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  assert.deepEqual(codes(s), [], "Termites and Moles together are fine");
  [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 3);
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  assert.ok(codes(s).includes("transport-mixed"), "Rhinos together with a Mole");
  [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 3);
  s = setUpgrade(s, u, "u-termite", "n", 0, 1);
  assert.ok(codes(s).includes("transport-mixed"), "Rhinos together with a Termite");
});

test("Termites and Moles carry the formation too: their seats add up", () => {
  let [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-termite", "n", 0, 2);
  assert.deepEqual(codes(s), ["transport-incomplete"], "2 Termites carry 4 of 5 INF");
  s = setUpgrade(s, u, "u-termite", "n", 0, 3);
  assert.equal(entry(s).pts, 225 + 30);
  assert.deepEqual(codes(s), [], "3 Termites carry 6 INF");
  [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  assert.equal(entry(s).pts, 250);
  assert.deepEqual(codes(s), [], "1 Mole carries 10 INF");
  [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-termite", "n", 0, 2);
  assert.deepEqual(codes(s), ["transport-incomplete"], "4 seats for 10 INF");
  s = setUpgrade(s, u, "u-termite", "n", 0, 5);
  assert.deepEqual(codes(s), [], "5 Termites carry 10 INF");
  s = removeUpgrade(s, u, "u-termite");
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  assert.deepEqual(codes(s), [], "1 Mole carries 10 INF");
});

test("units that count as two when transported (Rapier, Warlord) need extra seats", () => {
  let [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 1); // 5 Thunderers + 1 Rapier = 7 seats
  s = setUpgrade(s, u, "u-rhino", "n", 0, 3);
  assert.deepEqual(codes(s), ["transport-incomplete"], "3 Rhinos: 6 seats for 7");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 4);
  assert.deepEqual(codes(s), [], "4 Rhinos: 8 seats for 7");
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 3); // 5 + 3x2 = 11 seats
  s = setUpgrade(s, u, "u-rhino", "n", 0, 5);
  assert.deepEqual(codes(s), ["transport-incomplete"], "5 Rhinos: 10 seats for 11");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 6);
  assert.deepEqual(codes(s), [], "6 Rhinos: 12 seats for 11");

  [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-rapiers", "n", 0, 3);
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  assert.deepEqual(codes(s), ["transport-incomplete"], "1 Mole: 10 seats for 11");
  s = setUpgrade(s, u, "u-mole", "n", 0, 2);
  assert.deepEqual(codes(s), [], "2 Moles");

  [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-warlord-replace", "1"); // Warlord (2) + 9 Warriors = 11 seats
  s = setUpgrade(s, u, "u-rhino", "n", 0, 5);
  assert.deepEqual(codes(s), ["transport-incomplete"], "5 Rhinos: 10 seats for 11");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 6);
  assert.deepEqual(codes(s), [], "6 Rhinos carry the Warlord and nine Warriors");

  [s, [u]] = army("f-warrior");
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "u-warlord-replace", "1"); // 2 + 1 Hearthguard + 18 Warriors = 21 seats
  s = setUpgrade(s, u, "u-rhino", "n", 0, 10);
  assert.deepEqual(codes(s), ["transport-incomplete"], "Medium: 10 Rhinos = 20 seats");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 11);
  assert.deepEqual(codes(s), [], "Medium: 11 Rhinos");
});

test("transports must be the minimum number needed (Rhinos, Termites, Moles)", () => {
  const surplus = (s) => validate(data, s).filter((v) => v.code === "vehicle-surplus").map((v) => [v.params.unit, v.params.max]);
  let [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 3);
  assert.deepEqual(codes(s), [], "3 Rhinos carry 5 INF");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 4);
  assert.deepEqual(codes(s), ["vehicle-surplus"]);
  assert.deepEqual(surplus(s), [["rhino", 3]], "one Rhino too many");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 6);
  assert.deepEqual(surplus(s), [["rhino", 3]], "three Rhinos too many");

  [s, [u]] = army("f-thunderer");
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  assert.deepEqual(codes(s), [], "one Mole carries 5 INF");
  s = setUpgrade(s, u, "u-mole", "n", 0, 2);
  assert.deepEqual(surplus(s), [["mole-we", 1]], "second Mole is superfluous");
  s = removeUpgrade(s, u, "u-mole");
  s = setUpgrade(s, u, "u-termite", "n", 0, 3);
  assert.deepEqual(codes(s), [], "3 Termites carry 5 INF");

  [s, [u]] = army("f-thunderer");
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 5);
  assert.deepEqual(codes(s), [], "Medium: 10 INF, 5 Rhinos");
  s = setUpgrade(s, u, "u-rhino", "n", 0, 6);
  assert.deepEqual(surplus(s), [["rhino", 5]]);

  [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-mole", "n", 0, 1);
  s = setUpgrade(s, u, "u-termite", "n", 0, 1);
  assert.deepEqual(surplus(s), [["termite", 0]], "10 INF are already carried by the Mole");
  s = setUpgrade(s, u, "u-warriors", "n", 0, 1);
  assert.deepEqual(codes(s), [], "with 11 INF the Termite is needed");
  s = setUpgrade(s, u, "u-termite", "n", 0, 2);
  assert.deepEqual(surplus(s), [["termite", 1]], "11 INF: Mole + 1 Termite are enough");
});

// ---------------------------------------------------------------- limits (issue #3)

test("support formations: two per brotherhood, none without a brotherhood", () => {
  let [s] = army("f-berserker", "f-artillery-battery", "f-guild-squadron");
  assert.deepEqual(allCodes(s), [], "two support formations for one brotherhood");
  [s] = army("f-berserker", "f-artillery-battery", "f-guild-squadron", "f-thunderfire-battery");
  assert.deepEqual(allCodes(s), ["formation-limit"], "three support formations for one brotherhood");
  assert.equal(validate(data, s)[0].params.id, "support-per-core");
  [s] = army("f-berserker", "f-thunderer", "f-artillery-battery", "f-guild-squadron", "f-thunderfire-battery", "f-gyrocopter-wing");
  assert.deepEqual(allCodes(s), [], "two brotherhoods allow four support formations");
  [s] = army("f-air-attack-corps");
  assert.deepEqual(allCodes(s), ["formation-limit"], "support formation without any brotherhood");
});

test("war engines: any number, but at most one third of the army points", () => {
  let [s] = army("f-warrior", "f-warrior", "f-warrior", "f-thunderer", "f-thunderer", "f-colossus");
  assert.equal(summarize(data, s).total, 1800);
  assert.deepEqual(allCodes(s), [], "600 of 1800 is exactly one third");
  [s] = army("f-warrior", "f-warrior", "f-warrior", "f-thunderer", "f-thunderer", "f-colossus", "f-cyclops");
  assert.deepEqual(allCodes(s), ["share-limit"], "1200 of 2400 is half");
  assert.equal(validate(data, s)[0].params.id, "warengines-share");
  [s] = army("f-colossus");
  assert.deepEqual(allCodes(s), ["share-limit"], "a war engine alone is the whole army");
  [s] = army("f-berserker", "f-air-attack-corps", "f-thunderfire-battery");
  assert.deepEqual(allCodes(s), [], "support formations do not count as war engines");
});

test("0-1 Grand Warlord and 0-1 Living Ancestor per army, one character each", () => {
  for (const id of ["u-grandwarlord", "u-living-ancestor"]) {
    const v = data.upgrades.find((u) => u.id === id).variants[0];
    assert.equal(v.perUnit, undefined, `${id}: 'add one' is not a per-unit purchase`);
    assert.equal(v.perArmy, 1, `${id}: once per army`);
  }
  let [s, [w1, w2]] = army("f-warrior", "f-warrior");
  s = setUpgrade(s, w1, "u-warlord-replace", "1");
  s = setUpgrade(s, w1, "u-grandwarlord", "n");
  s = setUpgrade(s, w1, "u-living-ancestor", "n");
  assert.equal(entry(s).pts, 250 + 25 + 50 + 50);
  assert.deepEqual(entry(s).roster, { warlord: 1, warriors: 9, "grand-warlord": 1, "living-ancestor": 1 });
  assert.deepEqual(allCodes(s), [], "one of each, on the same formation");
  s = setUpgrade(s, w2, "u-warlord-replace", "1");
  s = setUpgrade(s, w2, "u-grandwarlord", "n");
  assert.deepEqual(allCodes(s), ["variant-army-limit"], "a second Grand Warlord");
  s = setUpgrade(s, w2, "u-living-ancestor", "n");
  assert.deepEqual(allCodes(s), ["variant-army-limit", "variant-army-limit"], "and a second Living Ancestor");
  s = setUpgrade(s, w2, "u-grandwarlord", "n"); // re-picking does not add a character
  assert.equal(allCodes(s).length, 2);
});

test("a chosen count cannot add more than one Grand Warlord or Living Ancestor", () => {
  let [s, [u]] = army("f-warrior");
  s = setUpgrade(s, u, "u-warlord-replace", "1");
  s = setUpgrade(s, u, "u-grandwarlord", "n", 0, 3);
  s = setUpgrade(s, u, "u-living-ancestor", "n", 0, 2);
  assert.equal(entry(s).pts, 375);
  assert.equal(entry(s).roster["grand-warlord"], 1);
  assert.equal(entry(s).roster["living-ancestor"], 1);
  assert.deepEqual(allCodes(s), []);
});

test("Grand Warlord and Living Ancestor need a Warlord, a Guildmaster or a war engine in the formation", () => {
  for (const up of ["u-grandwarlord", "u-living-ancestor"]) {
    let [s, [u]] = army("f-warrior");
    s = setUpgrade(s, u, up, "n");
    assert.deepEqual(codes(s), ["variant-requires"], `${up}: a Warrior formation has only a Hearthguard`);
    s = setUpgrade(s, u, "u-warlord-replace", "1");
    assert.deepEqual(codes(s), [], `${up}: after swapping the Hearthguard for a Warlord (picked after the character)`);
    s = removeUpgrade(s, u, "u-warlord-replace");
    assert.deepEqual(codes(s), ["variant-requires"], `${up}: the Warlord is gone again`);

    [s, [u]] = army("f-warrior");
    s = setSize(s, u, "g");
    s = setUpgrade(s, u, "u-warlord-replace", "1");
    s = setUpgrade(s, u, up, "n");
    assert.deepEqual(codes(s), [], `${up}: Medium Warrior with a Warlord`);

    for (const formation of ["f-guild-squadron", "f-air-attack-corps", "f-colossus", "f-cyclops", "f-landtrain", "f-leviathan"]) {
      [s, [u]] = army(formation);
      s = setUpgrade(s, u, up, "n");
      assert.deepEqual(codes(s), [], `${up} on ${formation}`);
    }
  }
});

// ---------------------------------------------------------------- order of selection

test("the order in which upgrades are picked does not change the result (Land Train)", () => {
  const pick = (order) => {
    let [s, [u]] = army("f-landtrain");
    for (const [up, v, n] of order) s = setUpgrade(s, u, up, v, 0, n);
    return entry(s);
  };
  const a = pick([["u-berserkerbattlecar", "n", 2], ["u-replaceBerserkerCarForDragon", "replace", 2]]);
  const b = pick([["u-replaceBerserkerCarForDragon", "replace", 2], ["u-berserkerbattlecar", "n", 2]]);
  assert.deepEqual(b.roster, a.roster);
  assert.deepEqual(b.problems, a.problems);
});

test("the order in which upgrades are picked does not change the result (Guild Squadron)", () => {
  const pick = (order) => {
    let [s, [u]] = army("f-guild-squadron");
    for (const [up, n] of order) s = setUpgrade(s, u, up, "n", 0, n);
    return entry(s);
  };
  const a = pick([["u-guild-bikers-add", 2], ["u-guild-trikes-replace", 6]]);
  const b = pick([["u-guild-trikes-replace", 6], ["u-guild-bikers-add", 2]]);
  assert.deepEqual(b.roster, a.roster);
  assert.deepEqual(b.problems, a.problems);
});

// ---------------------------------------------------------------- exchange

test("export -> link -> import round-trips sizes, distributions and per-unit counts", () => {
  let [s, [berserker, battery, squadron, train]] = army("f-berserker", "f-artillery-battery", "f-guild-squadron", "f-landtrain");
  s = setSize(s, berserker, "g");
  s = setUpgrade(s, berserker, "u-berserkers", "n", 0, 3);
  s = setChoice(s, battery, 0, { "mole-mortar": 3, tarantula: 2 });
  s = setUpgrade(s, battery, "u-artillery-units", "thudd-gun", 0, 2);
  s = setUpgrade(s, squadron, "u-guild-trikes-replace", "n", 0, 4);
  s = setUpgrade(s, train, "u-berserkerbattlecar", "n", 0, 2);
  s = setUpgrade(s, train, "u-replaceBerserkerCarForDragon", "replace", 0, 2);
  const { total, entries } = summarize(data, s);
  const exp = buildExport({ army: ARMY, armyVersion: raw.version, name: "Ärger Squats", state: s, entries, total });
  assert.equal(exp.ruleset, "netea");
  assert.equal(exp.formations[0].size, "g");
  assert.deepEqual(exp.formations[1].choices, { 0: { "mole-mortar": 3, tarantula: 2 } });
  const back = sanitize(parseInput(toToken(exp)), data);
  assert.deepEqual(back.state, s);
  assert.equal(back.dropped, 0);
  assert.equal(summarize(data, back.state).total, total);
});

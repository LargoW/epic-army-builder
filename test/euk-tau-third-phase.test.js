import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, setSize, setChoice, summarize, validate, withProfiles, rosterProfiles, unitSlots,
} from "../engine/engine.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

// T'au - Third Phase Expansion (Epic UK, 200824).
// NOTE: no source PDF was available when these tests were written. Points and units below are taken from the
// current data file, so they pin the data down but do not prove it against the original list.
// Structure (selectors, limits, choices, profiles) is checked independently of that.
const load = (p) => JSON.parse(readFileSync(new URL(`../data/euk/tau/${p}.json`, import.meta.url), "utf8"));
const raw = load("tau");
const profiles = load("tau.profiles");
const data = withProfiles(raw, profiles);
const ARMY = "euk/tau/tau";

function army(...ids) {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
}
// Limits that depend on the rest of the army (support per core, air caste share, 0-1 spacecraft) are tested in the
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
    for (const z of f.sizes || []) for (const slot of z.units || []) for (const u of [slot.unit, ...(slot.oneOf || [])].filter(Boolean)) assert.ok(units.has(u), `${f.id}/${z.id}: unit ${u}`);
    for (const u of f.upgrades) assert.ok(upgrades.has(u), `${f.id}: upgrade ${u}`);
  }
  for (const u of data.upgrades)
    for (const v of u.variants) for (const fx of v.effects) for (const id of [fx.unit, fx.from, fx.to].filter(Boolean)) assert.ok(units.has(id), `${u.id}/${v.id}: unit ${id}`);
  const inSection = data.sections.flatMap((s) => s.formations);
  for (const id of inSection) assert.ok(formations.has(id), `section lists unknown formation ${id}`);
  for (const f of data.formations) assert.equal(inSection.filter((x) => x === f.id).length, 1, `${f.id} in exactly one section`);
  for (const id of units) assert.ok(profiles.units[id], `profile for ${id}`);
  assert.deepEqual(Object.keys(profiles.units).filter((id) => !units.has(id)), [], "profiles of units that do not exist");
  assert.deepEqual(data.upgrades.filter((u) => !data.formations.some((f) => f.upgrades.includes(u.id))), [], "unused upgrades");
  for (const f of data.formations) {
    const [s] = army(f.id);
    assert.ok(rosterProfiles(data, entry(s).roster).every((r) => r.profile && r.name), `${f.id}: profiles`);
  }
  assert.equal(rosterProfiles(data, { ethereal: 1 })[0].profile.name, "Ethereal");
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

test("section and tag agree: core, support, air", () => {
  for (const s of data.sections)
    for (const id of s.formations) assert.ok(data.formations.find((f) => f.id === id).tags.includes(s.id), `${id} in ${s.id}`);
});

test("every formation is valid in its base configuration (support needs a core, air is limited by share)", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    assert.deepEqual(codes(s), [], f.id);
  }
});

// ---------------------------------------------------------------- formations and sizes

test("base points and units of every formation", () => {
  const expected = {
    "f-crisis-cadre": [250, { "shas-el": 1, "xv8-crisis": 4 }],
    "f-fire-warrior-cadre": [225, { "fire-warrior": 8 }],
    "f-armour-group": [200, { "hammerhead-ionhead": 4 }],
    "f-broadside-group": [300, { "xv88-broadside": 6 }],
    "f-kroot-kindred": [175, { "kroot-master-shaper": 1, "kroot-warrior": 9 }],
    "f-pathfinder-group": [200, { pathfinder: 4, devilfish: 2 }],
    "f-recon-group": [175, { tetra: 6 }],
    "f-skysweep-group": [250, { skyray: 3 }],
    "f-stealth-group": [225, { "xv15-stealth": 6 }],
    "f-barracuda-squadron": [150, { barracuda: 2 }],
    "f-manta": [650, { manta: 1 }],
    "f-orca": [150, { orca: 1 }],
    "f-spacecraft": [200, { "protector-cruiser": 1 }],
    "f-tiger-shark-squadron": [175, { "tiger-shark": 2 }],
    "f-tiger-shark-ax-1-0-squadron": [350, { "tiger-shark-ax-1-0": 2 }],
  };
  assert.deepEqual(Object.keys(expected).sort(), data.formations.map((f) => f.id).sort(), "table covers every formation");
  for (const [id, [pts, roster]] of Object.entries(expected)) {
    const [s] = army(id);
    assert.equal(entry(s).pts, pts, `${id} points`);
    assert.deepEqual(entry(s).roster, roster, `${id} roster`);
  }
});

test("sizes that swap the units: Fire Warrior cadre, Armour Group, Spacecraft", () => {
  const rows = [
    ["f-fire-warrior-cadre", "infantry", 225, { "fire-warrior": 8 }],
    ["f-fire-warrior-cadre", "transport", 225, { "fire-warrior": 6, devilfish: 3 }],
    ["f-armour-group", "ion-fusion", 200, { "hammerhead-ionhead": 4 }],
    ["f-armour-group", "railhead", 225, { "hammerhead-railhead": 4 }],
    ["f-spacecraft", "protector", 200, { "protector-cruiser": 1 }],
    ["f-spacecraft", "custodian", 225, { "custodian-battleship": 1 }],
  ];
  for (const [formation, size, pts, roster] of rows) {
    let [s, [u]] = army(formation);
    s = setSize(s, u, size);
    assert.equal(entry(s).pts, pts, `${formation}/${size} points`);
    assert.deepEqual(entry(s).roster, roster, `${formation}/${size} roster`);
    assert.deepEqual(codes(s), [], `${formation}/${size}`);
  }
});

test("unit choices: Armour Group (Ionhead or Fusionhead) and Recon Group (Tetra or Piranha) take any combination", () => {
  let [s, [u]] = army("f-armour-group");
  assert.deepEqual(unitSlots(raw.formations.find((f) => f.id === "f-armour-group"), s.formations[0])[0].oneOf, ["hammerhead-ionhead", "hammerhead-fusionhead"], "the choice is offered in the Ionhead/Fusionhead size");
  s = setChoice(s, u, 0, { "hammerhead-ionhead": 1, "hammerhead-fusionhead": 3 });
  assert.deepEqual(entry(s).roster, { "hammerhead-ionhead": 1, "hammerhead-fusionhead": 3 });
  assert.deepEqual(codes(s), []);
  s = setChoice(s, u, 0, { "hammerhead-railhead": 4 });
  assert.ok(codes(s).includes("choice-invalid"), "Railheads are the other size");
  s = setChoice(s, u, 0, { "hammerhead-fusionhead": 3 });
  assert.ok(codes(s).includes("choice-invalid"), "four Gunships are required");
  s = setChoice(s, u, 0, { "hammerhead-fusionhead": 4 });
  s = setSize(s, u, "railhead");
  assert.equal(unitSlots(raw.formations.find((f) => f.id === "f-armour-group"), s.formations[0])[0].oneOf, undefined, "no choice for Railheads");
  assert.deepEqual(entry(s).roster, { "hammerhead-railhead": 4 });
  s = setSize(s, u, "ion-fusion");
  assert.deepEqual(entry(s).roster, { "hammerhead-ionhead": 4 }, "switching size resets the choice");

  [s, [u]] = army("f-recon-group");
  s = setChoice(s, u, 0, { tetra: 2, piranha: 4 });
  assert.deepEqual(entry(s).roster, { tetra: 2, piranha: 4 });
  assert.deepEqual(codes(s), []);
  s = setChoice(s, u, 0, { tetra: 6, piranha: 1 });
  assert.ok(codes(s).includes("choice-invalid"));
  assert.equal(raw.formations.find((f) => f.id === "f-recon-group").sizes, undefined, "Recon Group has no sizes");
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

test("upgrades add the listed units for the listed price", () => {
  // [formation, upgrade, variant, price, units added]
  const rows = [
    ["f-crisis-cadre", "u-crisis-suits", "1", 50, { "xv8-crisis": 1 }],
    ["f-crisis-cadre", "u-crisis-suits", "2", 75, { "xv8-crisis": 2 }],
    ["f-crisis-cadre", "u-crisis-suits", "3", 150, { "xv8-crisis": 3 }],
    ["f-crisis-cadre", "u-crisis-suits", "4", 200, { "xv8-crisis": 4 }],
    ["f-crisis-cadre", "u-gun-drones", "1", 25, { "gun-drone": 2 }],
    ["f-fire-warrior-cadre", "u-bonded-teams", "1", 25, { bondedTeam: 1 }],
    ["f-fire-warrior-cadre", "u-broadsides", "1", 150, { "xv88-broadside": 3 }],
    ["f-fire-warrior-cadre", "u-ethereal", "1", 50, { ethereal: 1 }],
    ["f-fire-warrior-cadre", "u-fire-warriors", "1", 100, { "fire-warrior": 4 }],
    ["f-fire-warrior-cadre", "u-fire-warriors", "2", 125, { "fire-warrior": 4, devilfish: 2 }],
    ["f-fire-warrior-cadre", "u-hammerheads", "1", 75, { "hammerhead-ionhead": 2 }],
    ["f-fire-warrior-cadre", "u-hammerheads", "2", 50, { "hammerhead-railhead": 1 }],
    ["f-fire-warrior-cadre", "u-hammerheads", "3", 100, { "hammerhead-railhead": 2 }],
    ["f-fire-warrior-cadre", "u-hammerheads", "4", 50, { "hammerhead-fusionhead": 1 }],
    ["f-fire-warrior-cadre", "u-hammerheads", "5", 100, { "hammerhead-fusionhead": 2 }],
    ["f-fire-warrior-cadre", "u-pathfinders", "1", 100, { pathfinder: 2, devilfish: 1 }],
    ["f-fire-warrior-cadre", "u-piranhas", "1", 75, { piranha: 3 }],
    ["f-fire-warrior-cadre", "u-skyray", "1", 100, { skyray: 1 }],
    ["f-kroot-kindred", "u-kroot", "1", 75, { "kroot-warrior": 5 }],
    ["f-kroot-kindred", "u-kroot-hounds", "1", 50, { "kroot-hound": 3 }],
    ["f-kroot-kindred", "u-krootox", "1", 50, { krootox: 3 }],
    ["f-tiger-shark-squadron", "u-tiger-shark-drones", "1", 100, { "gun-drone": 6 }],
  ];
  for (const [formation, upgrade, variant, price, added] of rows) {
    let [s, [u]] = army(formation);
    const base = entry(s);
    s = setUpgrade(s, u, upgrade, variant);
    const want = { ...base.roster };
    for (const [unit, n] of Object.entries(added)) want[unit] = (want[unit] || 0) + n;
    assert.equal(entry(s).pts, base.pts + price, `${formation}/${upgrade}/${variant} points`);
    assert.deepEqual(entry(s).roster, want, `${formation}/${upgrade}/${variant} roster`);
    assert.deepEqual(codes(s), [], `${formation}/${upgrade}/${variant}`);
  }
});

test("Shas'o replaces the Shas'el", () => {
  let [s, [u]] = army("f-crisis-cadre");
  s = setUpgrade(s, u, "u-shas-o", "1");
  assert.equal(entry(s).pts, 300);
  assert.deepEqual(entry(s).roster, { "shas-o": 1, "xv8-crisis": 4 });
  assert.deepEqual(codes(s), []);
});

test("upgrades are only offered where the list allows them", () => {
  let [s, [u]] = army("f-crisis-cadre");
  assert.ok(codes(setUpgrade(s, u, "u-broadsides", "1")).includes("upgrade-not-allowed"));
  [s, [u]] = army("f-skysweep-group");
  assert.ok(codes(setUpgrade(s, u, "u-gun-drones", "1")).includes("upgrade-not-allowed"));
  [s, [u]] = army("f-fire-warrior-cadre");
  assert.ok(codes(setUpgrade(s, u, "u-shas-o", "1")).includes("upgrade-not-allowed"));
});

// ---------------------------------------------------------------- limits

test("at most three upgrades per formation", () => {
  let [s, [u]] = army("f-fire-warrior-cadre");
  for (const up of ["u-broadsides", "u-gun-drones", "u-skyray"]) s = setUpgrade(s, u, up, "1");
  assert.deepEqual(codes(s), [], "three upgrades");
  s = setUpgrade(s, u, "u-ethereal", "1");
  assert.deepEqual(codes(s), ["upgrade-limit"], "four upgrades");
  assert.equal(validate(data, s)[0].params.id, "max-three-upgrades");
  [s, [u]] = army("f-crisis-cadre");
  for (const up of ["u-shas-o", "u-gun-drones"]) s = setUpgrade(s, u, up, "1");
  s = setUpgrade(s, u, "u-crisis-suits", "1");
  assert.deepEqual(codes(s), [], "all three Crisis cadre upgrades");
});

test("0-1 Shas'o and 0-1 Ethereal per army", () => {
  let [s, [a, b]] = army("f-crisis-cadre", "f-crisis-cadre");
  s = setUpgrade(s, a, "u-shas-o", "1");
  assert.deepEqual(allCodes(s), [], "one Shas'o");
  s = setUpgrade(s, b, "u-shas-o", "1");
  assert.deepEqual(allCodes(s), ["variant-army-limit"], "two Shas'o");

  [s, [a, b]] = army("f-fire-warrior-cadre", "f-fire-warrior-cadre");
  s = setUpgrade(s, a, "u-ethereal", "1");
  assert.deepEqual(allCodes(s), [], "one Ethereal");
  s = setUpgrade(s, b, "u-ethereal", "1");
  assert.deepEqual(allCodes(s), ["variant-army-limit"], "two Ethereals");
});

test("support formations: three per core formation, none without a core", () => {
  let [s] = army("f-crisis-cadre", "f-armour-group", "f-broadside-group", "f-kroot-kindred");
  assert.deepEqual(allCodes(s), []);
  [s] = army("f-crisis-cadre", "f-armour-group", "f-broadside-group", "f-kroot-kindred", "f-pathfinder-group");
  assert.deepEqual(allCodes(s), ["formation-limit"]);
  assert.equal(validate(data, s)[0].params.id, "support-per-core");
  [s] = army("f-pathfinder-group");
  assert.deepEqual(allCodes(s), ["formation-limit"], "support formation without a core");
});

test("air caste: at most one third of the army points (exactly one third is allowed)", () => {
  let [s] = army("f-crisis-cadre", "f-fire-warrior-cadre", "f-fire-warrior-cadre", "f-tiger-shark-ax-1-0-squadron");
  assert.equal(summarize(data, s).total, 1050);
  assert.deepEqual(allCodes(s), [], "350 of 1050 is exactly one third");
  [s] = army("f-crisis-cadre", "f-fire-warrior-cadre", "f-fire-warrior-cadre", "f-tiger-shark-ax-1-0-squadron", "f-orca");
  assert.deepEqual(allCodes(s), ["share-limit"], "500 of 1200");
  assert.equal(validate(data, s)[0].params.id, "air-caste-third");
  [s] = army("f-manta");
  assert.deepEqual(allCodes(s), ["share-limit"], "a Manta alone");
});

test("0-1 Spacecraft", () => {
  let [s] = army("f-crisis-cadre", "f-fire-warrior-cadre", "f-fire-warrior-cadre", "f-spacecraft");
  assert.deepEqual(allCodes(s), []);
  [s] = army("f-crisis-cadre", "f-fire-warrior-cadre", "f-fire-warrior-cadre", "f-spacecraft", "f-spacecraft");
  assert.ok(allCodes(s).includes("formation-limit"));
  assert.equal(validate(data, s).find((v) => v.code === "formation-limit").params.id, "spacecraft-limit");
});

// ---------------------------------------------------------------- exchange

test("export -> link -> import round-trips sizes, choices and upgrades", () => {
  let [s, [crisis, armour, recon, fire]] = army("f-crisis-cadre", "f-armour-group", "f-recon-group", "f-fire-warrior-cadre");
  s = setUpgrade(s, crisis, "u-shas-o", "1");
  s = setUpgrade(s, crisis, "u-crisis-suits", "3");
  s = setChoice(s, armour, 0, { "hammerhead-ionhead": 1, "hammerhead-fusionhead": 3 });
  s = setChoice(s, recon, 0, { tetra: 4, piranha: 2 });
  s = setSize(s, fire, "transport");
  s = setUpgrade(s, fire, "u-ethereal", "1");
  const { total, entries } = summarize(data, s);
  const exp = buildExport({ army: ARMY, armyVersion: raw.version, name: "Third Phase Ärger", state: s, entries, total });
  assert.equal(exp.ruleset, "euk");
  const back = sanitize(parseInput(toToken(exp)), data);
  assert.deepEqual(back.state, s);
  assert.equal(back.dropped, 0);
  assert.equal(summarize(data, back.state).total, total);
});

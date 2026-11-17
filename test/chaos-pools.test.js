import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createState, addFormation, setUpgrade, summarize, poolSummary, withProfiles, rosterProfiles } from "../engine/engine.js";

// Daemon pools of the Chaos armies: bought points (pool formations) plus free points from Daemonic Pacts.
const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}.json`, import.meta.url), "utf8"));
const index = load("index");
const army = (data, ...ids) => ids.reduce((s, id) => addFormation(s, id), createState());
const pools = (data, s) => Object.fromEntries(poolSummary(data, s).map((p) => [p.id, p]));
const read = (id) => ({ raw: load(id), data: withProfiles(load(id), load(`${id}.profiles`)) });

test("every pool of every army points at existing formations, upgrades and units", () => {
  let armiesWithPools = 0;
  for (const a of index.armies) {
    const d = load(a.id);
    if (!d.pools) continue;
    armiesWithPools++;
    const formations = new Set(d.formations.map((f) => f.id));
    const upgrades = new Set(d.upgrades.map((u) => u.id));
    const ids = new Set();
    for (const p of d.pools) {
      assert.ok(!ids.has(p.id), `${a.id}: pool id ${p.id} twice`);
      ids.add(p.id);
      assert.ok(p.name, `${a.id}/${p.id}: name`);
      assert.ok(p.paid.length, `${a.id}/${p.id}: paid`);
      for (const f of p.paid) assert.ok(f.startsWith("tag:") || formations.has(f), `${a.id}/${p.id}: formation ${f}`);
      for (const src of p.free) {
        assert.ok(src.upgrade ? upgrades.has(src.upgrade) : d.units[src.unit], `${a.id}/${p.id}: free source ${JSON.stringify(src)}`);
        assert.ok(src.upgrade || src.unit, `${a.id}/${p.id}: free source needs upgrade or unit`);
      }
    }
  }
  assert.equal(armiesWithPools, 7, "six German legions and the English Thousand Sons");
});

test("armies without pool formations have no pools", () => {
  for (const id of ["ear-de/Chaos/blacklegion", "ear-de/Chaos/thousandsons", "ear-de/Chaos/ironwarriors"]) assert.equal(load(id).pools, undefined, id);
});

test("World Eaters: pool formations are bought points, every Dämonenpakt adds one free point to the lesser pool", () => {
  const { raw, data } = read("ear-de/Chaos/worldeaters");
  let s = army(data, "we-gefolge", "we-pool-niedere-daemo", "we-pool-niedere-daemo", "we-pool-groesse-daemo");
  let p = pools(data, s);
  assert.deepEqual([p.lesser.paid, p.lesser.free, p.lesser.total, p.greater.paid, p.greater.total], [2, 0, 2, 1, 1]);
  s = setUpgrade(s, 1, "we-upgrade-daeemonpakt", "1");
  p = pools(data, s);
  assert.deepEqual([p.lesser.paid, p.lesser.free, p.lesser.total], [2, 1, 3], "two bought + one free from the pact");
  assert.deepEqual(p.lesser.sources, [{ label: "Dämonenpakt", count: 1, points: 1 }]);
  assert.equal(p.greater.free, 0, "the pact feeds the pool of lesser daemons only");
  const entry = summarize(data, s).entries[0];
  assert.equal(entry.roster["we-daemonenpakt"], 1, "the formation carries the pact ability");
  assert.equal(entry.roster["we-daemonenprinz"], undefined, "the pact no longer adds a Daemon Prince");
  const row = rosterProfiles(data, entry.roster).find((r) => r.unit === "we-daemonenpakt");
  assert.equal(row.name, "Dämonenpakt");
  assert.ok(row.profile.specialRules.some((r) => r.name === "Dämonenpakt"), "the ability is explained in the profile");
  assert.equal(raw.pools[0].name, "Pool niedere Dämonen");
});

test("Thousand Sons (Epic UK): per-unit daemons are bought points, Daemonic Pacts are free ones", () => {
  const { data } = read("euk/chaos/ts");
  let s = army(data, "f-ts-retinue", "f-ts-terminators", "f-lesser-daemon-pool", "f-greater-daemon-pool");
  s = setUpgrade(s, 3, "u-lesser-daemon", "n", 0, 3);
  s = setUpgrade(s, 4, "u-greater-daemon", "n", 0, 2);
  let p = pools(data, s);
  assert.deepEqual([p.lesser.paid, p.lesser.free, p.lesser.total, p.greater.paid, p.greater.total], [3, 0, 3, 2, 2]);
  s = setUpgrade(s, 2, "u-daemonic-pact", "1");
  s = setUpgrade(s, 1, "u-daemonic-pact", "1");
  p = pools(data, s);
  assert.deepEqual([p.lesser.paid, p.lesser.free, p.lesser.total], [3, 2, 5], "3 bought + 2 free from two pacts");
  assert.equal(p.lesser.sources[0].count, 2);
  assert.equal(summarize(data, s).entries[1].roster["daemonic-pact"], 1);
});

test("Night Lords and Alpha Legion: units that carry the Dämonenpakt rule are free points", () => {
  for (const [id, unitIds, pool] of [["ear-de/Chaos/nightlords", ["nl-hauptmann", "nl-erster-hauptmann"], "nl-pool-niedere-daemo"], ["ear-de/Chaos/alphalegion", ["al-ikon"], "al-pool-niedere-daemo"]]) {
    const { raw, data } = read(id);
    for (const u of unitIds) assert.ok(data.units[u], `${id}: ${u}`);
    const carriers = raw.formations.filter((f) => f.units.some((slot) => unitIds.includes(slot.unit)));
    const s = army(data, ...carriers.map((f) => f.id), pool);
    const counted = summarize(data, s).entries.reduce((a, e) => a + unitIds.reduce((x, u) => x + (e.roster[u] || 0), 0), 0);
    const p = pools(data, s).lesser;
    assert.equal(p.paid, 1, `${id}: one bought point`);
    assert.equal(p.free, counted, `${id}: every unit with the pact rule`);
    assert.equal(p.total, 1 + counted, id);
  }
  assert.ok(read("ear-de/Chaos/nightlords").raw.formations.some((f) => f.units.some((slot) => slot.unit === "nl-hauptmann")));
});

test("Death Guard, Emperor's Children, Word Bearers: bought points of both pools (no pact upgrade in the data yet)", () => {
  for (const [id, lesser, greater] of [["ear-de/Chaos/deathguard", "fdg-pool-niedere-daemone", "fdg-pool-groesse-daemone"], ["ear-de/Chaos/emperorschildren", "ec-pool-niedere-daemo", "ec-pool-groesse-daemo"], ["ear-de/Chaos/wordbearers", "wb-pool-niedere-daemo", "wb-pool-groesse-daemo"]]) {
    const { data } = read(id);
    const p = pools(data, army(data, lesser, lesser, lesser, greater));
    assert.deepEqual([p.lesser.paid, p.lesser.free, p.greater.paid, p.greater.free], [3, 0, 1, 0], id);
    assert.deepEqual(p.lesser.sources, [], id);
  }
});

test("the points of a pool formation match the points the player pays (20 per lesser, 50 per greater point)", () => {
  for (const [id, lesser, greater, pl, pg] of [["ear-de/Chaos/worldeaters", "we-pool-niedere-daemo", "we-pool-groesse-daemo", 20, 50], ["ear-de/Chaos/wordbearers", "wb-pool-niedere-daemo", "wb-pool-groesse-daemo", 20, 50]]) {
    const { data } = read(id);
    const e = summarize(data, army(data, lesser, greater)).entries;
    assert.deepEqual(e.map((x) => x.pts), [pl, pg], id);
  }
});

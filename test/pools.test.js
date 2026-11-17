import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, addFormation, setUpgrade, poolSummary } from "../engine/engine.js";

// poolSummary with synthetic data: bought points from pool formations, free points from pacts.
const variant = (id, pts, effects, extra = {}) => ({ id, label: id, pts, effects, ...extra });
const data = {
  units: { d: { name: "Lesser" }, g: { name: "Greater" }, mark: { name: "Pakt-Marker" }, boss: { name: "Boss" } },
  sections: [{ id: "s", name: "S", formations: ["core", "pool-l", "pool-g"] }],
  formations: [
    { id: "core", name: "Core", pts: 100, tags: ["core"], units: [{ unit: "boss", count: 1 }], upgrades: ["pact", "multi"] },
    { id: "pool-l", name: "Pool L", pts: 20, tags: ["daemon-pool"], units: [{ unit: "d", count: 1 }], upgrades: [] },
    { id: "pool-g", name: "Pool G", pts: 0, tags: ["daemon-pool"], units: [], upgrades: ["gd"] },
  ],
  upgrades: [
    { id: "pact", name: "Dämonenpakt", variants: [variant("1", 25, [{ op: "add", unit: "mark", count: 1 }])] },
    { id: "multi", name: "Mehrfach", variants: [variant("1", 10, [], { perUnit: true })] },
    { id: "gd", name: "G", variants: [variant("1", 50, [{ op: "add", unit: "g", count: 1 }], { perUnit: true })] },
  ],
  pools: [
    { id: "lesser", name: "Pool niedere Dämonen", paid: ["pool-l"], free: [{ upgrade: "pact" }, { unit: "boss", label: "Boss mit Pakt", points: 2 }, { upgrade: "multi", label: "Vielfach" }] },
    { id: "greater", name: "Pool großer Dämonen", paid: ["tag:daemon-pool"], free: [] },
  ],
};
const army = (...ids) => ids.reduce((s, id) => addFormation(s, id), createState());
const byId = (s) => Object.fromEntries(poolSummary(data, s).map((p) => [p.id, p]));

test("without pools in the data there is no summary", () => {
  assert.deepEqual(poolSummary({ ...data, pools: undefined }, army("core")), []);
});

test("an empty army has empty pools", () => {
  const p = byId(createState());
  assert.deepEqual([p.lesser.paid, p.lesser.free, p.lesser.total, p.greater.total], [0, 0, 0, 0]);
});

test("every unit of a pool formation is one bought point", () => {
  let s = army("pool-l", "pool-l", "pool-l", "pool-g");
  s = setUpgrade(s, 4, "gd", "1", 0, 4);
  const p = byId(s);
  assert.equal(p.lesser.paid, 3, "three Pool L entries");
  assert.equal(p.greater.paid, 3 + 4, "paid selectors may be tags: all pool formations, 3 + 4 units");
});

test("pacts add free points: upgrades once, per-unit upgrades per unit, units per unit in the army", () => {
  let s = army("core", "core");
  s = setUpgrade(s, 1, "pact", "1");
  let p = byId(s).lesser;
  assert.deepEqual([p.paid, p.free, p.total], [0, 1 + 2 * 2, 5], "one pact upgrade, two bosses with 2 points each");
  s = setUpgrade(s, 2, "multi", "1", 0, 3);
  p = byId(s).lesser;
  assert.equal(p.free, 1 + 4 + 3, "three more points from the per-unit upgrade");
  assert.deepEqual(p.sources, [{ label: "Dämonenpakt", count: 1, points: 1 }, { label: "Boss mit Pakt", count: 2, points: 4 }, { label: "Vielfach", count: 3, points: 3 }]);
});

test("bought and free points add up", () => {
  let s = army("core", "pool-l", "pool-l");
  s = setUpgrade(s, 1, "pact", "1");
  const p = byId(s).lesser;
  assert.deepEqual([p.paid, p.free, p.total], [2, 3, 5]);
});

test("the label falls back to the upgrade or unit name", () => {
  const d2 = { ...data, pools: [{ id: "x", name: "X", paid: ["pool-l"], free: [{ upgrade: "pact" }, { unit: "boss" }] }] };
  const s = army("core");
  assert.deepEqual(poolSummary(d2, s)[0].sources.map((x) => x.label), ["Dämonenpakt", "Boss"]);
});

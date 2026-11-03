import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createState, addFormation, setUpgrade, setSize, setChoice, summarize, validate } from "../engine/engine.js";
import { buildExport, sanitize } from "../engine/exchange.js";

const data = JSON.parse(readFileSync(new URL("../data/ear-de/o/goffsclan.json", import.meta.url), "utf8"));

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

test("every Ork formation is valid in its base configuration", () => {
  for (const f of data.formations) {
    if (f.tags.includes("fleet")) continue;
    const [s] = army(f.id);
    assert.deepEqual(codes(s), [], f.id);
  }
});

test("size multiplies units and uses the listed price, not 2x/3x", () => {
  let [s, [u]] = army("goffs-mob");
  assert.deepEqual(entry(s).roster, { boss: 2, boys: 6, grots: 2 });
  s = setSize(s, u, "g");
  assert.equal(entry(s).pts, 350);
  assert.deepEqual(entry(s).roster, { boss: 4, boys: 12, grots: 4 });
  s = setSize(s, u, "r");
  assert.equal(entry(s).pts, 500);
  assert.equal(entry(s).roster.boys, 18);
});

test("per-unit upgrades: price per unit, limits scale with size", () => {
  let [s, [u]] = army("goffs-mob");
  s = setUpgrade(s, u, "add-boys-15", "n", 0, 4);
  assert.equal(entry(s).pts, 200 + 60);
  assert.equal(entry(s).roster.boys, 10);
  s = setUpgrade(s, u, "add-stampfa-60-max2", "n", 0, 3);
  assert.ok(codes(s).includes("variant-max"));
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "add-boys-15", "n", 0, 4);
  s = setUpgrade(s, u, "add-stampfa-60-max2", "n", 0, 3);
  assert.deepEqual(codes(s), []);
});

test("mixed slot scales with size; switching size resets the choice", () => {
  let [s, [u]] = army("heizakult");
  s = setSize(s, u, "g");
  assert.deepEqual(entry(s).roster, { brennabuggy: 16 });
  s = setChoice(s, u, 0, { waaghbike: 10, buggy: 6 });
  assert.deepEqual(entry(s).roster, { waaghbike: 10, buggy: 6 });
  assert.deepEqual(codes(s), []);
  s = setSize(s, u, "r");
  assert.deepEqual(entry(s).roster, { brennabuggy: 24 });
});

test("Oddboy needs a fitting vehicle", () => {
  let [s, [u]] = army("heizakult");
  s = setUpgrade(s, u, "add-oddboy-50-max1-req-kampfpanza", "n");
  assert.ok(codes(s).includes("variant-requires"));
  s = setUpgrade(s, u, "add-kampfpanza-30", "n", 0, 1);
  assert.deepEqual(codes(s), []);
  assert.equal(entry(s).pts, 200 + 30 + 50);
});

test("size and counts survive export/import", () => {
  let [s, [u]] = army("goffs-mob");
  s = setSize(s, u, "g");
  s = setUpgrade(s, u, "add-boys-15", "n", 0, 4);
  const back = sanitize(JSON.parse(JSON.stringify(buildExport({ army: "x", armyVersion: "1", name: "t", state: s, total: 0 }))), data);
  assert.deepEqual(back.state, s);
});

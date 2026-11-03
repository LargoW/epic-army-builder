import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createState, addFormation, setUpgrade, summarize } from "../engine/engine.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

const data = JSON.parse(readFileSync(new URL("../data/ear-de/ig/steellegion.json", import.meta.url), "utf8"));
const army = "ear-de/ig/steellegion";

const firstFormations = () => data.formations.slice(0, 2).map((f) => f.id);

function make() {
  let s = createState();
  for (const id of firstFormations()) s = addFormation(s, id);
  const withUp = data.formations.find((f) => f.upgrades && f.upgrades.length);
  s = addFormation(s, withUp.id);
  const u = data.upgrades.find((x) => x.id === withUp.upgrades[0]);
  s = setUpgrade(s, s.formations[2].uid, u.id, u.variants[0].id, 0);
  return s;
}

test("export -> token -> parse -> sanitize round-trips the state", () => {
  const s = make();
  const exp = buildExport({ army, armyVersion: "1.0.2", name: "Ärger Liste", state: s });
  const back = sanitize(parseInput(toToken(exp)), data);
  assert.deepEqual(back.state, s);
  assert.equal(back.name, "Ärger Liste");
  assert.equal(back.dropped, 0);
});

test("parseInput accepts JSON, full links and bare tokens", () => {
  const exp = buildExport({ army, armyVersion: "1.0.2", name: "x", state: make() });
  const token = toToken(exp);
  assert.equal(parseInput(JSON.stringify(exp)).army, army);
  assert.equal(parseInput(`https://example.org/app/#l=${token}`).army, army);
  assert.equal(parseInput(token).army, army);
  assert.throws(() => parseInput("garbage!!"), /unreadable/);
});

test("sanitize drops unknown formations/upgrades and rejects foreign formats", () => {
  const exp = buildExport({ army, armyVersion: "1.0.2", name: "x", state: make() });
  exp.formations.push({ formation: "does-not-exist", choices: {}, upgrades: [] });
  exp.formations[0].upgrades.push({ upgrade: "nope", variant: "x" });
  const r = sanitize(exp, data);
  assert.equal(r.dropped, 2);
  assert.equal(r.state.formations.length, 3);
  assert.throws(() => sanitize({ format: "other" }, data), /format/);
  assert.throws(() => sanitize({ ...exp, version: 99 }, data), /version/);
});

test("exported total matches the engine", () => {
  const s = make();
  const { total, entries } = summarize({ ...data, units: data.units }, s);
  const exp = buildExport({ army, armyVersion: "1.0.2", name: "x", state: s, entries, total });
  assert.equal(exp.points, total);
  assert.equal(exp.formations[0].points, entries[0].pts);
});

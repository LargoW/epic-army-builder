import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createState, addFormation, setUpgrade, summarize, validate } from "../engine/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/ear-de/sm/codexastartes.json", import.meta.url), "utf8"));

function army(...ids) {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
}
const codes = (s) => validate(data, s).map((v) => v.code);
const roster = (s, i = 0) => summarize(data, s).entries[i].roster;

test("every Codex Astartes formation is valid at base", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    if (f.id === "scouts" || f.tags.includes("fleet")) continue; // need a main detachment, tested separately
    assert.deepEqual(codes(s), [], f.id);
  }
});

test("tactical squads get free Rhinos: 6 INF -> 3 Rhinos, price unchanged", () => {
  const [s] = army("tacticals");
  assert.equal(summarize(data, s).total, 275);
  assert.equal(roster(s).rhino, 3);
});

test("Razorbacks transport first, the rest rides in Rhinos", () => {
  let [s, [u]] = army("scouts");
  assert.deepEqual(roster(s), { scout: 4, rhino: 2 });
  s = setUpgrade(s, u, "razorbacks", "1");
  assert.deepEqual(roster(s), { scout: 4, razorback: 1, rhino: 2 });
  s = setUpgrade(s, u, "razorbacks", "2");
  assert.deepEqual(roster(s), { scout: 4, razorback: 2, rhino: 1 });
  assert.equal(summarize(data, s).total, 200);
  s = setUpgrade(s, u, "razorbacks", "4");
  assert.deepEqual(roster(s), { scout: 4, razorback: 4 });
  assert.deepEqual(codes(s).filter((c) => c !== "formation-limit"), []); // lone scouts break the scout limit only
  s = setUpgrade(s, u, "razorbacks", "5");
  assert.ok(codes(s).includes("vehicle-surplus"));
});

test("Land Raiders carry 2 INF each; upgrades adding INF are counted", () => {
  let [s, [u]] = army("devastators");
  s = setUpgrade(s, u, "land-raider-transport", "2");
  assert.deepEqual(roster(s), { devastator: 4, "land-raider": 2 });
  assert.equal(summarize(data, s).total, 350);
  s = setUpgrade(s, u, "land-raider-transport", "3");
  assert.ok(codes(s).includes("vehicle-surplus"));
});

test("Terminators have no free Rhinos but may buy Land Raiders", () => {
  let [s, [u]] = army("terminators");
  assert.deepEqual(roster(s), { terminator: 4 });
  s = setUpgrade(s, u, "land-raider-transport", "4");
  assert.equal(summarize(data, s).total, 550);
  assert.deepEqual(codes(s), []);
});

test("only one Supreme Commander per army", () => {
  let [s, [a, b]] = army("assault", "tacticals");
  s = setUpgrade(s, a, "commander", "supreme");
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, b, "commander", "supreme");
  assert.ok(codes(s).includes("variant-army-limit"));
});

test("scouts are limited to one per non-scout detachment", () => {
  let [s] = army("scouts");
  assert.ok(codes(s).includes("formation-limit"));
  [s] = army("tacticals", "scouts");
  assert.deepEqual(codes(s), []);
  [s] = army("tacticals", "scouts", "scouts");
  assert.ok(codes(s).includes("formation-limit"));
});

test("fleet share and orbital limits", () => {
  const [s] = army("tacticals", "reaver");
  assert.ok(codes(s).includes("share-limit"));
  const [t] = army("tacticals", "devastators", "orbital", "orbital");
  assert.ok(codes(t).includes("formation-limit"));
});

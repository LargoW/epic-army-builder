import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createState, addFormation, setUpgrade, summarize, validate, withProfiles, rosterProfiles } from "../engine/engine.js";

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

test("Scharfschützen: der Scout Trupp tauscht alle Scouts gegen Scout (Scharfschütze)", () => {
  let [s, [u]] = army("scouts");
  s = setUpgrade(s, u, "snipers", "1");
  assert.equal(summarize(data, s).total, 175);
  assert.deepEqual(roster(s), { "scout-sniper": 4, rhino: 2 }, "no plain Scouts are left, the transport is the same");
  for (const [razorbacks, rest] of [["1", { razorback: 1, rhino: 2 }], ["2", { razorback: 2, rhino: 1 }], ["4", { razorback: 4 }]]) {
    s = setUpgrade(s, u, "razorbacks", razorbacks);
    assert.deepEqual(roster(s), { "scout-sniper": 4, ...rest }, `${razorbacks} Razorback(s)`);
  }
  assert.deepEqual(codes(s).filter((c) => c !== "formation-limit"), []);
  s = setUpgrade(s, u, "razorbacks", "5");
  assert.ok(codes(s).includes("vehicle-surplus"), "the transport rules still apply to the Scout (Scharfschütze)");
});

test("Scout (Scharfschütze) has the Scout profile, but the Schwere Bolter carries the Scharfschütze rule", () => {
  const profiles = JSON.parse(readFileSync(new URL("../data/ear-de/sm/codexastartes.profiles.json", import.meta.url), "utf8"));
  const withP = withProfiles(data, profiles);
  const scout = profiles.units.scout;
  const sniper = profiles.units["scout-sniper"];
  assert.deepEqual({ ...sniper, name: scout.name, weapons: scout.weapons }, scout, "same type, speed, armour, close combat, firefight and rules");
  assert.deepEqual(scout.weapons[0].modes[0].specialRules, [], "plain Scouts have no Scharfschütze rule");
  assert.deepEqual(sniper.weapons.map((w) => [w.name, w.modes[0].firepower, w.modes[0].range]), [["Schwerer Bolter", "AP5+", 30]]);
  assert.deepEqual(sniper.weapons[0].modes[0].specialRules, [{ name: "S", description: "Scharfschütze" }]);
  let [s, [u]] = army("scouts");
  s = setUpgrade(s, u, "snipers", "1");
  const list = rosterProfiles(withP, summarize(withP, s).entries[0].roster);
  const row = list.find((r) => r.unit === "scout-sniper");
  assert.equal(row.count, 4);
  assert.equal(row.name, "Scout");
  assert.ok(row.profile, "the profile is shown in the builder and the overview");
  assert.equal(list.some((r) => r.unit === "scout"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createState, addFormation, setUpgrade, setChoice, summarize, validate } from "../engine/engine.js";
import { messageFor } from "../ui/messages.js";

const load = (p) => JSON.parse(readFileSync(new URL(`../data/ear-de/${p}.json`, import.meta.url), "utf8"));
const armies = { sacea: load("tau/sacea"), viorla: load("tau/viorla"), squats: load("sq/squats") };

const build = (data, ...ids) => {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
};
const codes = (data, s) => validate(data, s).map((v) => v.code);

test("every formation is valid on its own (except ships needing no parent)", () => {
  for (const [name, data] of Object.entries(armies))
    for (const f of data.formations) {
      const [s] = build(data, f.id);
      // ships/air are limited by share, support formations need a core formation
      // a formation with a minimum (Landzug: 2-4 Kampf-Wagen) starts below it until the player chooses
      const needsChoice = (f.unitLimits || []).some((l) => l.min) ? ["unit-group-min"] : [];
      const allowed = ["share-limit", ...(f.tags.includes("support") ? ["formation-limit"] : []), ...needsChoice];
      const c = codes(data, s).filter((x) => !allowed.includes(x));
      assert.deepEqual(c, [], `${name}/${f.id}`);
    }
});

test("all upgrade references and units resolve", () => {
  for (const [name, data] of Object.entries(armies)) {
    const ups = new Set(data.upgrades.map((u) => u.id));
    for (const f of data.formations) for (const u of f.upgrades) assert.ok(ups.has(u), `${name}/${f.id}/${u}`);
  }
});

test("Sa'cea: at most 3 upgrades per ground formation, Shas'o once per army", () => {
  const d = armies.sacea;
  let [s, [a]] = build(d, "fw-8");
  for (const u of ["colossus", "piranhas", "firewarriors"]) s = setUpgrade(s, a, u, u === "colossus" ? "3" : u === "piranhas" ? "2" : "4");
  assert.deepEqual(codes(d, s), []);
  s = setUpgrade(s, a, "drones", "1");
  assert.ok(codes(d, s).includes("upgrade-limit"));
  let [t, [x, y]] = build(d, "crisis-cadre", "crisis-cadre");
  t = setUpgrade(t, x, "shaso", "1");
  t = setUpgrade(t, y, "shaso", "1");
  assert.ok(codes(d, t).includes("variant-army-limit"));
});

test("Sa'cea: support limit is 3 per cadre", () => {
  const d = armies.sacea;
  const [s] = build(d, "crisis-cadre", "kroot", "kroot", "kroot", "kroot");
  assert.ok(codes(d, s).includes("formation-limit"));
});

test("Vior'la: heavy suit upgrade needs a matching heavy suit in the cadre", () => {
  const d = armies.viorla;
  let [s, [u]] = build(d, "heavy-cadre");
  s = setUpgrade(s, u, "heavy", "xv1041");
  assert.deepEqual(codes(d, s), []);
  s = setUpgrade(s, u, "heavy", "xv1072");
  assert.ok(codes(d, s).includes("variant-requires"));
});

test("Vior'la: the cadre's own suit choice decides which heavy suit type may be added", () => {
  const d = armies.viorla;
  let [s, [u]] = build(d, "heavy-cadre");
  s = setChoice(s, u, 1, { xv107: 3 }); // the cadre consists of three suits of one type
  s = setUpgrade(s, u, "heavy", "xv1072");
  assert.deepEqual(codes(d, s), [], "XV107 are already in the cadre");
  assert.equal(summarize(d, s).entries[0].roster.xv107, 5);
  s = setUpgrade(s, u, "heavy", "xv1091");
  assert.ok(codes(d, s).includes("variant-requires"), "no XV109 in the cadre");
});

test("Squats: transport vehicles are priced per vehicle", () => {
  const d = armies.squats;
  let [s, [u]] = build(d, "warriors");
  s = setUpgrade(s, u, "t-rhino", "n", 0, 5);
  const e = summarize(d, s).entries[0];
  assert.equal(e.pts, 250);
  assert.equal(e.roster.rhino, 5);
});

test("Squats: 0–1 Großlord per army and support limit", () => {
  const d = armies.squats;
  let [s, [a, b]] = build(d, "warriors", "warriors");
  s = setUpgrade(s, a, "lord", "grand");
  s = setUpgrade(s, b, "lord", "grand");
  assert.ok(codes(d, s).includes("variant-army-limit"));
  const [t] = build(d, "warriors", "bikers", "bikers", "bikers");
  assert.ok(codes(d, t).includes("formation-limit"));
});

test("Squat-Landzug: 2 to 4 Kampf-Wagen, and the chosen cars are listed", () => {
  const d = armies.squats;
  const roster = (s) => summarize(d, s).entries[0].roster;
  const pts = (s) => summarize(d, s).entries[0].pts;
  // a lone war engine also hits the army-wide share limit; that is not what this test is about
  const own = (s) => codes(d, s).filter((c) => c !== "share-limit");
  let [s, [u]] = build(d, "landtrain");
  assert.deepEqual(roster(s), { landtrain: 1 });
  assert.deepEqual(own(s), ["unit-group-min"], "a Landzug without any car");
  assert.equal(messageFor(validate(d, s).find((v) => v.code.startsWith("unit-group"))), "Kampf-Wagen: mindestens 2 nötig (gewählt: 0).");

  s = setUpgrade(s, u, "berserker-car", "n", 0, 1);
  assert.deepEqual(own(s), ["unit-group-min"], "one car is not enough");
  s = setUpgrade(s, u, "berserker-car", "n", 0, 2);
  assert.deepEqual(own(s), []);
  assert.equal(pts(s), 200 + 2 * 75);
  assert.deepEqual(roster(s), { landtrain: 1, "berserker-car": 2, berserker: 2 }, "each Berserker car brings a Squat-Berserker");

  s = setUpgrade(s, u, "bomb-car", "n", 0, 1);
  assert.deepEqual(own(s), [], "Landzug, 2 Berserker-Kampf-Wagen, 1 Bomben-Kampf-Wagen");
  assert.equal(pts(s), 200 + 150 + 125);
  assert.deepEqual(roster(s), { landtrain: 1, "berserker-car": 2, berserker: 2, "bomb-car": 1 });

  s = setUpgrade(s, u, "dragon-car", "n", 0, 1);
  assert.deepEqual(own(s), [], "four cars");
  assert.deepEqual(roster(s), { landtrain: 1, "berserker-car": 2, berserker: 2, "bomb-car": 1, "dragon-car": 1 });
  s = setUpgrade(s, u, "mortar-car", "n", 0, 1);
  assert.deepEqual(own(s), ["unit-group-max"], "five cars");
  assert.equal(messageFor(validate(d, s).find((v) => v.code.startsWith("unit-group"))), "Kampf-Wagen: höchstens 4 erlaubt (gewählt: 5).");

  [s, [u]] = build(d, "landtrain");
  s = setUpgrade(s, u, "dragon-car", "n", 0, 2);
  s = setUpgrade(s, u, "mortar-car", "n", 0, 2);
  assert.deepEqual(own(s), [], "any mix of four cars");
  assert.equal(pts(s), 200 + 4 * 75);
  [s, [u]] = build(d, "landtrain");
  s = setUpgrade(s, u, "bomb-car", "n", 0, 2);
  assert.ok(own(s).includes("variant-max"), "0-1 Bomben-Kampf-Wagen");
  [s, [u]] = build(d, "landtrain");
  s = setUpgrade(s, u, "dragon-car", "n", 0, 5);
  assert.ok(own(s).includes("variant-max"), "no more than four of one kind");
  s = setUpgrade(setUpgrade(setUpgrade(build(d, "landtrain")[0], 1, "dragon-car", "n", 0, 2), 1, "mortar-car", "n", 0, 2), 1, "ancestor", "1");
  assert.deepEqual(own(s), [], "the Lebende Ahne is not a car");
});

test("Squats: Krieger, Berserker and Donnerer are all Bruderschaften, each allows two support formations", () => {
  const d = armies.squats;
  const c = (...ids) => codes(d, build(d, ...ids)[0]);
  for (const brotherhood of ["warriors", "berserkers", "thunderers"]) {
    assert.deepEqual(c(brotherhood, "bikers", "gyros"), [], `${brotherhood}: two support formations`);
    assert.deepEqual(c(brotherhood, "bikers", "gyros", "kastellans"), ["formation-limit"], `${brotherhood}: three support formations`);
    assert.deepEqual(c(brotherhood), [], `${brotherhood} alone is valid`);
  }
  assert.deepEqual(c("warriors", "berserkers", "thunderers", "bikers", "gyros", "kastellans", "thunderfire", "guard-battery", "light-artillery"), [], "three Bruderschaften allow six support formations");
  assert.deepEqual(c("warriors", "berserkers", "thunderers", "bikers", "gyros", "kastellans", "thunderfire", "guard-battery", "light-artillery", "bikers"), ["formation-limit"], "a seventh");
  assert.deepEqual(c("thunderers", "thunderers", "bikers", "gyros", "kastellans", "thunderfire"), [], "every Donnerer formation counts as a Bruderschaft of its own");
  assert.deepEqual(c("bikers"), ["formation-limit"], "support without any Bruderschaft");
  for (const f of d.formations.filter((x) => ["warriors", "berserkers", "thunderers"].includes(x.id))) assert.ok(f.tags.includes("brotherhood"), f.id);
  assert.ok(!d.formations.find((x) => x.id === "thunderers").tags.includes("support"), "the Donnerer are no support formation any more");
  assert.deepEqual(d.sections.find((s) => s.id === "brotherhood").formations, ["warriors", "berserkers", "thunderers"]);
});

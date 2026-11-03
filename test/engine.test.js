import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createState, addFormation, setUpgrade, setChoice, summarize, validate, moveFormation, sortFormations,
} from "../engine/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/ear-de/ig/steellegion.json", import.meta.url), "utf8"));

// Build a state from formation ids; returns [state, uids]
function army(...ids) {
  let s = createState();
  const uids = ids.map((id) => {
    s = addFormation(s, id);
    return s.nextUid - 1;
  });
  return [s, uids];
}
const codes = (s) => validate(data, s).map((v) => v.code);

test("mechanised company: base points and roster", () => {
  const [s] = army("mech-company");
  const { total, entries } = summarize(data, s);
  assert.equal(total, 325);
  assert.deepEqual(entries[0].roster, { commander: 1, commissar: 1, infantry: 9, chimera: 5 });
  assert.deepEqual(codes(s), []);
});

test("every formation is valid in its base configuration", () => {
  for (const f of data.formations) {
    const [s] = army(f.id);
    const own = validate(data, s).filter((v) => !["formation-limit", "share-limit"].includes(v.code));
    assert.deepEqual(own, [], f.id);
  }
});

test("upgrade adds points and units", () => {
  let [s, [c]] = army("inf-company");
  s = setUpgrade(s, c, "hellhounds", "2");
  const e = summarize(data, s).entries[0];
  assert.equal(e.pts, 300);
  assert.equal(e.roster.hellhound, 2);
  assert.deepEqual(codes(s), []);
});

test("upgrade not on the formation's list is rejected", () => {
  let [s, [c]] = army("lr-company");
  s = setUpgrade(s, c, "ogryns", "1");
  assert.ok(codes(s).includes("upgrade-not-allowed"));
});

test("max three upgrades per company", () => {
  let [s, [c]] = army("inf-company");
  for (const u of [["flak", "1"], ["hellhounds", "1"], ["snipers", "1"]]) s = setUpgrade(s, c, ...u);
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, c, "leman-russ", "lr");
  assert.deepEqual(codes(s), ["upgrade-limit"]);
});

test("support formations: two per company", () => {
  let [s] = army("inf-company", "sentinels", "sentinels");
  assert.deepEqual(codes(s), []);
  [s] = army("inf-company", "sentinels", "sentinels", "sentinels");
  assert.deepEqual(codes(s), ["formation-limit"]);
  [s] = army("sentinels");
  assert.deepEqual(codes(s), ["formation-limit"]);
});

test("titans and navy: at most one third of total points", () => {
  let [s] = army("inf-company", "reaver");
  assert.deepEqual(codes(s), ["share-limit"]);
  [s] = army("inf-company", "inf-company", "inf-company", "inf-company", "warhounds");
  assert.deepEqual(codes(s), []);
  // exactly one third passes: 2 x 250 + 250 = 750 total, marauders 250
  [s] = army("inf-company", "inf-company", "marauders");
  assert.deepEqual(codes(s), []);
});

test("orbital support: only once per army", () => {
  const [s] = army("inf-company", "inf-company", "inf-company", "inf-company", "inf-company", "orbital", "orbital");
  assert.ok(codes(s).includes("formation-limit"));
});

test("replace: six Basilisks become Manticores", () => {
  let [s, [c]] = army("art-company");
  s = setUpgrade(s, c, "manticores-6", "6");
  const e = summarize(data, s).entries[0];
  assert.equal(e.pts, 450);
  assert.deepEqual(e.roster, { commissar: 1, manticore: 6 });
  assert.deepEqual(codes(s), []);
});

test("replace needs the units to exist (battery of Bombards)", () => {
  let [s, [a, b]] = army("inf-company", "art-battery");
  s = setChoice(s, b, 0, { bombard: 3 });
  s = setUpgrade(s, b, "manticores-3", "3");
  assert.ok(codes(s).includes("replace-insufficient"));
});

test("oneOf choices: single type unless mixed", () => {
  let [s, [c, b, p, h]] = army("inf-company", "art-battery", "lr-platoon", "sh-company");
  s = setChoice(s, b, 0, { basilisk: 2, bombard: 1 });
  assert.deepEqual(codes(s), ["choice-invalid"]);
  s = setChoice(s, b, 0, { bombard: 3 });
  s = setChoice(s, p, 0, { "leman-russ": 3, "leman-russ-punisher": 2, "leman-russ-demolisher": 1 });
  s = setChoice(s, h, 0, { baneblade: 2, shadowsword: 1 });
  assert.deepEqual(codes(s), []);
});

test("transport: upgrades in a mechanised company need matching Chimeras", () => {
  let [s, [c]] = army("mech-company");
  // 10 INF / 5 Chimeras; +1 Ogryn leaves one INF untransported
  s = setUpgrade(s, c, "ogryns", "1", 0);
  assert.deepEqual(codes(s), ["transport-incomplete"]);
  s = setUpgrade(s, c, "ogryns", "1", 1);
  assert.deepEqual(codes(s), []);
  assert.equal(summarize(data, s).entries[0].pts, 325 + 25 + 25);
  // at most ceil(added INF / 2) Chimeras per upgrade
  s = setUpgrade(s, c, "ogryns", "1", 2);
  assert.ok(codes(s).includes("transport-too-many"));
});

test("transport: 2 Fire Support Squads need one Chimera (cap is ceil(n/2))", () => {
  let [s, [c]] = army("mech-company");
  s = setUpgrade(s, c, "fire-support", "2", 1);
  assert.deepEqual(codes(s), []);
  assert.equal(summarize(data, s).entries[0].pts, 325 + 50 + 25);
});

test("transport: Chimeras only on upgrades that may add them", () => {
  let [s, [c]] = army("mech-company");
  s = setUpgrade(s, c, "hellhounds", "1", 1);
  assert.ok(codes(s).includes("transport-not-allowed"));
});

test("transport: infantry company has no Chimeras, so none are required", () => {
  let [s, [c]] = army("inf-company");
  s = setUpgrade(s, c, "ogryns", "2", 0);
  assert.deepEqual(codes(s), []);
  // Adding a single Chimera would oblige the formation to transport all 15 INF
  s = setUpgrade(s, c, "ogryns", "2", 1);
  assert.ok(codes(s).includes("transport-incomplete"));
});

test("transport: Rough Riders are never carried", () => {
  let [s, [c, r]] = army("mech-company", "rough-riders");
  assert.deepEqual(codes(s), []);
  assert.equal(summarize(data, s).entries[1].roster["chimera"], undefined);
  // an Ogryn upgrade on the company still only counts the company's own INF
  s = setUpgrade(s, c, "ogryns", "1", 1);
  assert.deepEqual(codes(s), []);
});

test("moveFormation swaps neighbours and stops at the ends", () => {
  const [s, [a, b, c]] = army("inf-company", "sentinels", "flak-battery");
  const ids = (st) => st.formations.map((e) => e.uid);
  assert.deepEqual(ids(moveFormation(s, b, -1)), [b, a, c]);
  assert.deepEqual(ids(moveFormation(s, b, 1)), [a, c, b]);
  assert.deepEqual(ids(moveFormation(s, a, -1)), [a, b, c]);
  assert.deepEqual(ids(moveFormation(s, c, 1)), [a, b, c]);
});

test("sortFormations: by section keeps list order inside a section; by points is descending", () => {
  const [s, [sen, reaver, co1, flak, co2]] = army("sentinels", "reaver", "inf-company", "flak-battery", "rhq");
  const ids = (st) => st.formations.map((e) => e.uid);
  assert.deepEqual(ids(sortFormations(data, s, "section")), [co1, co2, sen, flak, reaver]);
  assert.deepEqual(ids(sortFormations(data, s, "points")), [reaver, co2, co1, flak, sen]);
});

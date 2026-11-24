import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  createState,
  addFormation,
  setUpgrade,
  computeEntry,
} from "../engine/engine.js";

const root = fileURLToPath(new URL("../data/", import.meta.url));

test("Questor Traitoris: Höllenschmiede-Manipel and knight upgrades resolve correctly", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/dm/qt.json"), "utf8")
  );

  let state = createState();
  state = addFormation(state, "dm-hollenschmiede-manipel");
  const uid = state.formations[0].uid;

  // Base: 1 Höllenschmied, 11 Chaoszwerge (225 pts)
  let entry = state.formations[0];
  let computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225);
  assert.equal(computed.roster["dm-hollenschmied"], 1);
  assert.equal(computed.roster["dm-chaoszwerge"], 11);

  // Upgrade: replace 4 Chaos-Squats with 4 Phospexors (+25 pts)
  state = setUpgrade(state, uid, "qt-upgrade-phospexor", "1");
  // Upgrade: add 2 Krios Lightning (+125 pts)
  state = setUpgrade(state, uid, "qt-upgrade-krios-ordinatus", "1");
  // Upgrade: add Erz-Heretek (+100 pts)
  state = setUpgrade(state, uid, "dm-upgrade-erz-heretek", "1");
  // Upgrade: add Triaros (+75 pts)
  state = setUpgrade(state, uid, "dm-upgrade-transporter", "triaros");

  entry = state.formations[0];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225 + 25 + 125 + 100 + 75); // 550 pts
  assert.equal(computed.roster["dm-chaoszwerge"], 7); // 11 - 4
  assert.equal(computed.roster["dm-phospexor"], 4);
  assert.equal(computed.roster["dm-krios-blitzpanzer"], 2);
  assert.equal(computed.roster["dm-erz-heretek"], 1);
  assert.equal(computed.roster["dm-triaros"], 1);

  // Armiger formation with choice and extra armiger upgrade
  state = addFormation(state, "dm-armiger-des-ungeteilten-chaos");
  const armigerUid = state.formations[1].uid;
  state = setUpgrade(state, armigerUid, "qt-upgrade-extra-armiger", "1");

  entry = state.formations[1];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250 + 50); // 300 pts
  assert.equal(computed.roster["dm-doomglaive-ritter"], 5); // 4 base + 1 upgrade
});

test("Verräter-Titanenlegion: support formations, extra warhounds and upgrades", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/dm/ttl.json"), "utf8")
  );

  let state = createState();
  state = addFormation(state, "ttl-chaos-warhound");
  const uid = state.formations[0].uid;

  // Base Warhound (275 pts)
  let entry = state.formations[0];
  let computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275);
  assert.equal(computed.roster["ttl-chaos-warhound"], 1);

  // Upgrade: add 1 Seuchenhund (+200 pts)
  state = setUpgrade(state, uid, "ttl-upgrade-extra-warhound", "2");
  // Upgrade: Chaos-Herolde (+25 pts)
  state = setUpgrade(state, uid, "ttl-upgrade-chaos-herolde", "1");

  entry = state.formations[0];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275 + 200 + 25); // 500 pts
  assert.equal(computed.roster["ttl-chaos-warhound"], 1);
  assert.equal(computed.roster["ttl-seuchenhund"], 1);

  // Schlächterbestien formation exists and is valid
  state = addFormation(state, "ttl-schlaechterbestien-des-ungeteilten-chaos");
  entry = state.formations[1];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200);
  assert.equal(computed.roster["ttl-schlaechterbestie"], 4);
});

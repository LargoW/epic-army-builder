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

test("Kabal des Schwarzen Herzens: formations, upgrades and units resolve correctly", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/de/kabaloftheblackheart.json"), "utf8")
  );

  // Haemonculus-Kult contains Ältester Haemonculus
  const haemoDef = data.formations.find((f) => f.id === "de-haemonculus-kult");
  assert.ok(haemoDef);
  assert.deepEqual(haemoDef.units, [
    { unit: "de-althaemo", count: 1 },
    { unit: "de-haemonculus", count: 2 },
    { unit: "de-folterer", count: 4 },
  ]);

  // Test adding Kabal des Schwarzen Herzens formation with upgrades
  let state = createState();
  state = addFormation(state, "de-kabal-des-schwarzen-herzens");
  const uid = state.formations[0].uid;

  // Add Inkubi (+75 pts, +2 Inkubi)
  state = setUpgrade(state, uid, "de-upgrade-inkubi", "1");
  // Add 2 Schattenjäger (+100 pts, +2 Schattenjäger)
  state = setUpgrade(state, uid, "de-upgrade-schattenjaeger", "2");
  // Add Transporter (2 Schattenbarken)
  state = setUpgrade(state, uid, "de-upgrade-transporter", "barke-2");

  const entry = state.formations[0];
  const computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225 + 75 + 100 + 0); // 400 pts
  assert.equal(computed.roster["de-archon"], 1);
  assert.equal(computed.roster["de-inkubi"], 5); // 3 base + 2 upgrade
  assert.equal(computed.roster["de-schattenjaeger"], 2);
  assert.equal(computed.roster["de-schattenbarke"], 2);
});

test("Kabal der Wraithkind (Masque of the Midnight Sorrow): Starweaver replacement and Harlekin upgrades", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/de/masqueofthemidnightsorrow.json"), "utf8")
  );

  let state = createState();
  state = addFormation(state, "de-harlekin-maske");
  const uid = state.formations[0].uid;

  // Base Harlekin-Maske: 275 pts, 1 Schattenseher, 3 Harlekin-Trupps, 1 Todesnarren, 4 Starweaver
  let entry = state.formations[0];
  let computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275);
  assert.equal(computed.roster["de-schattenseher"], 1);
  assert.equal(computed.roster["de-harlekin-trupp"], 3);
  assert.equal(computed.roster["de-todesnarren"], 1);
  assert.equal(computed.roster["de-starweaver"], 4);

  // Upgrade: replace 4 Starweaver with 2 Harlekin-Trupps and 1 Todesnarren (kostenlos)
  state = setUpgrade(state, uid, "de-upgrade-harlekin-infanterie", "1");
  // Upgrade: add Solitär (+50 pts)
  state = setUpgrade(state, uid, "de-upgrade-add-solitaer", "1");
  // Upgrade: add 3 Skyweavers (+75 pts)
  state = setUpgrade(state, uid, "de-upgrade-add-skyweaver", "3");

  entry = state.formations[0];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275 + 0 + 50 + 75); // 400 pts
  assert.ok(!computed.roster["de-starweaver"]); // Replaced completely
  assert.equal(computed.roster["de-harlekin-trupp"], 5); // 3 + 2
  assert.equal(computed.roster["de-todesnarren"], 2); // 1 + 1
  assert.equal(computed.roster["de-solitaer"], 1);
  assert.equal(computed.roster["de-skyweaver-jetbikes"], 3);
});

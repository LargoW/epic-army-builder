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

test("Exoditen: Ritter-Kriegsschar, Korsaren-Verbände und Upgrades", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/eldar/exodites.json"), "utf8")
  );

  let state = createState();
  state = addFormation(state, "exo-ritter");
  const uid = state.formations[0].uid;

  // Base: 2 knights (275 pts)
  let entry = state.formations[0];
  let computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275);
  assert.equal(computed.roster["exo-feuersturmritter"], 2);

  // Upgrade: add 1 Glanzross-Ritter (+100 pts)
  state = setUpgrade(state, uid, "exo-upgrade-extra-ritter", "2");
  // Upgrade: add Weltenliedsänger (+50 pts)
  state = setUpgrade(state, uid, "exo-upgrade-weltenliedner-ritter", "1");

  entry = state.formations[0];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275 + 100 + 50); // 425 pts
  assert.equal(computed.roster["exo-feuersturmritter"], 2);
  assert.equal(computed.roster["exo-glanzrossritter"], 1);
  assert.equal(computed.roster["exo-weltenliedner"], 1);

  // Check Korsaren-Formationen exist and are valid
  state = addFormation(state, "exo-korsaren-vampire");
  state = addFormation(state, "exo-korsaren-nachtschwingen");
  state = addFormation(state, "exo-korsaren-feuerunterstuetzung");

  const vampireComputed = computeEntry(data, state.formations[1]);
  assert.deepEqual(vampireComputed.problems, []);
  assert.equal(vampireComputed.pts, 200);
  assert.equal(vampireComputed.roster["exo-korsarenvampire"], 1);

  const nachtComputed = computeEntry(data, state.formations[2]);
  assert.deepEqual(nachtComputed.problems, []);
  assert.equal(nachtComputed.pts, 225);
  assert.equal(nachtComputed.roster["exo-korsarnachtschwinge"], 2);

  const feuerComputed = computeEntry(data, state.formations[3]);
  assert.deepEqual(feuerComputed.problems, []);
  assert.equal(feuerComputed.pts, 150);
  assert.equal(feuerComputed.roster["exo-korsarenwespe"], 4);
});

test("Iyanden: Kriegsmaschinen von Vaul und Wellenschlangen-Upgrade", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/eldar/iyanden.json"), "utf8")
  );

  let state = createState();
  state = addFormation(state, "iy-kriegsmaschinen-vaul");
  const uid = state.formations[0].uid;

  // Base: 1 Kobra (250 pts)
  let entry = state.formations[0];
  let computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250);
  assert.equal(computed.roster["iy-kobra"], 1);

  // Upgrade: add 2 Skorpion (+400 pts)
  state = setUpgrade(state, uid, "iy-upgrade-kriegsmaschinen-vaul", "skorpion-2");

  entry = state.formations[0];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250 + 400); // 650 pts
  assert.equal(computed.roster["iy-kobra"], 1);
  assert.equal(computed.roster["iy-skorpion"], 2);

  // Wellenschlangen upgrade on Phantomwachen
  state = addFormation(state, "iy-phantomwachen");
  const pwUid = state.formations[1].uid;
  state = setUpgrade(state, pwUid, "iy-upgrade-wellenschlange", "1");

  entry = state.formations[1];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250 + 150); // 400 pts
  assert.equal(computed.roster["iy-wellenschlange"], 4);
});

test("Saim-Hann: Wildreiter-Truppe und Replacements", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/eldar/saimhann.json"), "utf8")
  );

  let state = createState();
  state = addFormation(state, "sah-wildreiter-truppe");
  const uid = state.formations[0].uid;

  // Base: 6 Wilde Reiter (200 pts)
  let entry = state.formations[0];
  let computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200);
  assert.equal(computed.roster["sah-wilde-reiter"], 6);

  // Upgrade: replace 3 Wilde Reiter with 3 Vipers (0 pts)
  state = setUpgrade(state, uid, "sah-upgrade-viper-schleierlaeufer", "1");
  // Upgrade: add 2 Hornets (+100 pts)
  state = setUpgrade(state, uid, "sah-upgrade-hornets", "1");

  entry = state.formations[0];
  computed = computeEntry(data, entry);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200 + 0 + 100); // 300 pts
  assert.equal(computed.roster["sah-wilde-reiter"], 3); // 6 - 3
  assert.equal(computed.roster["sah-viper"], 3);
  assert.equal(computed.roster["sah-hornets"], 2);
});

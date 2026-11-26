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

test("Schwarmflotte Dagon: Tyrannenschwarm, Symbionten und Hierodule", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/nid/dagon.json"), "utf8")
  );

  // 1. Tyrannenschwarm with Dagon-Oberherrscher and Carnifex
  let state = createState();
  state = addFormation(state, "dag-tyrannenschwarm");
  const tyrantUid = state.formations[0].uid;

  // Base: 1 Schwarmtyrant (125 pts)
  let computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 125);
  assert.equal(computed.roster["dag-schwarmtyrant"], 1);

  // Upgrade: replace Schwarmtyrant with Dagon-Oberherrscher (+75 pts)
  state = setUpgrade(state, tyrantUid, "dag-upgrade-dagon-oberherrscher", "oberherrscher");
  // Upgrade: add 2 Stachel-Carnifex (+75 pts)
  state = setUpgrade(state, tyrantUid, "dag-upgrade-carnifex", "barbed");

  computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 125 + 75 + 75); // 275 pts
  assert.ok(!computed.roster["dag-schwarmtyrant"]);
  assert.equal(computed.roster["dag-dagon-oberherrscher"], 1);
  assert.equal(computed.roster["dag-stachel-carnifex"], 2);

  // 2. Symbiontenschwarm with Symbiarch and upgrade
  state = addFormation(state, "dag-symbiontenschwarm");
  const symbUid = state.formations[1].uid;

  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175);
  assert.equal(computed.roster["dag-symbiarch"], 1);
  assert.equal(computed.roster["dag-symbionten"], 6);

  // Upgrade: add 3 Symbionten (+75 pts)
  state = setUpgrade(state, symbUid, "dag-upgrade-symbionten", "3");
  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175 + 75); // 250 pts
  assert.equal(computed.roster["dag-symbiarch"], 1);
  assert.equal(computed.roster["dag-symbionten"], 9); // 6 + 3

  // 3. Brecherschwarm with Hierodule Prime (oneOf)
  state = addFormation(state, "dag-brecherschwarm");
  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 125);
  assert.equal(computed.roster["dag-stachel-hierodule-alpha"], 1);
});

test("Schwarmflotte Hydra: Schwarmherrscher, Tervigon und Dimachaeron", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/nid/hydra.json"), "utf8")
  );

  // 1. Tyrannenschwarm with Schwarmherrscher
  let state = createState();
  state = addFormation(state, "hyd-tyrannenschwarm");
  const tyrantUid = state.formations[0].uid;

  state = setUpgrade(state, tyrantUid, "hyd-upgrade-schwarmherrscher", "schwarmherrscher");
  let computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 125 + 75); // 200 pts
  assert.ok(!computed.roster["hyd-schwarmtyrant"]);
  assert.equal(computed.roster["hyd-schwarmherrscher"], 1);

  // 2. Tervigon-Brutschwarm with extra Tervigon upgrade
  state = addFormation(state, "hyd-tervigon-brutschwarm");
  const tervUid = state.formations[1].uid;

  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 150);
  assert.equal(computed.roster["hyd-tervigon"], 1);
  assert.equal(computed.roster["hyd-termaganten"], 2);

  state = setUpgrade(state, tervUid, "hyd-upgrade-extra-tervigon", "termaganten");
  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 150 + 100); // 250 pts
  assert.equal(computed.roster["hyd-tervigon"], 2); // 1 + 1
  assert.equal(computed.roster["hyd-termaganten"], 4); // 2 + 2

  // 3. Infiltratorenschwarm with Dimachaeron replacement
  state = addFormation(state, "hyd-infiltratorenschwarm");
  const infilUid = state.formations[2].uid;

  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225);
  assert.equal(computed.roster["hyd-liktor"], 4);

  state = setUpgrade(state, infilUid, "hyd-upgrade-dimachaeron", "1");
  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225);
  assert.ok(!computed.roster["hyd-liktor"]);
  assert.equal(computed.roster["hyd-dimachaeron"], 4);
});

test("Genestealer Cults: Akolythenkult und Sternengeborene", () => {
  const gscData = JSON.parse(
    readFileSync(join(root, "ear-de/nid/gscult.json"), "utf8")
  );

  // 1. Akolythenkult with Sturm-Bagger and Landtransporter
  let state = createState();
  state = addFormation(state, "cos-akolythenkult");
  const akolUid = state.formations[0].uid;

  // Base: 1 Metamorph, 1 Ikonwart, 7 Akolythen (175 pts)
  let computed = computeEntry(gscData, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175);

  state = setUpgrade(state, akolUid, "cos-upgrade-schwere-bergbaumaschinen", "sturm-bagger");
  state = setUpgrade(state, akolUid, "cos-upgrade-kulttransporter-akolythen", "landtransporter-4");

  computed = computeEntry(gscData, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175 + 125 + 40); // 340 pts
  assert.equal(computed.roster["cos-sturm-bagger"], 1);
  assert.equal(computed.roster["cos-kultisten-landtransporter"], 4);

  // 2. Starspawn: Superschwerer Panzerzug with Shadowsword replacement
  const starData = JSON.parse(
    readFileSync(join(root, "ear-de/nid/cultofthestarspawn.json"), "utf8")
  );

  state = createState();
  state = addFormation(state, "cos-kultisten-superschwerer-panzerzug");
  const superUid = state.formations[0].uid;

  computed = computeEntry(starData, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200);
  assert.equal(computed.roster["cos-konclavenlocus"], 1);
  assert.equal(computed.roster["cos-kultistenbaneblade"], 1);

  state = setUpgrade(state, superUid, "cos-upgrade-shadowsword", "1");
  computed = computeEntry(starData, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200 + 25); // 225 pts
  assert.ok(!computed.roster["cos-kultistenbaneblade"]);
  assert.equal(computed.roster["cos-kultistenshadowsword"], 1);
});

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

test("Adepta Sororitas: Mission, Retribution, Redemption und Upgrades", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/iq/adeptasororitas.json"), "utf8")
  );

  // 1. Mission with Exorzist-Prioris and Prinzipalin
  let state = createState();
  state = addFormation(state, "aq-mission");
  const missionUid = state.formations[0].uid;

  // Base: 1 Palatine, 8 Sororitas-Schwestern (250 pts)
  let computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250);
  assert.equal(computed.roster["aq-paladine"], 1);
  assert.equal(computed.roster["aq-sororitas-schwestern"], 8);

  // Upgrade: replace 2 Schwestern with 2 Exorzist-Prioris (+50 pts)
  state = setUpgrade(state, missionUid, "aq-upgrade-exorzist-prioris", "1");
  // Upgrade: replace Palatine with Prinzipalin (+50 pts)
  state = setUpgrade(state, missionUid, "aq-upgrade-orco-hereticus", "prinzipalin");

  computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250 + 50 + 50); // 350 pts
  assert.ok(!computed.roster["aq-paladine"]);
  assert.equal(computed.roster["aq-prinzipalin"], 1);
  assert.equal(computed.roster["aq-sororitas-schwestern"], 6); // 8 - 2
  assert.equal(computed.roster["aq-prioris"], 2);

  // 2. Retribution with Palatine and Repressor replacement
  state = addFormation(state, "aq-retribution");
  const retUid = state.formations[1].uid;

  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225);
  assert.equal(computed.roster["aq-paladine"], 1);
  assert.equal(computed.roster["aq-retributor-schwestern"], 4);
  assert.equal(computed.roster["aq-sororitas-rhino"], 2);

  // Upgrade: replace 2 Rhinos with 2 Repressors (+20 pts)
  state = setUpgrade(state, retUid, "aq-upgrade-repressor", "1");
  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225 + 20); // 245 pts
  assert.ok(!computed.roster["aq-sororitas-rhino"]);
  assert.equal(computed.roster["aq-sororitas-repressor"], 2);

  // 3. Redemption with Arco-Flagellanten upgrade
  state = addFormation(state, "aq-redemption");
  const redUid = state.formations[2].uid;

  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175);
  assert.equal(computed.roster["aq-ministorumspriester"], 1);
  assert.equal(computed.roster["aq-redemptionisten"], 8);
  assert.equal(computed.roster["aq-orco-landtransporter"], 4);

  // Upgrade: replace 4 Landtransporter & 4 Redemptionisten with 6 Arco-Flagellanten (+50 pts)
  state = setUpgrade(state, redUid, "aq-upgrade-redemption-laeuterer", "arco");
  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175 + 50); // 225 pts
  assert.ok(!computed.roster["aq-orco-landtransporter"]);
  assert.equal(computed.roster["aq-redemptionisten"], 4); // 8 - 4
  assert.equal(computed.roster["aq-arco-flagellanten"], 6);
  assert.equal(computed.roster["aq-ministorumspriester"], 1);

  // 4. Inquisitor Gefolge with Großinquisitor and Höllenhunde
  state = addFormation(state, "aq-orco-inquisitor-gefolge");
  const gefUid = state.formations[3].uid;

  // Upgrade: Inquisitor -> Großinquisitor (+75 pts)
  state = setUpgrade(state, gefUid, "aq-upgrade-orco-hereticus", "grossinquisitor");
  // Upgrade: 2 Höllenhunde (+50 pts)
  state = setUpgrade(state, gefUid, "aq-upgrade-hoellenhund", "2");

  computed = computeEntry(data, state.formations[3]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 250 + 75 + 50); // 375 pts
  assert.ok(!computed.roster["aq-orco-inquisitor"]);
  assert.equal(computed.roster["aq-orco-grossinquisitor"], 1);
  assert.equal(computed.roster["aq-hoellenhund"], 2);
});

test("Deathwatch: Kill-Team, Task Force, Leman Russ and Upgrades", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/iq/deathwatch.json"), "utf8")
  );

  // 1. Kill-Team with Schwarze Schilde, Watch-Befehlshaber and Land Raider
  let state = createState();
  state = addFormation(state, "dw-deathwatch-kill-team");
  const ktUid = state.formations[0].uid;

  // Base: 1 Sergeant, 3 Taktische Trupps (150 pts)
  let computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 150);
  assert.equal(computed.roster["dw-sergeant"], 1);
  assert.equal(computed.roster["dw-taktische-trupps"], 3);

  // Upgrade: Schwarze Schilde (+25 pts)
  state = setUpgrade(state, ktUid, "dw-upgrade-kill-team-trupps", "schwarze-schilde");
  // Upgrade: Watch-Befehlshaber (+100 pts)
  state = setUpgrade(state, ktUid, "dw-upgrade-oberbefehlshaber", "watch-befehlshaber");
  // Upgrade: Land Raider (+50 pts)
  state = setUpgrade(state, ktUid, "dw-upgrade-support", "land-raider");

  computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 150 + 25 + 100 + 50); // 325 pts
  assert.ok(!computed.roster["dw-sergeant"]);
  assert.ok(!computed.roster["dw-taktische-trupps"]);
  assert.equal(computed.roster["dw-befehlshaber"], 1);
  assert.equal(computed.roster["dw-schwarze-schilde"], 3);
  assert.equal(computed.roster["dw-land-raider"], 1);

  // 2. Task Force with Inquisitor-Lord and Thunderers
  state = addFormation(state, "dw-oraxenos-task-force");
  const tfUid = state.formations[1].uid;

  // Upgrade: Inquisitor-Lord (+50 pts)
  state = setUpgrade(state, tfUid, "dw-upgrade-oberbefehlshaber", "inquisitor-lord");
  // Upgrade: 3 Thunderers (+150 pts)
  state = setUpgrade(state, tfUid, "dw-upgrade-thunderer", "1");

  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 300 + 50 + 150); // 500 pts
  assert.ok(!computed.roster["dw-oraxenos-inquisitor"]);
  assert.equal(computed.roster["dw-oraxenos-grossinquisitor"], 1);
  assert.equal(computed.roster["dw-oraxenos-arbitrator"], 9);
  assert.equal(computed.roster["dw-oraxenos-arbites"], 5);
  assert.equal(computed.roster["dw-lord-russ-thunderer"], 3);

  // 3. Leman Russ Staffel (oneOf)
  state = addFormation(state, "dw-leman-russ-staffel");
  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275);
  assert.equal(computed.roster["dw-lord-russ"], 4);
});

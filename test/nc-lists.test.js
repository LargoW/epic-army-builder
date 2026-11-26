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

test("Maynarkh-Dynastie: Phalanx, Portal-Phalanx, Megalith und Upgrades", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/nc/maynarkhdynasty.json"), "utf8")
  );

  // 1. Necron-Phalanx with Extinktoren and Hochlord
  let state = createState();
  state = addFormation(state, "nm-necron-phalanx");
  const phalanxUid = state.formations[0].uid;

  // Base: 8 Krieger, 1 Lord (300 pts)
  let computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 300);
  assert.equal(computed.roster["nm-necronkrieger"], 8);
  assert.equal(computed.roster["nm-necronlord"], 1);

  // Upgrade: replace 3 Krieger with 3 Extinktoren (+50 pts)
  state = setUpgrade(state, phalanxUid, "nm-upgrade-pariah", "extinktoren");
  // Upgrade: replace Lord with Hochlord (+75 pts)
  state = setUpgrade(state, phalanxUid, "nm-upgrade-hochlord", "hochlord");

  computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 300 + 50 + 75); // 425 pts
  assert.ok(!computed.roster["nm-necronlord"]);
  assert.equal(computed.roster["nm-necron-hochlord"], 1);
  assert.equal(computed.roster["nm-necronkrieger"], 5); // 8 - 3
  assert.equal(computed.roster["nm-extinktoren"], 3);

  // 2. Portal-Phalanx with Monolith replacement
  state = addFormation(state, "nm-portal-phalanx");
  const portalUid = state.formations[1].uid;

  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175);
  assert.equal(computed.roster["nm-monolith"], 1);
  assert.equal(computed.roster["nm-obelisk"], 2);

  // Upgrade: replace 2 Obelisks with 2 Monoliths (+50 pts)
  state = setUpgrade(state, portalUid, "nm-upgrade-portal-monolith", "2");
  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 175 + 50); // 225 pts
  assert.ok(!computed.roster["nm-obelisk"]);
  assert.equal(computed.roster["nm-monolith"], 3); // 1 base + 2 upgrade

  // 3. Canoptek-Schwarm with Phantome upgrade
  state = addFormation(state, "nm-canoptek-schwarm");
  const schwarmUid = state.formations[2].uid;

  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200);
  assert.equal(computed.roster["nm-canoptek-gruftspinne"], 1);
  assert.equal(computed.roster["nm-canoptek-skarabae"], 6);

  // Upgrade: add 2 Phantome (+50 pts)
  state = setUpgrade(state, schwarmUid, "nm-upgrade-canoptek-phantome", "2");
  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200 + 50); // 250 pts
  assert.equal(computed.roster["nm-canoptek-phantome"], 2);

  // 4. Megalith Conduit with Escort upgrade
  state = addFormation(state, "nm-megalith-conduit");
  const megaUid = state.formations[3].uid;

  computed = computeEntry(data, state.formations[3]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 350);
  assert.equal(computed.roster["nm-megalith"], 1);

  // Upgrade: add 1 Obelisk and 1 Monolith (+125 pts)
  state = setUpgrade(state, megaUid, "nm-upgrade-megalith-escort", "1-obelisk-1-monolith");
  computed = computeEntry(data, state.formations[3]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 350 + 125); // 475 pts
  assert.equal(computed.roster["nm-megalith"], 1);
  assert.equal(computed.roster["nm-obelisk"], 1);
  assert.equal(computed.roster["nm-monolith"], 1);

  // 5. Zerstörer-Phalanx mixed slot and Erntemaschine oneOf
  state = addFormation(state, "nm-zerstoerer-phalanx");
  computed = computeEntry(data, state.formations[4]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 275);
  assert.equal(computed.roster["nm-destruktoren"], 7);

  state = addFormation(state, "nm-erntemaschine");
  computed = computeEntry(data, state.formations[5]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 450);
  assert.equal(computed.roster["nm-aeonensphaere"], 1);
});

test("Sautekh-Dynastie: Iudicium, Eques und Stalker-Manipel", () => {
  const data = JSON.parse(
    readFileSync(join(root, "ear-de/nc/sautekhdynasty.json"), "utf8")
  );

  // 1. Iudicium-Manipel with Command Barge and Lord
  let state = createState();
  state = addFormation(state, "nst-iudicium-manipel");
  const iudUid = state.formations[0].uid;

  // Base: 5 Dominator-Barkes (225 pts)
  let computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225);
  assert.equal(computed.roster["nst-dominator-barke"], 5);

  // Upgrade: add Command Barge and Lord (+50 pts)
  state = setUpgrade(state, iudUid, "nst-upgrade-iudicium", "1");
  computed = computeEntry(data, state.formations[0]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 225 + 50); // 275 pts
  assert.equal(computed.roster["nst-dominator-barke"], 5);
  assert.equal(computed.roster["nst-katakomben-kommandogleiter"], 1);
  assert.equal(computed.roster["nst-necronlord"], 1);

  // 2. Stalker-Manipel with 2 Seraptek Heavy Constructs
  state = addFormation(state, "nst-stalker-manipel");
  const stalkerUid = state.formations[1].uid;

  // Base: 4 Triarch-Stalker (200 pts)
  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200);
  assert.equal(computed.roster["nst-triarch-stalker"], 4);

  // Upgrade: add 2 Seraptek Heavy Constructs (+250 pts)
  state = setUpgrade(state, stalkerUid, "nst-upgrade-stalker", "2");
  computed = computeEntry(data, state.formations[1]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 200 + 250); // 450 pts
  assert.equal(computed.roster["nst-triarch-stalker"], 4);
  assert.equal(computed.roster["nst-seraptek-schweres-konstrukt"], 2);

  // 3. Eques-Manipel mixed slot
  state = addFormation(state, "nst-eques-manipel");
  computed = computeEntry(data, state.formations[2]);
  assert.deepEqual(computed.problems, []);
  assert.equal(computed.pts, 300);
  assert.equal(computed.roster["nst-destruktoren"], 6);
});

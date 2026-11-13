import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, addFormation, setUpgrade, setSize, summarize, validate } from "../engine/engine.js";
import { messageFor } from "../ui/messages.de.js";

// formation.unitLimits: limits on the total of several unit types, with synthetic data.
const data = {
  units: { a: { name: "A" }, b: { name: "B" }, c: { name: "C" } },
  sections: [{ id: "s", name: "S", formations: ["f"] }],
  formations: [{
    id: "f", name: "F", pts: 100, tags: [],
    units: [{ unit: "a", count: 1 }],
    sizes: [{ id: "n", label: "Normal", pts: 100, mult: 1 }, { id: "big", label: "Big", pts: 180, mult: 2 }],
    unitLimits: [
      { id: "bc", label: "B und C", units: ["b", "c"], min: 1, max: 3, scale: true },
      { id: "c-fixed", label: "C", units: ["c"], max: 1 },
    ],
    upgrades: ["ub", "uc"],
  }],
  upgrades: [
    { id: "ub", name: "B", variants: [{ id: "n", label: "B", pts: 10, perUnit: true, effects: [{ op: "add", unit: "b", count: 1 }] }] },
    { id: "uc", name: "C", variants: [{ id: "n", label: "C", pts: 10, perUnit: true, effects: [{ op: "add", unit: "c", count: 1 }] }] },
  ],
};
const start = () => { const s = addFormation(createState(), "f"); return [s, 1]; };
const codes = (s) => validate(data, s).map((v) => `${v.code}:${v.params.id}`);

test("unit limits: minimum and maximum of the summed unit types", () => {
  let [s, u] = start();
  assert.deepEqual(codes(s), ["unit-group-min:bc"], "nothing chosen yet");
  s = setUpgrade(s, u, "ub", "n", 0, 3);
  assert.deepEqual(codes(s), []);
  s = setUpgrade(s, u, "uc", "n", 0, 1);
  assert.deepEqual(codes(s), ["unit-group-max:bc"], "3 B + 1 C is four units");
  s = setUpgrade(s, u, "ub", "n", 0, 1);
  s = setUpgrade(s, u, "uc", "n", 0, 2);
  assert.deepEqual(codes(s), ["unit-group-max:c-fixed"], "three units in total, but two C");
});

test("unit limits: scale multiplies minimum and maximum by the size factor", () => {
  let [s, u] = start();
  s = setSize(s, u, "big");
  s = setUpgrade(s, u, "ub", "n", 0, 1);
  assert.deepEqual(codes(s), ["unit-group-min:bc"], "Big needs 2");
  s = setUpgrade(s, u, "ub", "n", 0, 6);
  assert.deepEqual(codes(s), [], "Big allows 6");
  s = setUpgrade(s, u, "ub", "n", 0, 7);
  assert.deepEqual(codes(s), ["unit-group-max:bc"], "Big allows only 6");
  s = setUpgrade(s, u, "ub", "n", 0, 1);
  s = setUpgrade(s, u, "uc", "n", 0, 2);
  assert.deepEqual(codes(s), ["unit-group-max:c-fixed"], "a limit without scale stays absolute");
});

test("unit limits: the roster is unaffected and messages name the group", () => {
  let [s, u] = start();
  s = setUpgrade(s, u, "ub", "n", 0, 2);
  assert.deepEqual(summarize(data, s).entries[0].roster, { a: 1, b: 2 });
  s = setUpgrade(s, u, "ub", "n", 0, 4);
  assert.equal(messageFor(validate(data, s)[0]), "B und C: höchstens 3 erlaubt (gewählt: 4).");
});

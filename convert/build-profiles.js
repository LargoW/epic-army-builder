// Builds a self-contained profile bundle for one canonical army: unit stats, weapons (with modes)
// and special-rule texts, so the app needs no cross-file lookups at runtime.
//
// Usage: node convert/build-profiles.js <army.json> --src <dir containing lists_de> [--out <file>]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));

// Source files are either an array of groups ({ unit: [...] }) or a single group.
const unitsOf = (json) => (Array.isArray(json) ? json : [json]).flatMap((g) => g.unit || []);

export function buildProfiles(army, srcDir) {
  const warnings = [];
  const weaponFile = readJson(join(srcDir, "weapons.json"));
  const ruleFile = readJson(join(srcDir, "specialRules.json"));
  const weapons = new Map(weaponFile.weapons.map((w) => [w.name, w]));
  const weaponRules = new Map(weaponFile.rules.map((r) => [r.name, r]));
  const rules = new Map(ruleFile.rules.map((r) => [r.title, r]));
  const files = {};
  const source = (name) => (files[name] ||= new Map(unitsOf(readJson(join(srcDir, name))).map((u) => [u.name, u])));

  const ruleText = (name) => {
    const r = rules.get(name);
    return { name, description: r ? r.description : null };
  };
  const weaponProfile = (entry) => {
    // Inline weapon objects are used as they are; strings are "Name|count|extraRule".
    if (typeof entry !== "string") return entry;
    const [name, count, extra] = entry.split("|");
    const w = weapons.get(name);
    if (!w) {
      warnings.push(`weapon not found: ${name}`);
      return { name, modes: [] };
    }
    const resolve = (n) => {
      const r = weaponRules.get(n);
      if (!r) warnings.push(`weapon rule not found: ${n} (${name})`);
      return { name: n, description: r ? r.description : null };
    };
    const modes = w.modes.map((m) => ({
      ...m,
      specialRules: [...(m.specialRules || []), ...(extra ? [extra] : [])].map(resolve),
    }));
    return { name, ...(count ? { count: /^\d+$/.test(count) ? Number(count) : count } : {}), modes };
  };

  const units = {};
  for (const [id, u] of Object.entries(army.units)) {
    const src = source(u.from).get(u.name);
    if (!src) {
      warnings.push(`unit not found: ${u.name} in ${u.from} (${id})`);
      continue;
    }
    const { weapons: ws = [], specialRules: sr = [], ...stats } = src;
    units[id] = {
      ...stats,
      weapons: ws.map(weaponProfile),
      specialRules: sr.map(ruleText),
    };
  }

  // Army-level rules come from the original list file the canonical data was derived from.
  let armyRules = [];
  const listPath = army.source && army.source.file && join(srcDir, army.source.file.replace(/^lists_de[\\/]/, ""));
  try {
    armyRules = (readJson(listPath).specialRules || []).map(ruleText);
  } catch {
    warnings.push(`army list not readable: ${army.source && army.source.file}`);
  }
  return { bundle: { army: army.id, source: army.source, specialRules: armyRules, units }, warnings };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("build-profiles.js")) {
  const args = process.argv.slice(2);
  const opt = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const armyPath = args.find((a) => !a.startsWith("--") && a !== opt("--src") && a !== opt("--out"));
  const srcDir = opt("--src");
  if (!armyPath || !srcDir) {
    console.error("usage: node convert/build-profiles.js <army.json> --src <lists_de dir> [--out <file>]");
    process.exit(2);
  }
  const army = readJson(armyPath);
  const { bundle, warnings } = buildProfiles(army, srcDir);
  const out = opt("--out") || join(dirname(armyPath), basename(armyPath, ".json") + ".profiles.json");
  writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
  warnings.forEach((w) => console.warn("warn:", w));
  console.log(`wrote ${out} (${Object.keys(bundle.units).length} units, ${warnings.length} warnings)`);
  process.exit(warnings.some((w) => w.startsWith("unit not found")) ? 1 : 0);
}

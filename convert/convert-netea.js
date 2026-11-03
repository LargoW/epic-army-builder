#!/usr/bin/env node
// convert/convert-netea.js
//
// Converts an adam77/snapfire *_NETEA.json army file to the canonical
// epic-army-builder format (schema 0, ruleset "netea").
//
// The NetEA source format is intentionally minimal: formations carry only
// a name, points and a list of upgrade IDs; units and complex effects are
// described in free-text strings ("units" field) and are NOT structured.
// This converter preserves all available structured data faithfully and
// emits a `_note` field wherever information was too ambiguous to convert
// automatically (free-text unit strings, formation pts ≤ 0, etc.).
// A human review pass is always required after conversion.
//
// Usage:
//   node convert/convert-netea.js <src_NETEA.json> [--out <canonical.json>]
//                                                   [--army <army-id-slug>]
//                                                   [--faction <faction>]
//                                                   [--ruleset <ruleset>]
//
// Defaults:
//   --ruleset  netea
//   --army     derived from filename (e.g. SM_codex_NETEA -> sm/codex)
//   --faction  derived from filename prefix (SM -> Space Marines, etc.)
//   --out      <same dir as src>/<slug>.json

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const readJson = (p) => {
  // Strip BOM and fix trailing commas (some source files are lax JSON)
  const raw = readFileSync(p, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(raw);
};

/** Strip HTML tags from strings that come from the snapfire source */
const stripHtml = (s) => (typeof s === "string" ? s.replace(/<[^>]*>/g, "").trim() : s);

/**
 * Derive a slug from a NetEA filename, e.g.:
 *   "SM_codex_NETEA.json"        -> { prefix: "SM", slug: "sm/codex",   faction: "Space Marines" }
 *   "IG_steelLegion_NETEA.json"  -> { prefix: "IG", slug: "ig/steellegion", faction: "Astra Militarum" }
 */
const FACTION_MAP = {
  SM:    "Space Marines",
  IG:    "Astra Militarum",
  ORK:   "Orks",
  EL:    "Eldar",
  CHAOS: "Chaos",
  XENOS: "Xenos",
  INQ:   "Inquisition",
  AMTL:  "Adeptus Mechanicus",
};

function deriveSlug(filename) {
  // e.g. "SM_bloodAngels_NETEA.json"
  const base = basename(filename, ".json").replace(/_NETEA$/i, "");
  const parts = base.split("_"); // ["SM", "bloodAngels"]
  const prefix = parts[0].toUpperCase();
  const rest = parts.slice(1).join("-").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return {
    prefix,
    faction: FACTION_MAP[prefix] || prefix,
    slug: `${prefix.toLowerCase()}/${rest}`,
  };
}

/** Build a safe id string from a name */
const toId = (name) =>
  name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/**
 * Convert one NetEA source object to the canonical format.
 *
 * @param {object} src   – parsed _NETEA.json content
 * @param {object} opts  – { armyId, faction, ruleset, srcFile }
 */
export function convertNetea(src, opts = {}) {
  const ruleset = opts.ruleset || "netea";
  const armyId  = opts.armyId  || toId(src.id || "unknown");
  const faction  = opts.faction  || "Unknown";
  const srcFile  = opts.srcFile  || null;

  // Index upgrades by numeric id for fast lookup
  const upgradeById = new Map((src.upgrades || []).map((u) => [u.id, u]));

  // Index all formation ids (numeric) -> their section name
  const sectionByFormationId = new Map();
  for (const sec of src.sections || []) {
    for (const f of sec.formations || []) {
      sectionByFormationId.set(f.id, sec.name);
    }
  }

  // ---- Sections -----------------------------------------------------------
  const sections = (src.sections || []).map((sec) => ({
    id:   toId(sec.name),
    name: sec.name,
    formations: (sec.formations || []).map((f) => toId(`${f.id}-${f.name}`)),
  }));

  // ---- Formations ---------------------------------------------------------
  const formations = [];
  for (const sec of src.sections || []) {
    for (const f of sec.formations || []) {
      const fid = toId(`${f.id}-${f.name}`);
      const entry = {
        id:   fid,
        name: stripHtml(f.name),
        pts:  f.pts ?? 0,
        tags: [toId(sec.name)],
        units: [],           // cannot be populated automatically – no unit table in NETEA source
        upgrades: (f.upgrades || []).map((uid) => toId(`${uid}-${(upgradeById.get(uid) || {}).name || uid}`)),
      };
      if (f.units) entry._unitsText = f.units;  // preserve free-text unit hint
      if (f.pts <= 0) entry._note = "pts value is 0 or relative – verify base cost";
      formations.push(entry);
    }
  }

  // ---- Upgrades -----------------------------------------------------------
  // NetEA upgrades are flat: { id, name, pts }. Each is mapped to a
  // single-variant upgrade (the upgrade IS the variant).
  const upgrades = (src.upgrades || []).map((u) => {
    const uid = toId(`${u.id}-${u.name}`);
    return {
      id:   uid,
      name: stripHtml(u.name),
      variants: [
        {
          id:    "1",
          label: stripHtml(u.name),
          pts:   u.pts ?? 0,
          effects: [],  // cannot be derived automatically – no unit table
        },
      ],
    };
  });

  // ---- Formation constraints ----------------------------------------------
  const formationConstraints = (src.formationConstraints || []).map((c, i) => {
    const cid = c.name ? toId(c.name) : `fc-${i}`;
    const entry = { id: cid };

    // from: array of numeric formation ids -> canonical formation ids
    entry.from = (c.from || []).map((fid) => {
      const f = formations.find((x) => x.id.startsWith(toId(`${fid}-`)));
      return f ? f.id : `unknown-${fid}`;
    });

    if (c.maxPercent != null) {
      // Convert percentage to [num, den] fraction (e.g. 33.34 -> [1,3])
      const pct = c.maxPercent;
      if (Math.abs(pct - 33.34) < 0.5 || Math.abs(pct - 33) < 0.5) {
        entry.maxShare = [1, 3];
      } else if (Math.abs(pct - 25) < 0.5) {
        entry.maxShare = [1, 4];
      } else if (Math.abs(pct - 50) < 0.5) {
        entry.maxShare = [1, 2];
      } else {
        entry.maxShare = [Math.round(pct), 100];
        entry._note = `original maxPercent was ${pct}`;
      }
    } else if (c.max != null) {
      entry.max = c.max;
    }
    if (c.min != null) entry.min = c.min;

    if (c.forEach) {
      entry.forEach = (c.forEach || []).map((fid) => {
        const f = formations.find((x) => x.id.startsWith(toId(`${fid}-`)));
        return f ? f.id : `unknown-${fid}`;
      });
    }
    if (c.perArmy) entry.perArmy = true;
    if (c.name2)   entry._name2  = c.name2;

    return entry;
  });

  // ---- Upgrade constraints ------------------------------------------------
  const upgradeConstraints = (src.upgradeConstraints || []).map((c, i) => {
    const cid = c.name ? toId(c.name) : `uc-${i}`;

    const resolveUpgradeIds = (ids) =>
      (ids || []).map((uid) => toId(`${uid}-${(upgradeById.get(uid) || {}).name || uid}`));

    const resolveFormationIds = (ids) =>
      (ids || []).map((fid) => {
        const f = formations.find((x) => x.id.startsWith(toId(`${fid}-`)));
        return f ? f.id : `unknown-${fid}`;
      });

    const entry = {
      id:   cid,
      from: resolveUpgradeIds(c.from),
    };
    if (c.max      != null) entry.max      = c.max;
    if (c.min      != null) entry.min      = c.min;
    if (c.maxTotal != null) entry.maxTotal = c.maxTotal;
    if (c.perArmy)          entry.perArmy  = true;
    if (c.perFormation)     entry.perFormation = true;
    if (c.appliesTo)        entry.appliesTo = resolveFormationIds(c.appliesTo);

    return entry;
  });

  // ---- Top-level result ---------------------------------------------------
  const result = {
    schema:   0,
    ruleset,
    lang:     "en",
    id:       `${ruleset}/${armyId}`,
    name:     stripHtml(src.id || armyId),
    faction,
    version:  stripHtml(src.version || "1.0"),
    source: {
      file:   srcFile,
      by:     stripHtml(src.by || null),
      notes:  (src.notes || []).map(stripHtml),
    },
    units:    {},   // empty – NetEA source has no unit table; populate by hand or via profiles
    sections,
    formations,
    upgrades,
    formationConstraints,
    upgradeConstraints,
    _conversionNotes: [
      "Converted from adam77/snapfire NetEA format by convert-netea.js.",
      "formations[].units is empty – populate unit slots by hand or from an external unit table.",
      "upgrades[].variants[].effects is empty – add effects by hand.",
      "Verify all pts values; formations with pts ≤ 0 are marked with _note.",
    ],
  };

  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith("convert-netea.js")) {
  const args   = process.argv.slice(2);
  const opt    = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const srcPath = args.find((a) => !a.startsWith("--") && a !== opt("--out") && a !== opt("--army") && a !== opt("--faction") && a !== opt("--ruleset"));

  if (!srcPath) {
    console.error("Usage: node convert/convert-netea.js <src_NETEA.json> [--out <file>] [--army <slug>] [--faction <name>] [--ruleset <id>]");
    process.exit(2);
  }

  const src      = readJson(srcPath);
  const derived  = deriveSlug(srcPath);
  const ruleset  = opt("--ruleset") || "netea";
  const armyId   = opt("--army")    || derived.slug;
  const faction  = opt("--faction") || derived.faction;
  const outPath  = opt("--out")     || join(dirname(srcPath), `${armyId.replace(/\//g, "_")}_canonical.json`);

  const result = convertNetea(src, { armyId, faction, ruleset, srcFile: srcPath });

  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");

  const fCount = result.formations.length;
  const uCount = result.upgrades.length;
  const unitsTextCount = result.formations.filter((f) => f._unitsText).length;
  const notedCount     = result.formations.filter((f) => f._note).length;

  console.log(`Wrote ${outPath}`);
  console.log(`  ${fCount} formations, ${uCount} upgrades`);
  console.log(`  ${unitsTextCount} formations have a free-text _unitsText (units need manual entry)`);
  if (notedCount) console.log(`  ${notedCount} formations flagged with _note`);
  console.log("  ⚠  Review _conversionNotes before using in production.");
}

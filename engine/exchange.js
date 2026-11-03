// List exchange format (JSON, versioned) and share-link coding. DOM-free so it can be tested in Node.
export const FORMAT = "epic-army-builder";
export const VERSION = 1;

export function buildExport({ army, armyVersion, name, state, entries, total }) {
  return {
    format: FORMAT,
    version: VERSION,
    ruleset: army.split("/")[0],
    army,
    armyVersion,
    name,
    points: total,
    formations: state.formations.map((e, i) => ({
      formation: e.formation,
      name: entries && entries[i] ? entries[i].name : undefined,
      points: entries && entries[i] ? entries[i].pts : undefined,
      ...(e.size ? { size: e.size } : {}),
      choices: e.choices,
      upgrades: e.upgrades.map((u) => ({ upgrade: u.upgrade, variant: u.variant, chimeras: u.chimeras || 0, ...(u.count > 1 ? { count: u.count } : {}) })),
    })),
  };
}

const toB64 = (s) => {
  let bin = "";
  new TextEncoder().encode(s).forEach((c) => { bin += String.fromCharCode(c); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (t) => {
  const bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

// The link carries only what is needed to rebuild the list (no display-only fields).
export function toToken(obj) {
  const slim = { ...obj, formations: obj.formations.map(({ name, points, ...rest }) => rest) };
  delete slim.points;
  return toB64(JSON.stringify(slim));
}

// Accepts exported JSON, a share link, or a bare token.
export function parseInput(text) {
  const t = String(text || "").trim();
  if (!t) throw new Error("empty");
  try {
    if (t.startsWith("{")) return JSON.parse(t);
    const i = t.indexOf("#l=");
    return JSON.parse(fromB64(i >= 0 ? t.slice(i + 3) : t));
  } catch {
    throw new Error("unreadable");
  }
}

const nonNegInt = (v) => Math.max(0, Math.floor(Number(v)) || 0);

// Validates against the army data; unknown formations/upgrades are dropped and counted.
export function sanitize(obj, data) {
  if (!obj || obj.format !== FORMAT) throw new Error("format");
  if (!(obj.version <= VERSION)) throw new Error("version");
  if (!Array.isArray(obj.formations)) throw new Error("format");
  const formationById = Object.fromEntries(data.formations.map((f) => [f.id, f]));
  const upgradeById = Object.fromEntries(data.upgrades.map((u) => [u.id, u]));
  let dropped = 0;
  const formations = [];
  for (const f of obj.formations) {
    if (!f || !formationById[f.formation]) { dropped++; continue; }
    const choices = {};
    for (const [slot, dist] of Object.entries(f.choices && typeof f.choices === "object" ? f.choices : {})) {
      if (dist && typeof dist === "object") choices[slot] = Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, nonNegInt(v)]));
    }
    const upgrades = [];
    for (const u of Array.isArray(f.upgrades) ? f.upgrades : []) {
      const def = u && upgradeById[u.upgrade];
      if (def && def.variants.some((v) => v.id === u.variant)) upgrades.push({ upgrade: u.upgrade, variant: u.variant, chimeras: nonNegInt(u.chimeras), count: Math.max(1, nonNegInt(u.count)) });
      else dropped++;
    }
    const sizes = formationById[f.formation].sizes;
    const size = sizes && sizes.some((s) => s.id === f.size) ? f.size : undefined;
    formations.push({ uid: formations.length + 1, formation: f.formation, ...(size ? { size } : {}), choices, upgrades });
  }
  return { state: { nextUid: formations.length + 1, formations }, dropped, name: String(obj.name || "").slice(0, 40) };
}

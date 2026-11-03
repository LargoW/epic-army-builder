// DOM-free army engine: state helpers, roster/points computation and rule validation.
// State is plain JSON: { nextUid, formations: [{ uid, formation, choices, upgrades: [{ upgrade, variant, chimeras }] }] }

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

// Selector: "*", "tag:<tag>" or an id. `def` is a formation definition or an upgrade definition.
export function matches(selectors, def) {
  return arr(selectors).some(
    (s) => s === "*" || s === def.id || (s.startsWith("tag:") && (def.tags || []).includes(s.slice(4)))
  );
}

const index = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

// Merges a profile bundle into army data: unit type and special-rule names come from the profiles.
export function withProfiles(data, profiles) {
  const units = Object.fromEntries(
    Object.entries(data.units).map(([id, u]) => {
      const p = profiles.units[id];
      return [id, p ? { ...u, type: p.type || u.type, rules: p.specialRules.map((r) => r.name) } : u];
    })
  );
  return { ...data, units, profiles: profiles.units, armyRules: profiles.specialRules };
}

// Profile + count for each unit of a computed roster, in roster order.
export function rosterProfiles(data, roster) {
  return Object.entries(roster).map(([unit, count]) => ({
    unit,
    count,
    name: data.units[unit].name,
    profile: (data.profiles || {})[unit] || null,
  }));
}

export function createState() {
  return { nextUid: 1, formations: [] };
}

export function addFormation(state, formationId) {
  const entry = { uid: state.nextUid, formation: formationId, choices: {}, upgrades: [] };
  return { nextUid: state.nextUid + 1, formations: [...state.formations, entry] };
}

const mapEntry = (state, uid, fn) => ({
  ...state,
  formations: state.formations.map((e) => (e.uid === uid ? fn(e) : e)),
});

export const removeFormation = (state, uid) => ({
  ...state,
  formations: state.formations.filter((e) => e.uid !== uid),
});

// Moves one entry up (-1) or down (+1); does nothing at the ends.
export function moveFormation(state, uid, delta) {
  const from = state.formations.findIndex((e) => e.uid === uid);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.formations.length) return state;
  const formations = [...state.formations];
  [formations[from], formations[to]] = [formations[to], formations[from]];
  return { ...state, formations };
}

// mode "section": army-list section order; "points": highest first. Stable, so ties keep their order.
export function sortFormations(data, state, mode) {
  const sectionOf = {};
  data.sections.forEach((s, i) => s.formations.forEach((id) => (sectionOf[id] = i)));
  const ptsOf = Object.fromEntries(summarize(data, state).entries.map((e) => [e.uid, e.pts]));
  const key = mode === "points" ? (e) => -ptsOf[e.uid] : (e) => sectionOf[e.formation] ?? 99;
  const formations = state.formations.map((e, i) => ({ e, i })).sort((a, b) => key(a.e) - key(b.e) || a.i - b.i).map((x) => x.e);
  return { ...state, formations };
}

// Distribution of a oneOf slot, e.g. { baneblade: 2, shadowsword: 1 }
export const setChoice = (state, uid, slot, distribution) =>
  mapEntry(state, uid, (e) => ({ ...e, choices: { ...e.choices, [slot]: distribution } }));

export const setUpgrade = (state, uid, upgrade, variant, chimeras = 0) =>
  mapEntry(state, uid, (e) => ({
    ...e,
    upgrades: [...e.upgrades.filter((u) => u.upgrade !== upgrade), { upgrade, variant, chimeras }],
  }));

export const removeUpgrade = (state, uid, upgrade) =>
  mapEntry(state, uid, (e) => ({ ...e, upgrades: e.upgrades.filter((u) => u.upgrade !== upgrade) }));

function transportRule(data, formationDef) {
  return (data.transport || []).find((t) => matches(t.appliesTo, formationDef));
}

function isCarriable(data, rule, unitId) {
  const unit = data.units[unitId];
  if (!unit || unit.type !== rule.carries.type) return false;
  if ((rule.carries.excludeUnits || []).includes(unitId)) return false;
  const excluded = rule.carries.excludeRules || [];
  return !(unit.rules || []).some((r) => excluded.includes(r));
}

// Final unit list of one formation entry, plus problems found while building it.
export function computeEntry(data, entry) {
  const formations = index(data.formations);
  const upgrades = index(data.upgrades);
  const def = formations[entry.formation];
  const problems = [];
  const roster = {};
  const add = (unit, n) => (roster[unit] = (roster[unit] || 0) + n);
  let pts = def.pts;

  def.units.forEach((slot, i) => {
    if (!slot.oneOf) return add(slot.unit, slot.count);
    const dist = entry.choices[i] || { [slot.oneOf[0]]: slot.count };
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const valid =
      total === slot.count &&
      Object.entries(dist).every(([u, n]) => slot.oneOf.includes(u) && Number.isInteger(n) && n >= 0) &&
      (slot.mixed || Object.values(dist).filter((n) => n > 0).length <= 1);
    if (!valid) problems.push({ code: "choice-invalid", params: { slot }, refs: { uid: entry.uid } });
    Object.entries(dist).forEach(([u, n]) => add(u, n));
  });

  const rule = transportRule(data, def);
  let addedCarriable;
  entry.upgrades.forEach((sel) => {
    const upDef = upgrades[sel.upgrade];
    const variant = upDef && upDef.variants.find((v) => v.id === sel.variant);
    if (!upDef) return problems.push({ code: "unknown-upgrade", params: { upgrade: sel.upgrade }, refs: { uid: entry.uid } });
    if (!variant) return problems.push({ code: "unknown-variant", params: { upgrade: sel.upgrade, variant: sel.variant }, refs: { uid: entry.uid } });
    if (!def.upgrades.includes(sel.upgrade))
      problems.push({ code: "upgrade-not-allowed", params: { upgrade: sel.upgrade }, refs: { uid: entry.uid } });

    pts += variant.pts;
    addedCarriable = 0;
    variant.effects.forEach((fx) => {
      if (fx.op === "add") {
        add(fx.unit, fx.count);
        if (rule && isCarriable(data, rule, fx.unit)) addedCarriable += fx.count;
      } else if (fx.op === "replace") {
        if ((roster[fx.from] || 0) < fx.count)
          problems.push({ code: "replace-insufficient", params: { upgrade: sel.upgrade, from: fx.from, count: fx.count }, refs: { uid: entry.uid } });
        const n = Math.min(fx.count, roster[fx.from] || 0);
        roster[fx.from] = (roster[fx.from] || 0) - n;
        add(fx.to, n);
      }
    });

    const chimeras = sel.chimeras || 0;
    if (chimeras > 0) {
      const maxChimeras = Math.ceil(addedCarriable / (rule ? rule.capacity : 1));
      if (!rule || !upDef.transportable)
        problems.push({ code: "transport-not-allowed", params: { upgrade: sel.upgrade }, refs: { uid: entry.uid } });
      else {
        if (chimeras > maxChimeras)
          problems.push({ code: "transport-too-many", params: { upgrade: sel.upgrade, max: maxChimeras }, refs: { uid: entry.uid } });
        add(rule.vehicle, chimeras);
        pts += chimeras * rule.pts;
      }
    }
  });

  // Free automatic transports (Space Marine Rhinos): bought vehicles (Razorbacks, Land Raiders) carry first,
  // everything left over rides in as few free vehicles as possible.
  const auto = (data.autoTransport || []).find((t) => matches(t.appliesTo, def));
  if (auto) {
    const carriable = Object.entries(roster)
      .filter(([u]) => isCarriable(data, auto, u))
      .reduce((a, [, n]) => a + n, 0);
    let carried = 0;
    for (const [u, cap] of Object.entries(auto.others || {})) {
      const n = roster[u] || 0;
      carried += n * cap;
      const max = Math.ceil(carriable / cap);
      if (n > max) problems.push({ code: "vehicle-surplus", params: { unit: u, max }, refs: { uid: entry.uid } });
    }
    add(auto.vehicle, Math.max(0, Math.ceil((carriable - carried) / auto.capacity)));
  }

  // All carriable INF must be transported as soon as the formation contains transports.
  if (rule && (roster[rule.vehicle] || 0) > 0) {
    const carriable = Object.entries(roster)
      .filter(([u]) => isCarriable(data, rule, u))
      .reduce((a, [, n]) => a + n, 0);
    if (roster[rule.vehicle] * rule.capacity < carriable)
      problems.push({ code: "transport-incomplete", params: { inf: carriable, vehicles: roster[rule.vehicle], capacity: rule.capacity }, refs: { uid: entry.uid } });
  }

  Object.keys(roster).forEach((u) => roster[u] <= 0 && delete roster[u]);
  return { uid: entry.uid, formation: def.id, name: def.name, pts, roster, problems };
}

export function summarize(data, state) {
  const entries = state.formations.map((e) => computeEntry(data, e));
  return { total: entries.reduce((a, e) => a + e.pts, 0), entries };
}

export function validate(data, state) {
  const formations = index(data.formations);
  const upgrades = index(data.upgrades);
  const violations = [];
  const known = state.formations.filter((e) => formations[e.formation]);
  state.formations
    .filter((e) => !formations[e.formation])
    .forEach((e) => violations.push({ code: "unknown-formation", params: { formation: e.formation }, refs: { uid: e.uid } }));

  const { total, entries } = summarize(data, { ...state, formations: known });
  entries.forEach((e) => violations.push(...e.problems));
  const byUid = Object.fromEntries(entries.map((e) => [e.uid, e]));

  for (const c of data.formationConstraints || []) {
    const from = known.filter((e) => matches(c.from, formations[e.formation]));
    if (c.maxShare) {
      const [num, den] = c.maxShare;
      const pts = from.reduce((a, e) => a + byUid[e.uid].pts, 0);
      if (pts * den > num * total) violations.push({ code: "share-limit", params: { id: c.id, pts, total }, refs: { uids: from.map((e) => e.uid) } });
    } else if (c.max != null) {
      const parents = c.forEach ? known.filter((e) => matches(c.forEach, formations[e.formation])).length : 1;
      const limit = c.forEach ? c.max * parents : c.max;
      if (from.length > limit) violations.push({ code: "formation-limit", params: { id: c.id, count: from.length, limit }, refs: { uids: from.map((e) => e.uid) } });
    }
  }

  // Variants limited per army (e.g. 0–1 Oberbefehlshaber)
  const armyLimited = {};
  known.forEach((e) =>
    e.upgrades.forEach((u) => {
      const v = upgrades[u.upgrade] && upgrades[u.upgrade].variants.find((x) => x.id === u.variant);
      if (v && v.perArmy != null) (armyLimited[`${u.upgrade}/${v.id}`] ||= { v, uids: [] }).uids.push(e.uid);
    })
  );
  Object.entries(armyLimited).forEach(([key, { v, uids }]) => {
    if (uids.length > v.perArmy) violations.push({ code: "variant-army-limit", params: { label: v.label, count: uids.length, limit: v.perArmy }, refs: { uids } });
  });

  for (const c of data.upgradeConstraints || []) {
    for (const e of known) {
      if (c.appliesTo && !matches(c.appliesTo, formations[e.formation])) continue;
      const ups = e.upgrades.filter((u) => upgrades[u.upgrade] && matches(c.from, upgrades[u.upgrade]));
      const counts = {};
      ups.forEach((u) => (counts[u.upgrade] = (counts[u.upgrade] || 0) + 1));
      const tooMany = c.maxTotal != null && ups.length > c.maxTotal;
      const dup = c.max != null && (c.perUpgrade ? Object.values(counts).some((n) => n > c.max) : ups.length > c.max);
      if (tooMany || dup) violations.push({ code: "upgrade-limit", params: { id: c.id, count: ups.length }, refs: { uid: e.uid } });
    }
  }
  return violations;
}

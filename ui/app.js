import {
  createState, addFormation, removeFormation, moveFormation, sortFormations, setChoice, setUpgrade, removeUpgrade,
  summarize, validate, withProfiles, rosterProfiles, matches,
} from "../engine/engine.js";
import { messageFor } from "./messages.de.js";
import { buildExport, toToken, parseInput, sanitize } from "../engine/exchange.js";

const LEGACY = "eab:ear-de/ig/steellegion";
const index = await fetch("data/index.json").then((r) => r.json());
const armyInfo = (id) => index.armies.find((a) => a.id === id);

let base, data, formationById, upgradeById;
async function loadArmy(id) {
  const [b, p] = await Promise.all([
    fetch(`data/${id}.json`).then((r) => r.json()),
    fetch(`data/${id}.profiles.json`).then((r) => r.json()),
  ]);
  return { base: b, data: withProfiles(b, p) };
}
async function useArmy(id) {
  ({ base, data } = await loadArmy(id));
  formationById = Object.fromEntries(data.formations.map((f) => [f.id, f]));
  upgradeById = Object.fromEntries(data.upgrades.map((u) => [u.id, u]));
}

const $ = (s) => document.querySelector(s);
const app = $("#app");
const open = new Set();
let view = localStorage.getItem("eab:view") === "overview" ? "overview" : "build";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const text = (d) => (Array.isArray(d) ? d.join(" ") : d || "");
const unitName = (id) => (data.units[id] ? data.units[id].name : id);
const names = { upgrade: (id) => (upgradeById[id] ? upgradeById[id].name : id), unit: unitName };

// Theme: no stored choice means "follow the system"; the button then sets an explicit choice.
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("eab:theme", t);
  document.querySelector('meta[name="theme-color"]').content = t === "light" ? "#f3f4f6" : "#0b0f17";
}
applyTheme(currentTheme());

// Lists: any number per army, each with its own name. Stored as one array.
let lists = [];
try { lists = JSON.parse(localStorage.getItem("eab:lists")) || []; } catch { lists = []; }
if (!lists.length) {
  let migrated = null;
  try { migrated = JSON.parse(localStorage.getItem(LEGACY)); } catch { /* ignore */ }
  if (migrated && Array.isArray(migrated.formations)) lists.push({ id: "l1", army: "ear-de/ig/steellegion", name: "Stahllegion 1", state: migrated });
}
lists = lists.filter((l) => armyInfo(l.army));
let currentId = localStorage.getItem("eab:current");
let state;
const cur = () => lists.find((l) => l.id === currentId);

const persist = () => {
  localStorage.setItem("eab:lists", JSON.stringify(lists));
  if (currentId) localStorage.setItem("eab:current", currentId);
  else localStorage.removeItem("eab:current");
};
const save = () => {
  const l = cur();
  l.state = state;
  l.total = summarize(data, state).total;
  persist();
};

function newName(armyId) {
  const a = armyInfo(armyId);
  let n = 1;
  while (lists.some((l) => l.army === armyId && l.name === `${a.name} ${n}`)) n++;
  return `${a.name} ${n}`;
}

async function openList(id) {
  const l = lists.find((x) => x.id === id);
  currentId = id;
  await useArmy(l.army);
  state = l.state && Array.isArray(l.state.formations)
    ? { ...l.state, formations: l.state.formations.filter((e) => formationById[e.formation]) }
    : createState();
  open.clear();
  persist();
}

async function createList(armyId, name, from) {
  let n = 1;
  while (lists.some((l) => l.id === `l${n}`)) n++;
  lists.push({ id: `l${n}`, army: armyId, name: name || newName(armyId), state: from || createState() });
  await openList(`l${n}`);
  save();
}

// First visit: no default list. The start screen asks the user to pick an army.
if (!cur() && lists.length) currentId = lists[0].id;
if (cur()) await openList(currentId);

function update(next) {
  state = next;
  save();
  render();
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

const stat = (label, v) => (v == null ? "" : `<span><b>${label}</b>${esc(v)}</span>`);

function weaponLine(w) {
  const modes = w.modes
    .map((m) => {
      const rules = (m.specialRules || []).map((r) => esc(r.name)).join(", ");
      return `${m.join ? `<i>${esc(m.join)}</i> ` : ""}${m.range ? `${esc(m.range)} cm ` : ""}${esc(m.firepower)}${rules ? ` (${rules})` : ""}`;
    })
    .join(" ");
  return `<li><b>${w.count ? `${esc(w.count)}× ` : ""}${esc(w.name)}</b> ${modes}</li>`;
}

function unitBlock(entryUid, r) {
  const p = r.profile;
  const key = `u${entryUid}:${r.unit}`;
  const body = p
    ? `<div class="stats">${stat("Typ", p.type)}${stat("Geschw.", p.speed)}${stat("ARM", p.armour != null ? plus(p.armour) : null)}${stat("CC", p.cc != null ? plus(p.cc) : null)}${stat("FF", p.ff != null ? plus(p.ff) : null)}</div>
       ${p.weapons.length ? `<ul class="weapons">${p.weapons.map(weaponLine).join("")}</ul>` : ""}
       ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ""}
       ${p.specialRules.length ? `<dl class="rules">${p.specialRules.map((r2) => `<dt>${esc(r2.name)}</dt>${r2.description ? `<dd>${esc(text(r2.description))}</dd>` : ""}`).join("")}</dl>` : ""}`
    : `<p class="muted">Kein Profil vorhanden.</p>`;
  return `<details class="unit" data-key="${key}"${open.has(key) ? " open" : ""}>
    <summary><span>${r.count}× ${esc(r.name)}</span>${p && p.type ? `<span class="type">${esc(p.type)}</span>` : ""}</summary>${body}</details>`;
}

function choiceControls(entry, def) {
  const slots = def.units.map((s, i) => ({ s, i })).filter((x) => x.s.oneOf);
  if (!slots.length) return "";
  return `<h3>Einheiten wählen</h3>` + slots.map(({ s, i }) => {
    const dist = entry.choices[i] || { [s.oneOf[0]]: s.count };
    if (!s.mixed) {
      const cur = Object.keys(dist).find((u) => dist[u] > 0) || s.oneOf[0];
      return `<div class="row"><label>${s.count}×</label>
        <select data-act="choice-single" data-uid="${entry.uid}" data-slot="${i}" data-count="${s.count}">
          ${s.oneOf.map((u) => `<option value="${u}"${u === cur ? " selected" : ""}>${esc(unitName(u))}</option>`).join("")}
        </select></div>`;
    }
    return s.oneOf.map((u) => `<div class="row"><label>${esc(unitName(u))}</label>
      <input type="number" min="0" max="${s.count}" inputmode="numeric" value="${dist[u] || 0}"
        data-act="choice-mixed" data-uid="${entry.uid}" data-slot="${i}" data-unit="${u}"></div>`).join("")
      + `<p class="note">Summe muss ${s.count} ergeben.</p>`;
  }).join("");
}

function upgradeControls(entry, def) {
  if (!def.upgrades.length) return "";
  const canTransport = (data.transport || []).find((t) => matches(t.appliesTo, def));
  return `<h3>Aufwertungen</h3>` + def.upgrades.map((id) => {
    const u = upgradeById[id];
    const sel = entry.upgrades.find((x) => x.upgrade === id);
    return `<div class="row"><label for="u${entry.uid}-${id}">${esc(u.name)}</label>
      <select id="u${entry.uid}-${id}" data-act="upgrade" data-uid="${entry.uid}" data-upgrade="${id}">
        <option value="">–</option>
        ${u.variants.map((v) => `<option value="${v.id}"${sel && sel.variant === v.id ? " selected" : ""}>${esc(v.label)} (+${v.pts})</option>`).join("")}
      </select>
      ${sel && u.transportable && canTransport ? `<div class="sub"><label for="c${entry.uid}-${id}">Chimären (+${canTransport.pts} je)</label>
        <input id="c${entry.uid}-${id}" type="number" min="0" inputmode="numeric" value="${sel.chimeras || 0}" data-act="chimeras" data-uid="${entry.uid}" data-upgrade="${id}"></div>` : ""}
    </div>`;
  }).join("");
}

const problemsFor = (violations, uid) =>
  violations.filter((v) => v.refs && (v.refs.uid === uid || (v.refs.uids && v.refs.uids.includes(uid))));
const problemTexts = (probs) => [...new Set(probs.map((v) => messageFor(v, names)))];

// BTS (Break Their Spirit): the most expensive formation(s); ties are all flagged.
function btsSet(entries) {
  const max = Math.max(0, ...entries.map((e) => e.pts));
  return new Set(entries.map((e, i) => (e.pts === max && max > 0 ? i : -1)).filter((i) => i >= 0));
}
const isAir = (calc) => {
  const rp = rosterProfiles(data, calc.roster);
  return rp.length > 0 && rp.every((r) => r.profile && r.profile.type === "AC");
};
const btsBadge = () => `<span class="bts" title="Break Their Spirit">BTS</span>`;
const btsAirNote = () => `<p class="bts-note">BTS-Verband ist Luftverband: Gilt als vernichtet, wenn er am Spielende nicht auf dem Tisch ist.</p>`;

function renderBuild(entries, violations) {
  const bts = btsSet(entries);
  return state.formations.map((entry, i) => {
    const def = formationById[entry.formation];
    const calc = entries[i];
    const probs = problemsFor(violations, entry.uid);
    const key = `f${entry.uid}`;
    return `<details class="entry${probs.length ? " has-problem" : ""}" data-key="${key}"${open.has(key) ? " open" : ""}>
      <summary><div class="entry-head">
        <span class="name">${esc(def.name)}${bts.has(i) ? btsBadge() : ""}</span><span class="pts">${calc.pts} Pkt.</span>
        <button class="icon" type="button" aria-label="Verband entfernen" data-act="remove" data-uid="${entry.uid}">×</button>
      </div>
      ${bts.has(i) && isAir(calc) ? btsAirNote() : ""}
      ${probs.length ? `<ul class="problems">${problemTexts(probs).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      </summary>
      <div class="entry-body">
        ${choiceControls(entry, def)}
        ${upgradeControls(entry, def)}
        <h3>Einheiten</h3>
        ${rosterProfiles(data, calc.roster).map((r) => unitBlock(entry.uid, r)).join("")}
      </div></details>`;
  }).join("");
}

const plus = (v) => (typeof v === "number" ? `${v}+` : v);
function compactStats(p) {
  if (!p) return "";
  const parts = [p.type, p.speed != null ? (typeof p.speed === "number" ? `${p.speed} cm` : p.speed) : null, p.armour != null ? `ARM ${plus(p.armour)}` : null, p.cc != null ? `CC ${plus(p.cc)}` : null, p.ff != null ? `FF ${plus(p.ff)}` : null];
  return parts.filter(Boolean).join(" · ");
}

// Game-time view: final units per formation and the chosen upgrades, no controls.
function renderOverview(entries, violations, total) {
  const bts = btsSet(entries);
  const cards = state.formations.map((entry, i) => {
    const def = formationById[entry.formation];
    const calc = entries[i];
    const probs = problemTexts(problemsFor(violations, entry.uid));
    const ups = entry.upgrades
      .map((sel) => {
        const u = upgradeById[sel.upgrade];
        const v = u && u.variants.find((x) => x.id === sel.variant);
        return v ? `${esc(v.label)}${sel.chimeras ? ` + ${sel.chimeras} Chimäre${sel.chimeras > 1 ? "n" : ""}` : ""}` : null;
      })
      .filter(Boolean);
    return `<section class="ov${probs.length ? " has-problem" : ""}">
      <div class="ov-head">      <span class="name">${esc(def.name)}${bts.has(i) ? btsBadge() : ""}</span><span class="pts">${calc.pts} Pkt.</span></div>
            ${bts.has(i) && isAir(calc) ? btsAirNote() : ""}
            <ul>${rosterProfiles(data, calc.roster).map((r) => `<li><span class="n">${r.count}×</span><span class="nm">${esc(r.name)}</span><span class="st">${esc(compactStats(r.profile))}</span>${r.profile && r.profile.weapons.length ? `<ul class="wp">${r.profile.weapons.map(weaponLine).join("")}</ul>` : ""}</li>`).join("")}</ul>
      ${ups.length ? `<div class="ups"><b>Aufwertungen:</b> ${ups.join("; ")}</div>` : ""}
      ${probs.length ? `<p class="ov-problems">${probs.map(esc).join("<br>")}</p>` : ""}
    </section>`;
  }).join("");
  return cards + `<div class="ov-total"><span>${state.formations.length} Verbände</span><span>${total} Pkt.</span></div>`;
}

function armyButtons() {
  return index.rulesets.map((r) => {
    const byFaction = {};
    index.armies.filter((a) => a.ruleset === r.id).forEach((a) => (byFaction[a.faction] ||= []).push(a));
    return `<section class="picker-section"><h3>${esc(r.name)}</h3>${Object.entries(byFaction).map(([f, as]) =>
      `<p>${esc(f)}</p>${as.map((a) => `<button class="pick" type="button" data-act="new-list" data-army="${a.id}"><span class="name">${esc(a.name)}</span><span>v${esc(a.version)}</span></button>`).join("")}`).join("")}</section>`;
  }).join("");
}

function renderStart() {
  $("#total").textContent = 0;
  $("#army-name").textContent = "Armee wählen";
  $("#army-sub").textContent = "Tippe hier, um eine Armee zu wählen";
  document.body.classList.add("no-list");
  app.innerHTML = `<div class="start"><h2>Willkommen!</h2><p>Wähle eine Armee, um eine neue Liste zu beginnen. Die Armee kannst du später jederzeit oben über den Titel wechseln.</p>
    ${armyButtons()}
    <section class="picker-section"><h3>Liste erhalten?</h3><button class="pick" type="button" data-act="import"><span class="name">Liste importieren</span></button></section></div>`;
}

function render() {
  if (!cur()) return renderStart();
  document.body.classList.remove("no-list");
  const { total, entries } = summarize(data, state);
  const violations = validate(data, state);
  $("#total").textContent = total;
  if (cur().total !== total) { cur().total = total; persist(); }
  $("#army-name").textContent = cur().name;
  $("#army-sub").textContent = `${base.name} · ${base.faction} · v${base.version}`;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  $("#sort").disabled = state.formations.length < 2;

  if (!state.formations.length) {
    app.innerHTML = `<p class="empty">Noch keine Verbände.<br>Tippe auf „+ Verband“, um zu beginnen.</p>`;
    return;
  }
  app.innerHTML = view === "overview" ? renderOverview(entries, violations, total) : renderBuild(entries, violations);
}

function armyText() {
  const { total, entries } = summarize(data, state);
  const lines = [`${base.name} (${base.faction}) – ${total} Pkt.`, ""];
  entries.forEach((e, i) => {
    lines.push(`${e.name} – ${e.pts} Pkt.`);
    lines.push("  " + rosterProfiles(data, e.roster).map((r) => `${r.count}× ${r.name}`).join(", "));
    state.formations[i].upgrades.forEach((sel) => {
      const u = upgradeById[sel.upgrade];
      const v = u && u.variants.find((x) => x.id === sel.variant);
      if (v) lines.push(`  + ${v.label}${sel.chimeras ? `, ${sel.chimeras} Chimäre(n)` : ""}`);
    });
  });
  return lines.join("\n");
}

const dlg = $("#picker");
const sheet = (title, body) => {
  dlg.innerHTML = `<div class="picker-head"><h2>${esc(title)}</h2><button class="icon" type="button" data-act="close" aria-label="Schließen">×</button></div>${body}`;
  if (!dlg.open) dlg.showModal();
};

function openPicker() {
  sheet("Verband hinzufügen", base.sections.map((s) => `<section class="picker-section"><h3>${esc(s.name)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}
    ${s.formations.map((id) => {
      const f = formationById[id];
      return `<button class="pick" type="button" data-act="add" data-formation="${id}"><span class="name">${esc(f.name)}</span><span>${f.pts} Pkt.</span></button>`;
    }).join("")}</section>`).join(""));
}

function openSort() {
  const last = state.formations.length - 1;
  sheet("Verbände sortieren", `<div class="sheet-pad">
    <button type="button" data-act="sort-auto" data-mode="section">Nach Abschnitt der Armeeliste</button>
    <button type="button" data-act="sort-auto" data-mode="points">Nach Punkten (höchste zuerst)</button>
    <div>${state.formations.map((e, i) => `<div class="order-row">
      <span class="name">${esc(formationById[e.formation].name)}</span>
      <button class="icon" type="button" data-act="move" data-uid="${e.uid}" data-delta="-1" aria-label="Nach oben"${i === 0 ? " disabled" : ""}>▲</button>
      <button class="icon" type="button" data-act="move" data-uid="${e.uid}" data-delta="1" aria-label="Nach unten"${i === last ? " disabled" : ""}>▼</button>
    </div>`).join("")}</div></div>`);
}

function exchangeButtons() {
  return `<button type="button" data-act="import">Liste importieren</button>`;
}

function openLists() {
  const rows = lists.map((l) => {
    const a = armyInfo(l.army);
    return `<div class="list-row${l.id === currentId ? " cur" : ""}">
      <button class="pick" type="button" data-act="open-list" data-id="${l.id}"><span class="name">${esc(l.name)}<span class="sub">${esc(a.name)} · v${esc(a.version)}</span></span><span>${l.total || 0} Pkt.</span></button>
      <button class="icon" type="button" data-act="rename-list" data-id="${l.id}" aria-label="Umbenennen">✎</button>
      <button class="icon" type="button" data-act="copy-list" data-id="${l.id}" aria-label="Duplizieren">⧉</button>
      <button class="icon" type="button" data-act="delete-list" data-id="${l.id}" aria-label="Löschen">🗑</button>
    </div>`;
  }).join("");
  const rs = index.rulesets.map((r) => {
    const byFaction = {};
    index.armies.filter((a) => a.ruleset === r.id).forEach((a) => (byFaction[a.faction] ||= []).push(a));
    return `<section class="picker-section" data-search><h3>${esc(r.name)}</h3>${Object.entries(byFaction).map(([f, as]) =>
      `<p>${esc(f)}</p>${as.map((a) => `<button class="pick" type="button" data-act="new-list" data-army="${a.id}"><span class="name">+ ${esc(a.name)}</span><span>v${esc(a.version)}</span></button>`).join("")}`).join("")}</section>`;
  }).join("");
  sheet("Meine Listen", `<section class="picker-section">${rows}</section>
    <div class="sheet-pad">${exchangeButtons()}</div>
    <input class="sheet-search" type="search" data-act="search" placeholder="Neue Liste: Armee suchen …" aria-label="Armee suchen">${rs}`);
}

// --- Import / export ---
const IMPORT_ERRORS = {
  empty: "Nichts zum Importieren gefunden.",
  unreadable: "Das ist keine gültige Liste.",
  format: "Das ist keine gültige Liste.",
  version: "Die Liste stammt aus einer neueren Version der App. Bitte die App aktualisieren.",
  army: "Diese Armee gibt es in dieser App nicht.",
};
let pendingImport = null;

function currentExport() {
  const { total, entries } = summarize(data, state);
  return buildExport({ army: cur().army, armyVersion: base.version, name: cur().name, state, entries, total });
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "") || "liste";

function shareLink() {
  const url = `${location.origin}${location.pathname}#l=${toToken(currentExport())}`;
  const { total } = summarize(data, state);
  if (navigator.share) return navigator.share({ title: cur().name, text: `${cur().name} – ${total} Pkt.`, url }).catch(() => {});
  return navigator.clipboard.writeText(url).then(() => toast("Link kopiert"), () => toast("Kopieren nicht möglich"));
}

function exportFile() {
  const file = new File([JSON.stringify(currentExport(), null, 2)], `${slug(cur().name)}.json`, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: cur().name }).catch(() => {});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Datei gespeichert");
}

function openImport(msg) {
  sheet("Liste importieren", `<div class="sheet-pad">
    ${msg ? `<p class="problems">${esc(msg)}</p>` : ""}
    <label>Datei auswählen<input type="file" accept=".json,application/json" data-act="import-file"></label>
    <textarea class="sheet-area" id="import-text" placeholder="Oder Link / Listentext hier einfügen" aria-label="Link oder Listentext"></textarea>
    <button class="primary" type="button" data-act="import-check">Prüfen</button></div>`);
}

async function previewImport(text) {
  try {
    const obj = parseInput(text);
    if (!obj || obj.format !== "epic-army-builder") throw new Error("format");
    if (!armyInfo(obj.army)) throw new Error("army");
    const { data: d, base: b } = await loadArmy(obj.army);
    const r = sanitize(obj, d);
    const total = summarize(d, r.state).total;
    pendingImport = { army: obj.army, name: r.name, state: r.state };
    const notes = [];
    if (r.dropped) notes.push(`${r.dropped} Einträge passen nicht zu dieser Armeeversion und wurden ausgelassen.`);
    if (obj.armyVersion && obj.armyVersion !== b.version) notes.push(`Erstellt mit Version ${obj.armyVersion}, aktuell ist ${b.version}.`);
    sheet("Liste importieren", `<div class="sheet-pad">
      <div class="import-sum"><b>${esc(r.name || newName(obj.army))}</b><br>${esc(b.name)} · v${esc(b.version)}<br>${r.state.formations.length} Verbände · ${total} Pkt.</div>
      ${notes.map((n) => `<p class="problems">${esc(n)}</p>`).join("")}
      <button class="primary" type="button" data-act="import-confirm">Als neue Liste hinzufügen</button></div>`);
  } catch (err) {
    openImport(IMPORT_ERRORS[err.message] || IMPORT_ERRORS.unreadable);
  }
}

function openMore() {
  sheet("Menü", `<div class="sheet-pad">
    <button type="button" data-act="share">Liste teilen (Link)</button>
    <button type="button" data-act="export-file">Als Datei exportieren</button>
    ${exchangeButtons()}
    <button type="button" data-act="copy">Liste als Text kopieren</button>
    <button type="button" data-act="theme-toggle">Design wechseln (${currentTheme() === "dark" ? "hell" : "dunkel"})</button>
    <button type="button" class="danger" data-act="reset">Alle Verbände entfernen</button>
  </div>`);
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act], [data-view], #lists, #add, #sort, #more, #theme");
  if (!el) return;
  if (el.dataset.view) {
    view = el.dataset.view;
    localStorage.setItem("eab:view", view);
    return render();
  }
  const act = el.dataset.act || el.id;
  const target = lists.find((l) => l.id === el.dataset.id);
  switch (act) {
    case "lists":
      return openLists();
    case "open-list":
      await openList(el.dataset.id);
      dlg.close();
      return render();
    case "new-list":
      await createList(el.dataset.army);
      dlg.close();
      return render();
    case "copy-list":
      await createList(target.army, `${target.name} (Kopie)`, structuredClone(target.state));
      return openLists(), render();
    case "rename-list":
      sheet("Liste umbenennen", `<div class="sheet-pad"><input id="rename" class="sheet-search" style="margin:0;width:100%" maxlength="40" value="${esc(target.name)}" aria-label="Name der Liste">
        <button class="primary" type="button" data-act="save-name" data-id="${target.id}">Speichern</button></div>`);
      return $("#rename").select();
    case "save-name": {
      const n = $("#rename").value.trim();
      if (n) { target.name = n.slice(0, 40); persist(); render(); }
      return openLists();
    }
    case "delete-list":
      if (!confirm(`„${target.name}“ löschen?`)) return;
      lists = lists.filter((l) => l !== target);
      if (target.id === currentId) {
        if (lists.length) await openList(lists[0].id);
        else { currentId = null; state = null; persist(); }
      } else persist();
      render();
      return openLists();
    case "share":
      dlg.close();
      return shareLink();
    case "export-file":
      dlg.close();
      return exportFile();
    case "import":
      return openImport();
    case "import-check":
      return previewImport($("#import-text").value);
    case "import-confirm": {
      const p = pendingImport;
      pendingImport = null;
      await createList(p.army, p.name || undefined, p.state);
      view = "build";
      dlg.close();
      render();
      return toast("Liste importiert");
    }
    case "remove":
      e.preventDefault();
      return update(removeFormation(state, Number(el.dataset.uid)));
    case "add":
      if (!el.dataset.formation) return openPicker();
      view = "build";
      localStorage.setItem("eab:view", view);
      update(addFormation(state, el.dataset.formation));
      open.add(`f${state.nextUid - 1}`);
      dlg.close();
      return render();
    case "sort":
      return openSort();
    case "sort-auto":
      update(sortFormations(data, state, el.dataset.mode));
      return openSort();
    case "move":
      update(moveFormation(state, Number(el.dataset.uid), Number(el.dataset.delta)));
      return openSort();
    case "more":
      return openMore();
    case "theme":
    case "theme-toggle":
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
      return act === "theme-toggle" ? openMore() : undefined;
    case "close":
      return dlg.close();
    case "copy":
      dlg.close();
      return navigator.clipboard.writeText(armyText()).then(() => toast("Liste kopiert"), () => toast("Kopieren nicht möglich"));
    case "reset":
      dlg.close();
      if (state.formations.length && confirm("Alle Verbände entfernen?")) update(createState());
  }
});

document.addEventListener("input", (e) => {
  if (e.target.dataset.act !== "search") return;
  const q = e.target.value.trim().toLowerCase();
  dlg.querySelectorAll('.pick[data-act="new-list"]').forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.act === "import-file") {
    const f = el.files && el.files[0];
    if (f) f.text().then(previewImport);
    return;
  }
  const uid = Number(el.dataset.uid);
  const entry = state.formations.find((x) => x.uid === uid);
  if (!el.dataset.act || !entry) return;
  switch (el.dataset.act) {
    case "upgrade":
      update(el.value ? setUpgrade(state, uid, el.dataset.upgrade, el.value, 0) : removeUpgrade(state, uid, el.dataset.upgrade));
      break;
    case "chimeras": {
      const sel = entry.upgrades.find((x) => x.upgrade === el.dataset.upgrade);
      update(setUpgrade(state, uid, el.dataset.upgrade, sel.variant, Math.max(0, parseInt(el.value, 10) || 0)));
      break;
    }
    case "choice-single":
      update(setChoice(state, uid, el.dataset.slot, { [el.value]: Number(el.dataset.count) }));
      break;
    case "choice-mixed": {
      const def = formationById[entry.formation].units[el.dataset.slot];
      const dist = { ...(entry.choices[el.dataset.slot] || { [def.oneOf[0]]: def.count }) };
      dist[el.dataset.unit] = Math.max(0, parseInt(el.value, 10) || 0);
      update(setChoice(state, uid, el.dataset.slot, dist));
      break;
    }
  }
});

// Remember which cards are expanded across re-renders.
app.addEventListener("toggle", (e) => {
  const k = e.target.dataset && e.target.dataset.key;
  if (!k) return;
  e.target.open ? open.add(k) : open.delete(k);
}, true);

render();

// A share link opens the import preview directly (also when the app is already running).
function checkHash() {
  if (!location.hash.startsWith("#l=")) return;
  const h = location.hash;
  history.replaceState(null, "", location.pathname + location.search);
  previewImport(h);
}
checkHash();
addEventListener("hashchange", checkHash);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

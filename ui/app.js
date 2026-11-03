import {
  createState, addFormation, removeFormation, setChoice, setUpgrade, removeUpgrade,
  summarize, validate, withProfiles, rosterProfiles, matches,
} from "../engine/engine.js";
import { messageFor } from "./messages.de.js";

const ARMY = "ear-de/ig/steellegion";
const STORE = `eab:${ARMY}`;

const [base, profiles] = await Promise.all([
  fetch(`data/${ARMY}.json`).then((r) => r.json()),
  fetch(`data/${ARMY}.profiles.json`).then((r) => r.json()),
]);
const data = withProfiles(base, profiles);
const formationById = Object.fromEntries(data.formations.map((f) => [f.id, f]));
const upgradeById = Object.fromEntries(data.upgrades.map((u) => [u.id, u]));

const $ = (s) => document.querySelector(s);
const app = $("#app");
const open = new Set();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const text = (d) => (Array.isArray(d) ? d.join(" ") : d || "");
const unitName = (id) => (data.units[id] ? data.units[id].name : id);
const names = { upgrade: (id) => (upgradeById[id] ? upgradeById[id].name : id), unit: unitName };

// Persistence: drop entries that no longer exist in the data.
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && Array.isArray(s.formations)) return { ...s, formations: s.formations.filter((e) => formationById[e.formation]) };
  } catch { /* fall through */ }
  return createState();
}
let state = load();
const save = () => localStorage.setItem(STORE, JSON.stringify(state));

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
    ? `<div class="stats">${stat("Typ", p.type)}${stat("Geschw.", p.speed)}${stat("Rüstung", p.armour)}${stat("NK", p.cc)}${stat("FF", p.ff)}</div>
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

function render() {
  const { total, entries } = summarize(data, state);
  const violations = validate(data, state);
  $("#total").textContent = total;
  $("#army-name").textContent = base.name;
  $("#army-sub").textContent = `${base.faction} · v${base.version} · Strategiewert ${base.strategy}`;

  if (!state.formations.length) {
    app.innerHTML = `<p class="empty">Noch keine Verbände.<br>Tippe auf „+ Verband“, um zu beginnen.</p>`;
    return;
  }
  const problemsFor = (uid) => violations.filter((v) => (v.refs && v.refs.uid === uid) || (v.refs && v.refs.uids && v.refs.uids.includes(uid)));

  app.innerHTML = state.formations.map((entry, i) => {
    const def = formationById[entry.formation];
    const calc = entries[i];
    const probs = problemsFor(entry.uid);
    const key = `f${entry.uid}`;
    return `<details class="entry${probs.length ? " has-problem" : ""}" data-key="${key}"${open.has(key) ? " open" : ""}>
      <summary><div class="entry-head">
        <span class="name">${esc(def.name)}</span><span class="pts">${calc.pts} Pkt.</span>
        <button class="icon" type="button" aria-label="Verband entfernen" data-act="remove" data-uid="${entry.uid}">×</button>
      </div>
      ${probs.length ? `<ul class="problems">${[...new Set(probs.map((v) => messageFor(v, names)))].map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      </summary>
      <div class="entry-body">
        ${choiceControls(entry, def)}
        ${upgradeControls(entry, def)}
        <h3>Einheiten</h3>
        ${rosterProfiles(data, calc.roster).map((r) => unitBlock(entry.uid, r)).join("")}
      </div></details>`;
  }).join("");
}

function armyText() {
  const { total, entries } = summarize(data, state);
  const lines = [`${base.name} (${base.faction}) – ${total} Pkt.`, ""];
  entries.forEach((e) => {
    lines.push(`${e.name} – ${e.pts} Pkt.`);
    lines.push("  " + rosterProfiles(data, e.roster).map((r) => `${r.count}× ${r.name}`).join(", "));
  });
  return lines.join("\n");
}

function openPicker() {
  const dlg = $("#picker");
  dlg.innerHTML = `<div class="picker-head"><h2>Verband hinzufügen</h2><button class="icon" type="button" data-act="close" aria-label="Schließen">×</button></div>` +
    base.sections.map((s) => `<section class="picker-section"><h3>${esc(s.name)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}
      ${s.formations.map((id) => {
        const f = formationById[id];
        return `<button class="pick" type="button" data-act="add" data-formation="${id}"><span class="name">${esc(f.name)}</span><span>${f.pts} Pkt.</span></button>`;
      }).join("")}</section>`).join("");
  dlg.showModal();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act], #add, #copy, #reset");
  if (!el) return;
  const act = el.dataset.act || el.id;
  if (act === "remove") {
    e.preventDefault();
    update(removeFormation(state, Number(el.dataset.uid)));
  } else if (act === "add" && el.dataset.formation) {
    update(addFormation(state, el.dataset.formation));
    open.add(`f${state.nextUid - 1}`);
    $("#picker").close();
    render();
  } else if (act === "add") openPicker();
  else if (act === "close") $("#picker").close();
  else if (act === "copy") {
    navigator.clipboard.writeText(armyText()).then(() => toast("Liste kopiert"), () => toast("Kopieren nicht möglich"));
  } else if (act === "reset" && state.formations.length && confirm("Alle Verbände entfernen?")) update(createState());
});

document.addEventListener("change", (e) => {
  const el = e.target;
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

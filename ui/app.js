import {
    createState,
    addFormation,
    removeFormation,
    cloneFormation,
    moveFormation,
    sortFormations,
    setChoice,
    setUpgrade,
    removeUpgrade,
    setSize,
    sizeOf,
    unitSlots,
    summarize,
    validate,
    withProfiles,
    rosterProfiles,
    matches,
    poolSummary,
} from "../engine/engine.js";
import {
    uiText,
    messageFor
} from "./messages.js";
import {
    buildExport,
    toToken,
    parseInput,
    sanitize
} from "../engine/exchange.js";

const LEGACY = "eab:ear-de/ig/steellegion";
const index = await fetch("data/index.json").then((r) => r.json());
const RULE_DICT = await fetch("data/rules.json").then((r) => r.ok ? r.json() : {}).catch(() => ({}));
const armyInfo = (id) => index.armies.find((a) => a.id === id);

let base, data, formationById, upgradeById;
async function loadArmy(id) {
    const [b, p] = await Promise.all([
        fetch(`data/${id}.json`).then((r) => r.json()),
        fetch(`data/${id}.profiles.json`).then((r) => (r.ok ? r.json() : {
            units: {},
            specialRules: []
        })).catch(() => ({
            units: {},
            specialRules: []
        })),
    ]);
    return {
        base: b,
        data: withProfiles(b, p || {
            units: {},
            specialRules: []
        })
    };
}
async function useArmy(id) {
    ({
        base,
        data
    } = await loadArmy(id));
    formationById = Object.fromEntries(data.formations.map((f) => [f.id, f]));
    upgradeById = Object.fromEntries(data.upgrades.map((u) => [u.id, u]));
}

const $ = (s) => document.querySelector(s);
const app = $("#app");
const open = new Set();
let view = localStorage.getItem("eab:view") === "overview" ? "overview" : "build";
let showHidden = localStorage.getItem("eab:showHidden") === "true";
let keepPickerOpen = localStorage.getItem("eab:keepPickerOpen") === "true";
let lang = localStorage.getItem("eab:lang") || "de";
let defaultPointLimit = parseInt(localStorage.getItem("eab:defaultPointLimit"), 10) || null;
let sortOverviewByName = localStorage.getItem("eab:sortOverview") === "true";

const t = (key, params) => {
    let str = uiText[lang][key] || key;
    if (params) {
        Object.keys(params).forEach(p => {
            str = str.replace(`\${${p}}`, params[p]);
        });
    }
    return str;
};

let openRulesets;
try {
    const stored = localStorage.getItem("eab:openRulesets");
    openRulesets = stored ? new Set(JSON.parse(stored)) : new Set(index.rulesets.map((r) => r.id));
} catch {
    openRulesets = new Set(index.rulesets.map((r) => r.id));
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
} [c]));
const text = (d) => (Array.isArray(d) ? d.join(" ") : d || "");
const unitName = (id) => (data.units[id] ? data.units[id].name : id);
const names = {
    upgrade: (id) => (upgradeById[id] ? upgradeById[id].name : id),
    unit: unitName
};

function currentTheme() {
    return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" :
        "dark");
}

function applyTheme(th) {
    document.documentElement.dataset.theme = th;
    localStorage.setItem("eab:theme", th);
    document.querySelector('meta[name="theme-color"]').content = th === "light" ? "#f3f4f6" : "#0b0f17";
}
applyTheme(currentTheme());

let lists = [];
try {
    lists = JSON.parse(localStorage.getItem("eab:lists")) || [];
} catch {
    lists = [];
}
if (!lists.length) {
    let migrated = null;
    try {
        migrated = JSON.parse(localStorage.getItem(LEGACY));
    } catch {}
    if (migrated && Array.isArray(migrated.formations)) lists.push({
        id: "l1",
        army: "ear-de/ig/steellegion",
        name: "Stahllegion 1",
        state: migrated
    });
}
lists = lists.filter((l) => armyInfo(l.army));
lists.forEach(l => { if (l.limit === undefined) l.limit = defaultPointLimit; });
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
    state = l.state && Array.isArray(l.state.formations) ? {
        ...l.state,
        formations: l.state.formations.filter((e) => formationById[e.formation])
    } : createState();
    open.clear();
    persist();
}

async function createList(armyId, name, from) {
    let n = 1;
    while (lists.some((l) => l.id === `l${n}`)) n++;
    lists.push({ 
        id: `l${n}`, 
        army: armyId, 
        name: name || newName(armyId), 
        state: from || createState(),
        limit: defaultPointLimit
    });
    await openList(`l${n}`);
    save();
}

if (!cur() && lists.length) currentId = lists[0].id;
if (cur()) await openList(currentId);

function update(next) {
    state = next;
    save();
    render();
}

function toast(msg, actionText = null, actionCb = null) {
    const tEl = $("#toast");
    tEl.innerHTML = `<span>${msg}</span>`;
    if (actionText && actionCb) {
        const btn = document.createElement("button");
        btn.textContent = actionText;
        btn.className = "toast-action";
        btn.onclick = () => {
            actionCb();
            tEl.classList.remove("show");
        };
        tEl.appendChild(btn);
    }
    tEl.classList.add("show");
    clearTimeout(tEl.timeoutId);
    tEl.timeoutId = setTimeout(() => tEl.classList.remove("show"), 5000);
}

const stat = (label, v) => (v == null ? "" : `<span><b>${label}</b>${esc(v)}</span>`);

function weaponLine(w) {
    const modesList = w.modes || [{
        range: w.range,
        firepower: w.firepower,
        specialRules: []
    }];
    const modes = modesList.map((m) => {
        const rules = (m.specialRules || []).map((r) => esc(r.name || r)).join(", ");
        const rangeStr = m.range ? (typeof m.range === "number" || /^\d+$/.test(m.range) ?
            `${esc(m.range)} cm ` : `${esc(m.range)} `) : "";
        return `${m.join ? `<i>${esc(m.join)}</i> ` : ""}${rangeStr}${esc(m.firepower || "")}${rules ? ` (${rules})` : ""}`
            .trim();
    }).join(" ");
    return `<li><b>${w.count ? `${esc(w.count)}× ` : ""}${esc(w.name)}</b> ${modes}</li>`;
}

function unitBlock(entryUid, r) {
    const p = r.profile;
    const key = `u${entryUid}:${r.unit}`;
    const wp = p && Array.isArray(p.weapons) ? p.weapons : [];
    const sr = p && Array.isArray(p.specialRules) ? p.specialRules : [];
    const body = p ?
        `<div class="stats">${stat("Typ", p.type)}${stat("Geschw.", p.speed)}${stat("ARM", p.armour != null ? plus(p.armour) : null)}${stat("CC", p.cc != null ? plus(p.cc) : null)}${stat("FF", p.ff != null ? plus(p.ff) : null)}</div>
       ${wp.length ? `<ul class="weapons">${wp.map(weaponLine).join("")}</ul>` : ""}
       ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ""}
       ${sr.length ? `<dl class="rules">${sr.map((r2) => `<dt>${esc(r2.name || r2)}</dt>${r2.description ? `<dd>${esc(text(r2.description))}</dd>` : ""}`).join("")}</dl>` : ""}` :
        `<p class="muted">${t("no_profile")}</p>`;

    const countPrefix = r.count > 0 ? `${r.count}× ` : `<span style="visibility: hidden">0× </span>`;

    return `<details class="unit" data-key="${key}"${open.has(key) ? " open" : ""}>
    <summary><span>${countPrefix}${esc(r.name)}</span>${p && p.type ? `<span class="type">${esc(p.type)}</span>` : ""}</summary>${body}</details>`;
}

const sizeSuffix = (def, entry) => {
    const s = sizeOf(def, entry);
    return s && s.mult > 1 ? ` (${s.label.replace(/ \(.*/, "")})` : "";
};

function sizeControls(entry, def) {
    if (!def.sizes) return "";
    const curSize = sizeOf(def, entry).id;
    return `<h3>${t("size")}</h3><div class="row"><label for="s${entry.uid}">${t("size")}</label>
    <select id="s${entry.uid}" data-act="size" data-uid="${entry.uid}">
      ${def.sizes.map((s) => `<option value="${s.id}"${s.id === curSize ? " selected" : ""}>${esc(s.label)} – ${s.pts} ${t("pts")}</option>`).join("")}
    </select></div>`;
}

function choiceControls(entry, def) {
    const mult = (sizeOf(def, entry) || { mult: 1 }).mult;
    const slots = unitSlots(def, entry).map((s, i) => ({ s, i })).filter((x) => x.s.oneOf);
    if (!slots.length) return "";
    
    return `<h3>${t("choose_units")}</h3>` + slots.map(({ s, i }) => {
        const count = s.count * mult;
        const options = s.oneOf.map(u => typeof u === 'string' ? { unit: u, name: unitName(u) } : { ...u, name: unitName(u.unit) });
        const defaultUnit = options[0].unit;
        const dist = entry.choices[i] || { [defaultUnit]: count };
        
        if (!s.mixed) {
            const cur = Object.keys(dist).find((u) => dist[u] > 0) || defaultUnit;
            return `<div class="row"><label for="c-${entry.uid}-${i}">${count}×</label>
        <select id="c-${entry.uid}-${i}" data-act="choice-single" data-uid="${entry.uid}" data-slot="${i}" data-count="${count}">
          ${options.map((opt) => `<option value="${opt.unit}"${opt.unit === cur ? " selected" : ""}>${esc(opt.name)}${opt.pts ? ` (+${opt.pts} ${t("pts")})` : ""}</option>`).join("")}
        </select></div>`;
        }
        
        return options.map((opt) => `<div class="row"><label for="c-${entry.uid}-${i}-${opt.unit}">${esc(opt.name)}${opt.pts ? ` (+${opt.pts} ${t("pts")})` : ""}</label>
      <input id="c-${entry.uid}-${i}-${opt.unit}" type="number" min="0" max="${opt.max != null ? Math.min(opt.max, count) : count}" inputmode="numeric" value="${dist[opt.unit] || 0}"
        data-act="choice-mixed" data-uid="${entry.uid}" data-slot="${i}" data-unit="${opt.unit}"></div>`).join("")
            + `<p class="note">${t("sum_must_be", { count })}</p>`;
    }).join("");
}

function upgradeControls(entry, def) {
    if (!def.upgrades || !def.upgrades.length) return "";
    const canTransport = (data.transport || []).find((tr) => matches(tr.appliesTo, def));
    const mult = (sizeOf(def, entry) || { mult: 1 }).mult;
    return `<h3>${t("upgrades")}</h3>` + def.upgrades.map((id) => {
        const u = upgradeById[id];
        const sel = entry.upgrades.find((x) => x.upgrade === id);
        const v0 = u.variants[0];
        if (u.variants.length === 1 && v0.perUnit) {
            const max = v0.max != null ? ` max="${v0.max * mult}"` : "";
            return `<div class="row"><label for="u${entry.uid}-${id}">${esc(v0.label)} (+${v0.pts} je${v0.max != null ? `, 0–${v0.max * mult}` : ""})</label>
        <input id="u${entry.uid}-${id}" type="number" min="0"${max} inputmode="numeric" value="${sel ? sel.count || 1 : 0}" data-act="perunit" data-uid="${entry.uid}" data-upgrade="${id}" data-variant="${v0.id}"></div>`;
        }
        
        let html = `<div class="row"><label for="u${entry.uid}-${id}">${esc(u.name)}</label>
      <select id="u${entry.uid}-${id}" data-act="upgrade" data-uid="${entry.uid}" data-upgrade="${id}">
        <option value="">–</option>
        ${u.variants.map((v) => `<option value="${v.id}"${sel && sel.variant === v.id ? " selected" : ""}>${esc(v.label)} (+${v.pts})</option>`).join("")}
      </select>
      ${sel && u.transportable && canTransport ? `<div class="sub"><label for="c${entry.uid}-${id}">${t("chimera", {pts: canTransport.pts})}</label>
        <input id="c${entry.uid}-${id}" type="number" min="0" inputmode="numeric" value="${sel.chimeras || 0}" data-act="chimeras" data-uid="${entry.uid}" data-upgrade="${id}"></div>` : ""}
    </div>`;

        // NEU: Rendern der Mix-Felder, falls das gewählte Upgrade "oneOf" nutzt
        if (sel) {
            const v = u.variants.find(x => x.id === sel.variant);
            if (v && v.oneOf) {
                const dist = sel.choices || { [v.oneOf[0].unit]: v.count };
                html += `<div class="sub" style="flex-direction: column; align-items: stretch;">`;
                html += v.oneOf.map(opt => `<div class="row"><label for="uc-${entry.uid}-${id}-${opt.unit}">${esc(unitName(opt.unit))} ${opt.pts ? `(+${opt.pts} ${t("pts")})` : ""}</label>
                  <input id="uc-${entry.uid}-${id}-${opt.unit}" type="number" min="0" max="${opt.max || v.count}" inputmode="numeric" value="${dist[opt.unit] || 0}" data-act="upgrade-choice" data-uid="${entry.uid}" data-upgrade="${id}" data-unit="${opt.unit}"></div>`).join("");
                html += `<p class="note">${t("sum_must_be", { count: v.count })}</p></div>`;
            }
        }
        return html;
    }).join("");
}

const problemsFor = (violations, uid) => violations.filter((v) => v.refs && (v.refs.uid === uid || (v.refs.uids && v
    .refs.uids.includes(uid))));
const problemTexts = (probs) => [...new Set(probs.map((v) => messageFor(v, names, lang)))];

function btsSet(entries) {
    const max = Math.max(0, ...entries.map((e) => e.pts));
    return new Set(entries.map((e, i) => (e.pts === max && max > 0 ? i : -1)).filter((i) => i >= 0));
}
const isAir = (calc) => {
    const rp = rosterProfiles(data, calc.roster);
    return rp.length > 0 && rp.every((r) => r.profile && r.profile.type === "AC");
};
const btsBadge = () => `<span class="bts" title="Break Their Spirit">BTS</span>`;
const btsAirNote = () => `<p class="bts-note">${t("bts_air")}</p>`;

function poolBlock() {
    const pools = poolSummary(data, state).filter((p) => p.total > 0);
    if (!pools.length) return "";
    return `<section class="pools"><h3>${t("daemon_pool")}</h3>${pools.map((p) => {
        const from = p.sources.filter((s) => s.points > 0).map((s) => `${s.count}× ${esc(s.label)}`).join(", ");
        return `<div class="pool"><span class="nm">${esc(p.name)}</span><span class="pn">${p.paid} ${t("bought")}${p.free ? ` + ${p.free} ${t("free")}` : ""} = <b>${p.total}</b></span>${from ? `<small>${t("free_from")} ${from}</small>` : ""}</div>`;
    }).join("")}</section>`;
}

function renderBuild(entries, violations) {
    const bts = btsSet(entries);
    return state.formations.map((entry, i) => {
        const def = formationById[entry.formation];
        const calc = entries[i];
        const probs = problemsFor(violations, entry.uid);
        const key = `f${entry.uid}`;
        const upgCount = entry.upgrades.length;

        return `<div class="entry-wrapper${probs.length ? " has-problem" : ""}">
      <details class="entry" data-key="${key}"${open.has(key) ? " open" : ""}>
        <summary>
          <div class="entry-head">
            <span class="name">${esc(def.name)}${sizeSuffix(def, entry)}${bts.has(i) ? btsBadge() : ""}
              ${upgCount ? `<span class="badge-upg" title="${t("upgrades")}">${t("upgrade_badge", { count: upgCount })}</span>` : ""}
            </span>
            <span class="pts">${calc.pts} ${t("pts")}</span>
          </div>
          ${bts.has(i) && isAir(calc) ? btsAirNote() : ""}
          ${probs.length ? `<ul class="problems">${problemTexts(probs).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
        </summary>
        <div class="entry-body">
          ${sizeControls(entry, def)}
          ${choiceControls(entry, def)}
          ${upgradeControls(entry, def)}
          <h3>${t("units")}</h3>
          ${rosterProfiles(data, calc.roster).map((r) => unitBlock(entry.uid, r)).join("")}
        </div>
      </details>
      <div class="entry-actions">
        <button class="icon" type="button" aria-label="${t("copy")}" title="${t("copy")}" data-act="clone" data-uid="${entry.uid}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button class="icon" type="button" aria-label="${t("delete")}" data-act="remove" data-uid="${entry.uid}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    </div>`;
    }).join("");
}

const plus = (v) => (typeof v === "number" ? `${v}+` : v);

function compactStats(p) {
    if (!p) return "";
    const parts = [p.type, p.speed != null ? (typeof p.speed === "number" ? `${p.speed} cm` : p.speed) : null, p
        .armour != null ? `ARM ${plus(p.armour)}` : null, p.cc != null ? `CC ${plus(p.cc)}` : null, p.ff != null ?
        `FF ${plus(p.ff)}` : null
    ];
    return parts.filter(Boolean).join(" · ");
}

function renderRuleList(rules) {
    return rules.map((r) => {
        let name, desc;
        if (typeof r === "string") {
            name = r;
            desc = "";
        } else {
            name = r.name || String(r);
            desc = r.description ? text(r.description) : "";
        }
        if (!desc && RULE_DICT[name]) desc = text(RULE_DICT[name]);
        if (!desc) return `<div class="rule-item"><b>${esc(name)}</b></div>`;
        return `<details class="rule-item"><summary><b>${esc(name)}</b></summary><div class="rule-desc">${esc(desc)}</div></details>`;
    }).join("");
}

function globalRulesBlock(data) {
    const special = data && Array.isArray(data.specialRules) ? data.specialRules : [];
    const army = data && Array.isArray(data.armyRules) ? data.armyRules : [];
    const combined = [...army, ...special];
    const rules = combined.filter((r) => !r.formation);
    if (!rules.length) return "";
    return `<section class="ov-global-rules"><h3>${t("army_rules")}</h3><dl class="rules">${renderRuleList(rules)}</dl></section>`;
}

function formationRulesBlock(data, def) {
    const all = data && Array.isArray(data.specialRules) ? data.specialRules : [];
    const rules = all.filter((r) => r.formation === def.id);
    if (!rules.length) return "";
    return `<div class="ov-formation-rules"><b>${t("formation_rules")}</b><dl class="rules">${renderRuleList(rules)}</dl></div>`;
}

function unitRulesBlock(profile) {
    const sr = profile && Array.isArray(profile.specialRules) ? profile.specialRules : [];
    if (!sr.length) return "";
    return `<dl class="rules">${renderRuleList(sr)}</dl>`;
}

function renderOverview(entries, violations, total) {
    const bts = btsSet(entries);
    const cards = state.formations.map((entry, i) => {
        const def = formationById[entry.formation];
        const calc = entries[i];
        const probs = problemTexts(problemsFor(violations, entry.uid));

        const ups = entry.upgrades.map((sel) => {
            const u = upgradeById[sel.upgrade];
            const v = u && u.variants.find((x) => x.id === sel.variant);
            return v ?
                `${v.perUnit && sel.count > 1 ? `${sel.count}× ` : ""}${esc(v.label)}${sel.chimeras ? ` + ${sel.chimeras} ${t("chimera")}${sel.chimeras > 1 ? t("chimera_s") : ""}` : ""}` :
                null;
        }).filter(Boolean);

        let profiles = rosterProfiles(data, calc.roster);
        if (sortOverviewByName) profiles.sort((a, b) => a.name.localeCompare(b.name));

        return `<section class="ov${probs.length ? " has-problem" : ""}">
      <div class="ov-head">
        <span class="name">${esc(def.name)}${sizeSuffix(def, entry)}${bts.has(i) ? btsBadge() : ""}</span>
        <span class="pts">${calc.pts} ${t("pts")}</span>
      </div>
      ${bts.has(i) && isAir(calc) ? btsAirNote() : ""}
      <ul>
        ${profiles.map((r) => `<li>
          ${r.count > 0 ? `<span class="n">${r.count}×</span>` : `<span class="n" style="visibility: hidden;">0×</span>`}
          <span class="nm">${esc(r.name)}</span>
          <span class="st">${esc(compactStats(r.profile))}</span>
          ${r.profile && Array.isArray(r.profile.weapons) && r.profile.weapons.length ? `<ul class="wp">${r.profile.weapons.map(weaponLine).join("")}</ul>` : ""}
          ${unitRulesBlock(r.profile)}
        </li>`).join("")}
      </ul>
      ${formationRulesBlock(data, def)}
      ${ups.length ? `<div class="ups"><b>${t("upgrades_overview")}</b> ${ups.join("; ")}</div>` : ""}
      ${probs.length ? `<p class="ov-problems">${probs.map(esc).join("<br>")}</p>` : ""}
    </section>`;
    }).join("");
    return globalRulesBlock(data) + cards + poolBlock() +
        `<div class="ov-total"><span>${state.formations.length} ${t("formations")}</span><span>${total} ${t("pts")}</span></div>`;
}

function rulesetSections(prefixPlus = false) {
    return index.rulesets.filter((r) => !r.hidden && !r.disabled).map((r) => {
        const byFaction = {};
        const armies = index.armies.filter((a) => a.ruleset === r.id && !a.disabled && (showHidden || !a
            .hidden));
        armies.forEach((a) => (byFaction[a.faction] ||= []).push(a));
        const isOpen = openRulesets.has(r.id);
        return `<details class="picker-section ruleset-group" data-ruleset="${r.id}" data-search${isOpen ? " open" : ""}>
        <summary class="ruleset-head">
          <div class="ruleset-title"><span class="ruleset-caret" aria-hidden="true">▾</span><h3>${esc(r.name)}</h3></div>
          <span class="ruleset-count">${armies.length} Armeen</span>
        </summary>
        ${Object.entries(byFaction).map(([f, as]) => `
          <div class="faction-group">
            <p>${esc(f)}</p>
            ${as.map((a) => `<button class="pick" type="button" data-act="new-list" data-army="${a.id}"><span class="name">${prefixPlus ? "+ " : ""}${esc(a.name)}${a.hidden ? ` <span class="dev-badge">WIP</span>` : ""}</span><span>v${esc(a.version)}</span></button>`).join("")}
          </div>
        `).join("")}
      </details>`;
    }).join("");
}

function armyButtons() {
    return rulesetSections(false);
}

function translateStaticDOM() {
    const addBtn = document.querySelector("#add");
    if (addBtn) addBtn.textContent = t("add_formation");
    const sortBtn = document.querySelector("#sort");
    if (sortBtn) sortBtn.textContent = t("sort");
    const moreBtn = document.querySelector("#more");
    if (moreBtn) moreBtn.textContent = t("more");
    document.querySelectorAll(".tabs button").forEach(b => {
        if (b.dataset.view === "build") b.textContent = t("tab_build");
        if (b.dataset.view === "overview") b.textContent = t("tab_overview");
    });
}

function renderStart() {
    $("#total").textContent = 0;
    $("#army-name").textContent = t("army_choose");
    $("#army-sub").textContent = t("army_tap");
    document.body.classList.add("no-list");
    app.innerHTML = `<div class="start"><h2>${t("welcome")}</h2><p>${t("welcome_text")}</p>
    <input class="sheet-search" type="search" data-act="search" placeholder="${t("search_army")}" aria-label="${t("search_army")}">
    ${armyButtons()}
    <section class="picker-section"><h3>${t("get_list")}</h3><button class="pick" type="button" data-act="import"><span class="name">${t("import_list")}</span></button></section>
    <p class="patreon-note">Dieses Projekt wird durch die Community ermöglicht. <a href="https://www.patreon.com/c/LargoW" target="_blank" rel="noopener noreferrer">${t("patreon")}</a></p>
  </div>`;
}

function render() {
    translateStaticDOM();
    if (!cur()) return renderStart();
    document.body.classList.remove("no-list");
    const { total, entries } = summarize(data, state);
    const violations = validate(data, state);
    
    const currentLimit = cur().limit; // NEU
    
    const totalEl = document.querySelector("#total");
    if (currentLimit) {
        totalEl.textContent = `${total} / ${currentLimit}`;
        if (total > currentLimit) totalEl.classList.add("over-limit");
        else totalEl.classList.remove("over-limit");
    } else {
        totalEl.textContent = total;
        totalEl.classList.remove("over-limit");
    }

    if (cur().total !== total) { cur().total = total; persist(); }
    $("#army-name").textContent = cur().name;
    $("#army-sub").textContent = `${base.name} · ${base.faction} · v${base.version}`;
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
    $("#sort").disabled = state.formations.length < 2;

    if (!state.formations.length) {
        app.innerHTML = `<p class="empty">${t("no_formations")}</p>`;
        return;
    }
    app.innerHTML = view === "overview" ? renderOverview(entries, violations, total) : renderBuild(entries, violations) + poolBlock();
}

function armyText() {
    const {
        total,
        entries
    } = summarize(data, state);
    const lines = [`${base.name} (${base.faction}) – ${total} ${t("pts")}`, ""];
    entries.forEach((e, i) => {
        lines.push(
            `${e.name}${sizeSuffix(formationById[e.formation], state.formations[i])} – ${e.pts} ${t("pts")}`
            );
        lines.push("  " + rosterProfiles(data, e.roster).map((r) => `${r.count}× ${r.name}`).join(", "));
        state.formations[i].upgrades.forEach((sel) => {
            const u = upgradeById[sel.upgrade];
            const v = u && u.variants.find((x) => x.id === sel.variant);
            if (v) lines.push(
                `  + ${v.perUnit && sel.count > 1 ? `${sel.count}× ` : ""}${v.label}${sel.chimeras ? `, ${sel.chimeras} ${t("chimera")}${sel.chimeras > 1 ? t("chimera_s") : ""}` : ""}`
                );
        });
    });
    return lines.join("\n");
}

const dlg = $("#picker");
const sheet = (title, body) => {
    dlg.innerHTML = `
        <div class="picker-head">
            <h2>${esc(title)}</h2>
            <button class="icon" type="button" data-act="close" aria-label="${t("close")}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        ${body}
    `;
    if (!dlg.open) dlg.showModal();
};

function openPicker() {
    sheet(t("add_title"), `
    <input class="sheet-search" type="search" data-act="search-picker" placeholder="${t("search_formation")}" aria-label="${t("search_formation")}">
    ${base.sections.map((s) => `<section class="picker-section"><h3>${esc(s.name)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}
    ${s.formations.map((id) => {
        const f = formationById[id];
        return `<button class="pick" type="button" data-act="add" data-formation="${id}"><span class="name">${esc(f.name)}</span><span>${f.sizes ? "ab " : ""}${f.pts} ${t("pts")}</span></button>`;
    }).join("")}</section>`).join("")}`);
}

function openSort() {
    const last = state.formations.length - 1;
    sheet(t("sort_title"), `<div class="sheet-pad">
    <button type="button" data-act="sort-auto" data-mode="section">${t("sort_section")}</button>
    <button type="button" data-act="sort-auto" data-mode="points">${t("sort_points")}</button>
    <div>${state.formations.map((e, i) => `<div class="order-row">
      <span class="name">${esc(formationById[e.formation].name)}</span>
      <button class="icon" type="button" data-act="move" data-uid="${e.uid}" data-delta="-1" aria-label="${t("move_up")}"${i === 0 ? " disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
      </button>
      <button class="icon" type="button" data-act="move" data-uid="${e.uid}" data-delta="1" aria-label="${t("move_down")}"${i === last ? " disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
    </div>`).join("")}</div></div>`);
}

function exchangeButtons() {
    return `<button type="button" data-act="import">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
    ${t("import_list")}
  </button>`;
}

function openLists() {
    const rows = lists.map((l) => {
        const a = armyInfo(l.army);
        return `<div class="list-row${l.id === currentId ? " cur" : ""}">
      <button class="pick" type="button" data-act="open-list" data-id="${l.id}"><span class="name">${esc(l.name)}<span class="sub">${esc(a.name)} · v${esc(a.version)}</span></span><span>${l.total || 0} ${t("pts")}</span></button>
      <button class="icon" type="button" data-act="rename-list" data-id="${l.id}" aria-label="${t("rename")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
      </button>
      <button class="icon" type="button" data-act="copy-list" data-id="${l.id}" aria-label="${t("copy")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <button class="icon" type="button" data-act="delete-list" data-id="${l.id}" aria-label="${t("delete")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>
    </div>`;
    }).join("");
    sheet(t("my_lists"),
        `<section class="picker-section">${rows}</section>
    <div class="sheet-pad">${exchangeButtons()}</div>
    <input class="sheet-search" type="search" data-act="search" placeholder="${t("search_new_list")}" aria-label="${t("search_new_list")}">${rulesetSections(true)}
    <p class="patreon-note">Dieses Projekt wird durch die Community ermöglicht. <a href="https://www.patreon.com/c/LargoW" target="_blank" rel="noopener noreferrer">${t("patreon")}</a></p>`
        );
}

let pendingImport = null;

function currentExport() {
    const {
        total,
        entries
    } = summarize(data, state);
    return buildExport({
        army: cur().army,
        armyVersion: base.version,
        name: cur().name,
        state,
        entries,
        total
    });
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "") || "liste";

function openQr() {
    const url = `${location.origin}${location.pathname}#l=${toToken(currentExport())}`;
    let svg;
    try {
        const q = qrcode(0, "L");
        q.addData(url);
        q.make();
        svg = q.createSvgTag({
            cellSize: 4,
            margin: 4,
            scalable: true
        });
    } catch {
        return sheet("QR-Code", `<div class="sheet-pad"><p class="problems">${t("qr_too_large")}</p></div>`);
    }
    const {
        total
    } = summarize(data, state);
    sheet("QR-Code",
        `<div class="sheet-pad"><div class="qr">${svg}</div><p class="qr-cap"><b>${esc(cur().name)}</b> · ${total} ${t("pts")}<br>${t("qr_cap")}</p></div>`
        );
}

function shareLink() {
    const url = `${location.origin}${location.pathname}#l=${toToken(currentExport())}`;
    const {
        total
    } = summarize(data, state);
    if (navigator.share) return navigator.share({
        title: cur().name,
        text: `${cur().name} – ${total} ${t("pts")}`,
        url
    }).catch(() => {});
    return navigator.clipboard.writeText(url).then(() => toast(t("toast_copy_link")), () => toast(t(
    "toast_copy_fail")));
}

function exportFile() {
    const file = new File([JSON.stringify(currentExport(), null, 2)], `${slug(cur().name)}.json`, {
        type: "application/json"
    });
    if (navigator.canShare && navigator.canShare({
            files: [file]
        })) return navigator.share({
        files: [file],
        title: cur().name
    }).catch(() => {});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(t("toast_file_saved"));
}

function openImport(msg) {
    sheet(t("import_title"), `<div class="sheet-pad">
    ${msg ? `<p class="problems">${esc(msg)}</p>` : ""}
    <label>${t("import_file")}<input type="file" accept=".json,application/json" data-act="import-file"></label>
    <textarea class="sheet-area" id="import-text" placeholder="${t("import_placeholder")}" aria-label="${t("import_placeholder")}"></textarea>
    <button class="primary" type="button" data-act="import-check">${t("check")}</button></div>`);
}

async function previewImport(text) {
    const btn = document.querySelector('[data-act="import-check"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "...";
    }
    try {
        const obj = parseInput(text);
        if (!obj || obj.format !== "epic-army-builder") throw new Error("format");
        if (!armyInfo(obj.army)) throw new Error("army");
        const {
            data: d,
            base: b
        } = await loadArmy(obj.army);
        const r = sanitize(obj, d);
        const total = summarize(d, r.state).total;
        pendingImport = {
            army: obj.army,
            name: r.name,
            state: r.state
        };
        const notes = [];
        if (r.dropped) notes.push(
            `${r.dropped} Einträge passen nicht zu dieser Armeeversion und wurden ausgelassen.`);
        if (obj.armyVersion && obj.armyVersion !== b.version) notes.push(
            `Erstellt mit Version ${obj.armyVersion}, aktuell ist ${b.version}.`);
        sheet(t("import_title"), `<div class="sheet-pad">
      <div class="import-sum"><b>${esc(r.name || newName(obj.army))}</b><br>${esc(b.name)} · v${esc(b.version)}<br>${r.state.formations.length} ${t("formations")} · ${total} ${t("pts")}</div>
      ${notes.map((n) => `<p class="problems">${esc(n)}</p>`).join("")}
      <button class="primary" type="button" data-act="import-confirm">${t("import_confirm")}</button></div>`);
    } catch (err) {
        openImport(t("import_errors")[err.message] || t("import_errors").unreadable);
    }
}

function openMore() {
    sheet(t("more"), `<div class="sheet-pad">
    <button type="button" data-act="open-share">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
      ${t("menu_share")}
    </button>
    <button type="button" data-act="open-settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      ${t("menu_settings")}
    </button>
    <hr class="menu-divider">
    <a class="pick" href="https://largow.github.io/epic-guide/" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; gap:0.5rem; text-decoration:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px;"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" y1="19" x2="19" y2="13"></line><line x1="16" y1="16" x2="20" y2="20"></line><line x1="19" y1="21" x2="21" y2="19"></line><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"></polyline><line x1="5" y1="14" x2="9" y2="18"></line><line x1="7" y1="17" x2="4" y2="20"></line><line x1="3" y1="19" x2="5" y2="21"></line></svg>
      <span class="name">Epic Armageddon Helper Tool</span>
    </a>
    <hr class="menu-divider">
    <a class="patreon-btn" href="https://www.patreon.com/c/LargoW" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:0.5rem;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      ${t("patreon")}
    </a>
    <button type="button" class="danger" data-act="reset">${t("reset")}</button>
  </div>`);
}

function openShareMenu() {
    sheet(t("menu_share"), `<div class="sheet-pad">
    <button type="button" data-act="more" style="margin-bottom: 1rem;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      ${t("back_menu")}
    </button>
    <hr class="menu-divider">
    <button type="button" data-act="share">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      ${t("share_title")}
    </button>
    <button type="button" data-act="qr">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
      ${t("qr_show")}
    </button>
    <button type="button" data-act="export-file">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      ${t("export_file")}
    </button>
    ${exchangeButtons()}
    <button type="button" data-act="copy">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      ${t("copy_text")}
    </button>
  </div>`);
}

function openSettings(focusLimit = false) {
     sheet(t("menu_settings"), `<div class="sheet-pad">
    <button type="button" data-act="more" style="margin-bottom: 1rem;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      ${t("back_menu")}
    </button>
    <hr class="menu-divider">
    <button type="button" data-act="toggle-lang">${t("lang")} ${lang === "de" ? "English" : "Deutsch"}</button>
    <button type="button" data-act="theme-toggle">${t("theme")} (${currentTheme() === "dark" ? "hell" : "dunkel"})</button>
    <button type="button" data-act="toggle-hidden">${t("hidden")} ${showHidden ? t("hidden_hide") : t("hidden_show")}</button>
    <button type="button" data-act="toggle-picker">${t("picker_open")} ${keepPickerOpen ? t("on") : t("off")}</button>
    <button type="button" data-act="toggle-sort-ov">${t("sort_ov")} ${sortOverviewByName ? t("sort_ov_name") : t("sort_ov_list")}</button>
    
    <div class="settings-row">
      <label for="point-limit">${t("point_limit")}</label>
      <input type="number" id="point-limit" min="0" inputmode="numeric" value="${defaultPointLimit || ''}" placeholder="∞" data-act="set-default-limit">
    </div>
  </div>`);
}

function openListLimit() {
    const l = cur();
    if (!l) return;
    sheet(t("list_limit"), `<div class="sheet-pad">
        <label for="list-limit-input" style="font-size: 1rem;">${t("list_limit")}</label>
        <input type="number" id="list-limit-input" min="0" inputmode="numeric" value="${l.limit || ''}" placeholder="∞" style="width: 100%; font-size: 1.2rem; text-align: center; margin-bottom: 12px; min-height: 52px;">
        <button class="primary" type="button" data-act="save-list-limit">${t("save")}</button>
    </div>`);
    setTimeout(() => {
        const input = document.getElementById("list-limit-input");
        if (input) { input.focus(); input.select(); }
    }, 50);
}

document.addEventListener("click", async (e) => {
  //tap on pts opens settings for total pts
    if (e.target.closest(".bar-total")) {
        return openListLimit(true);
    }

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
            sheet(t("rename_title"),
            `<div class="sheet-pad"><input id="rename" class="sheet-search" style="margin:0;width:100%" maxlength="40" value="${esc(target.name)}" aria-label="${t("list_name")}">
        <button class="primary" type="button" data-act="save-name" data-id="${target.id}">${t("save")}</button></div>`);
            return $("#rename").select();
        case "save-name": {
            const n = $("#rename").value.trim();
            if (n) {
                target.name = n.slice(0, 40);
                persist();
                render();
            }
            return openLists();
        }
        case "delete-list":
            if (!confirm(t("delete_confirm", {
                    name: target.name
                }))) return;
            lists = lists.filter((l) => l !== target);
            if (target.id === currentId) {
                if (lists.length) await openList(lists[0].id);
                else {
                    currentId = null;
                    state = null;
                    persist();
                }
            } else persist();
            render();
            return openLists();
        case "open-share":
            return openShareMenu();
        case "share":
            dlg.close();
            return shareLink();
        case "qr":
            return openQr();
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
            return toast(t("toast_imported"));
        }
        case "clone": {
            const uid = Number(el.dataset.uid);
            open.add(`f${state.nextUid}`);
            update(cloneFormation(state, uid));
            return toast(t("toast_clone"));
        }
        case "remove": {
            const oldState = structuredClone(state);
            update(removeFormation(state, Number(el.dataset.uid)));
            return toast(t("deleted_formation"), t("undo"), () => update(oldState));
        }
        case "add":
            if (!el.dataset.formation) return openPicker();
            view = "build";
            localStorage.setItem("eab:view", view);
            update(addFormation(state, el.dataset.formation));
            open.add(`f${state.nextUid - 1}`);
            if (!keepPickerOpen) dlg.close();
            else toast(t("toast_added", {
                name: formationById[el.dataset.formation].name
            }));
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
        case "open-settings":
            return openSettings();
        case "toggle-lang":
            lang = lang === "de" ? "en" : "de";
            localStorage.setItem("eab:lang", lang);
            render();
            openSettings();
            return;
        case "theme":
        case "theme-toggle":
            applyTheme(currentTheme() === "dark" ? "light" : "dark");
            const themeBtn = document.querySelector('[data-act="theme-toggle"]');
            if (themeBtn) themeBtn.textContent =
                `${t("theme")} (${currentTheme() === "dark" ? "hell" : "dunkel"})`;
            return;
        case "toggle-hidden":
            showHidden = !showHidden;
            localStorage.setItem("eab:showHidden", String(showHidden));
            const hiddenBtn = document.querySelector('[data-act="toggle-hidden"]');
            if (hiddenBtn) hiddenBtn.textContent =
                `${t("hidden")} ${showHidden ? t("hidden_hide") : t("hidden_show")}`;
            render();
            return;
        case "toggle-picker":
            keepPickerOpen = !keepPickerOpen;
            localStorage.setItem("eab:keepPickerOpen", String(keepPickerOpen));
            const pickerBtn = document.querySelector('[data-act="toggle-picker"]');
            if (pickerBtn) pickerBtn.textContent =
                `${t("picker_open")} ${keepPickerOpen ? t("on") : t("off")}`;
            return;
        case "toggle-sort-ov":
            sortOverviewByName = !sortOverviewByName;
            localStorage.setItem("eab:sortOverview", sortOverviewByName);
            render();
            const sortOvBtn = document.querySelector('[data-act="toggle-sort-ov"]');
            if (sortOvBtn) sortOvBtn.textContent =
                `${t("sort_ov")} ${sortOverviewByName ? t("sort_ov_name") : t("sort_ov_list")}`;
            return;
        case "close":
            return dlg.close();
        case "copy":
            dlg.close();
            return navigator.clipboard.writeText(armyText()).then(() => toast(t("toast_copy_list")), () =>
                toast(t("toast_copy_fail")));
        case "reset":
            dlg.close();
            if (state.formations.length && confirm(t("reset_confirm"))) update(createState());
        case "save-list-limit": {
            const input = document.getElementById("list-limit-input");
            const val = parseInt(input.value, 10) || null;
            cur().limit = val;
            persist();
            dlg.close();
            render();
            return;
        }
    }
});

document.addEventListener("input", (e) => {
    if (e.target.dataset.act === "search-picker") {
        const q = e.target.value.trim().toLowerCase();
        document.querySelectorAll('.picker-section .pick').forEach(b => {
            b.hidden = q && !b.textContent.toLowerCase().includes(q);
        });
        document.querySelectorAll('.picker-section').forEach(s => {
            const hasVisible = Array.from(s.querySelectorAll('.pick')).some(b => !b.hidden);
            s.hidden = !hasVisible;
        });
        return;
    }
    if (e.target.dataset.act !== "search") return;
    const q = e.target.value.trim().toLowerCase();
    const matches = (b) => !q || b.textContent.toLowerCase().includes(q);
    document.querySelectorAll('.pick[data-act="new-list"]').forEach((b) => {
        b.hidden = !matches(b);
    });
    document.querySelectorAll('.picker-section[data-search]').forEach((s) => {
        let anyVisible = false;
        s.querySelectorAll('.pick[data-act="new-list"]').forEach((b) => {
            if (!b.hidden) anyVisible = true;
        });
        s.hidden = !!q && !anyVisible;
        if (s.tagName === "DETAILS") s.open = q ? anyVisible : openRulesets.has(s.dataset.ruleset);
    });
    document.querySelectorAll('.picker-section[data-search] .faction-group').forEach((fg) => {
        let anyVisible = false;
        fg.querySelectorAll('.pick[data-act="new-list"]').forEach((b) => {
            if (!b.hidden) anyVisible = true;
        });
        fg.hidden = !!q && !anyVisible;
    });
});

document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.act === "set-default-limit") {
        defaultPointLimit = parseInt(el.value, 10) || null;
        if (defaultPointLimit) localStorage.setItem("eab:defaultPointLimit", defaultPointLimit);
        else localStorage.removeItem("eab:defaultPointLimit");
        return;
    }
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
            update(el.value ? setUpgrade(state, uid, el.dataset.upgrade, el.value, 0) : removeUpgrade(state,
                uid, el.dataset.upgrade));
            break;
        case "size":
            update(setSize(state, uid, el.value));
            break;
        case "perunit": {
            const n = Math.max(0, parseInt(el.value, 10) || 0);
            update(n ? setUpgrade(state, uid, el.dataset.upgrade, el.dataset.variant, 0, n) : removeUpgrade(
                state, uid, el.dataset.upgrade));
            break;
        }
        case "chimeras": {
            const sel = entry.upgrades.find((x) => x.upgrade === el.dataset.upgrade);
            update(setUpgrade(state, uid, el.dataset.upgrade, sel.variant, Math.max(0, parseInt(el.value, 10) ||
                0)));
            break;
        }
        case "upgrade-choice": {
            const sel = entry.upgrades.find((x) => x.upgrade === el.dataset.upgrade);
            if (!sel) break;
            const choices = { ...(sel.choices || {}) };
            choices[el.dataset.unit] = Math.max(0, parseInt(el.value, 10) || 0);
            update(setUpgrade(state, uid, el.dataset.upgrade, sel.variant, sel.chimeras || 0, sel.count || 1, choices));
            break;
        }
        case "choice-single":
            update(setChoice(state, uid, el.dataset.slot, {
                [el.value]: Number(el.dataset.count)
            }));
            break;
        case "choice-mixed": {
            const def = unitSlots(formationById[entry.formation], entry)[el.dataset.slot];
            const slotCount = def.count * (sizeOf(formationById[entry.formation], entry) || { mult: 1 }).mult;
            
            // FIX: Prüfen, ob oneOf[0] ein String oder ein Objekt ist
            const defaultUnit = typeof def.oneOf[0] === 'string' ? def.oneOf[0] : def.oneOf[0].unit;
            
            const dist = { ...(entry.choices[el.dataset.slot] || { [defaultUnit]: slotCount }) };
            dist[el.dataset.unit] = Math.max(0, parseInt(el.value, 10) || 0);
            update(setChoice(state, uid, el.dataset.slot, dist));
            break;
        }
    }
});

document.addEventListener("toggle", (e) => {
    const k = e.target.dataset && e.target.dataset.key;
    if (k) {
        e.target.open ? open.add(k) : open.delete(k);
        return;
    }
    const rs = e.target.dataset && e.target.dataset.ruleset;
    if (rs) {
        const searchInput = document.querySelector('.sheet-search[data-act="search"]');
        if (searchInput && searchInput.value.trim()) return;
        if (e.target.open) openRulesets.add(rs);
        else openRulesets.delete(rs);
        localStorage.setItem("eab:openRulesets", JSON.stringify([...openRulesets]));
    }
}, true);

render();

function checkHash() {
    if (!location.hash.startsWith("#l=")) return;
    const h = location.hash;
    history.replaceState(null, "", location.pathname + location.search);
    previewImport(h);
}
checkHash();
addEventListener("hashchange", checkHash);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
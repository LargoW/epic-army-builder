# Canonical army format (draft v0)

A superset of the adam77/snapfire NetEA model (ids + reference-based constraints), extended for
upgrade variants and replacements as found in Ragnarök lists.

```jsonc
{
  "schema": 0,
  "ruleset": "ear-de",              // ear-de | netea | epic-uk
  "lang": "de",
  "id": "ear-de/ig/steellegion",
  "name": "Stahllegion",
  "faction": "Astra Militarum",
  "version": "1.0.2",               // normalised; source string kept in source.version
  "source": { "file": "lists_de/IG/steellegion.json", "version": "1.0.Beta-2", "commit": "<sha>" },
  "strategy": 2,
  "initiative": [ { "formations": "titan-navy", "value": "1+" }, { "formations": "*", "value": "2+" } ],

  "sections": [
    { "id": "company", "name": "Kompanie Verbände", "formations": ["f-rhq", "f-mech-co"] }
  ],

  "formations": [
    {
      "id": "f-rhq", "name": "Regimentshauptquartier", "pts": 375,
      "units": [ { "unit": "Oberbefehlshaber der Stahllegion", "count": 1 } ],
      "unitsText": "Ein Stahllegion Oberbefehlshaber ...",   // display text from source
      "upgrades": ["u-fire-support"],                         // allowed upgrade ids
      "tags": ["company"]
    }
  ],

  "upgrades": [
    {
      "id": "u-fire-support", "name": "Feuerunterstützung",
      "variants": [ { "label": "2 Trupps", "pts": 50 }, { "label": "4 Trupps", "pts": 100 } ],
      "kind": "add"                // add | replace | per-unit
    }
  ],

  "formationConstraints": [
    { "id": "c-support", "from": ["f-..."], "forEach": ["f-rhq"], "max": 2 },
    { "id": "c-navy", "from": ["f-..."], "maxPercent": 33 },
    { "id": "c-orbital", "from": ["f-orbital"], "max": 1, "perArmy": true }
  ],

  "upgradeConstraints": [
    { "id": "c-up-per-formation", "from": "*", "appliesTo": "company", "maxTotal": 3 },
    { "id": "c-up-once", "from": "*", "max": 1, "perFormation": true }
  ]
}
```

## Profiles
`convert/build-profiles.js` resolves every unit id against the source lists (`from` + German `name`)
and writes `<army>.profiles.json`: stats, weapons with modes and rule texts (weapon strings
`"Name|count|extraRule"` are expanded), special-rule texts and army-level rules. The engine merges it
with `withProfiles()`; unit type and rule names then come from the profile, so `excludeRules` uses the
source language rule names (e.g. `Beritten`, `Sprungmodule`). The profiles file is generated, so
regenerate it after pulling new sources.

## Notes
- Points are integers; no strings. Variants cover "50 for two / 100 for four" and "25 each" (`perUnit`).
- Constraints reference ids or tags; `*` means all. Semantics follow adam77's:
  `max`/`min`, `maxPercent` of army points, `perArmy`, `forEach` (limit per selected parent formation),
  `appliesTo` (formation ids or tags).
- Engine validation returns `{ code, params, refs }` so the UI can localise messages.
## Unit-level model (decided)
Unit profiles and weapons must be shown later, so formations are modelled as unit slots, not text.
- `formation.units`: `[{ "unit": "<unit id>", "count": n }]`. Unit ids resolve to profiles
  (stats, weapons, special rules) in a per-faction unit table.
- Upgrades have `effects` that act on that roster, so the engine can compute the final unit list:
  - `add`: `{ "op": "add", "unit": "hellhound", "count": 1 }`
  - `replace`: `{ "op": "replace", "from": "basilisk", "to": "manticore", "count": 6 }`
    (the formation must contain at least `count` of `from`)
- Choice slots (e.g. "6 Basilisks or 6 Manticores") are `choice` groups with exactly one pick,
  instead of adam77's "min 1 / max 1" upgrade constraints.

## Computed transport (Steel Legion)
Chimeras are not fixed upgrade variants (as in the snapfire lists, e.g. "4 Fire Support Squads,
2 Chimeras"). Instead, `transport` rules compute the limit:
`allowedChimeras = ceil(count of INF units in the formation that can be carried / 2)`,
where Rough Riders and units with Mounted / Jump Pack are not carriable. Each chimera costs
25 pts. Declared as data: `{ "op": "transport", "vehicle": "chimera", "capacity": 2,
"carries": { "type": "INF", "excludeUnits": ["rough-rider"], "excludeRules": ["mounted", "jump-pack"] },
"pts": 25 }`.

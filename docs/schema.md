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

## Notes
- Points are integers; no strings. Variants cover "50 for two / 100 for four" and "25 each" (`perUnit`).
- Constraints reference ids or tags; `*` means all. Semantics follow adam77's:
  `max`/`min`, `maxPercent` of army points, `perArmy`, `forEach` (limit per selected parent formation),
  `appliesTo` (formation ids or tags).
- Engine validation returns `{ code, params, refs }` so the UI can localise messages.
- Open: how to model replacements ("Ersetze 6 Basilisken durch Mantikors") and transport rules
  ("*" upgrades adding Chimären). Decide with the Steel Legion overlay.

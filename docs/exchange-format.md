# Austauschformat für Listen (Version 1)

Spezifikation des Formats, mit dem Epic Armeebauer Listen exportiert und importiert.
Gedacht für den Austausch zwischen Telefonen und für Begleit-Apps (z. B. Turnier-App).
Implementierung: [`engine/exchange.js`](../engine/exchange.js), Tests: [`test/exchange.test.js`](../test/exchange.test.js).

## Transportwege

| Weg | Inhalt |
|---|---|
| **Datei** | `<listenname>.json`, UTF-8, Inhalt = Export-Objekt (siehe unten) |
| **Link / QR-Code** | `https://largow.github.io/epic-army-builder/#l=<token>` |
| **Einfügen** | Die App akzeptiert beim Import JSON-Text, einen vollständigen Link oder nur das `<token>` |

**Token:** Export-Objekt ohne die rein anzeigenden Felder (`points` und `formations[].name/points`),
als kompaktes JSON, UTF-8, dann **Base64url** (RFC 4648 §5: `-` und `_` statt `+` und `/`, ohne `=`-Padding).

Der Hash-Teil (`#l=…`) wird nie an einen Server gesendet. Beim Öffnen zeigt die App eine Vorschau und
legt die Liste erst nach Bestätigung als **neue** Liste an; bestehende Listen werden nie überschrieben.

## Export-Objekt

```json
{
  "format": "epic-army-builder",
  "version": 1,
  "ruleset": "ear-de",
  "army": "ear-de/ig/steellegion",
  "armyVersion": "1.0.2",
  "name": "Stahllegion 1",
  "points": 675,
  "formations": [
    {
      "formation": "rhq",
      "name": "Regimentshauptquartier",
      "points": 375,
      "choices": {},
      "upgrades": [
        { "upgrade": "fire-support", "variant": "2", "chimeras": 0 }
      ]
    }
  ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `format` | ja | Konstante `"epic-army-builder"`. Andere Werte werden abgelehnt. |
| `version` | ja | Format-Version (Ganzzahl). Eine Version größer als die der App wird abgelehnt. |
| `ruleset` | nein | Regelwerk, Präfix von `army` (z. B. `ear-de`; später z. B. NetEA). |
| `army` | ja | Armee-ID wie in `data/index.json`, z. B. `ear-de/ig/steellegion`. |
| `armyVersion` | nein | Version der Armeeliste, mit der erstellt wurde. Weicht sie ab, zeigt die App einen Hinweis. |
| `name` | nein | Listenname, höchstens 40 Zeichen. Fehlt er, vergibt die App einen (z. B. „Stahllegion 2“). |
| `points` | nein | Gesamtpunkte, **nur zur Anzeige**. Die App rechnet beim Import selbst neu. |
| `formations` | ja | Verbände in Spielreihenfolge. |

### Verband (`formations[]`)

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `formation` | ja | Verbands-ID aus der Armeedatei (`data/<army>.json`). Unbekannte IDs werden verworfen. |
| `name`, `points` | nein | Nur zur Anzeige (Klartextname, Verbandspunkte inkl. Aufwertungen). |
| `choices` | nein | Auswahl bei Platzhaltern im Verband: `{ "<slotIndex>": { "<unitId>": <anzahl> } }`. Der Slot-Index ist die Position in `units` des Verbands. |
| `upgrades` | nein | Gewählte Aufwertungen. |

### Aufwertung (`upgrades[]`)

| Feld | Bedeutung |
|---|---|
| `upgrade` | Aufwertungs-ID aus der Armeedatei. |
| `variant` | Varianten-ID der Aufwertung (bestimmt Kosten und Effekt). |
| `chimeras` | Anzahl hinzugefügter Chimären (Ganzzahl ≥ 0), 0 wenn nicht zutreffend. |

## Verhalten beim Import

- Verbands- oder Aufwertungs-IDs, die es in der aktuellen Armeedatei nicht gibt, werden **verworfen**;
  die App meldet die Anzahl („n Einträge passen nicht zu dieser Armeeversion“).
- Zahlen werden auf Ganzzahlen ≥ 0 begrenzt, Namen auf 40 Zeichen gekürzt.
- Punkte und Regelverstöße werden aus den Armeedaten **neu berechnet**; mitgelieferte Punktwerte werden ignoriert.
- Eine unbekannte `army` führt zu „Diese Armee gibt es in dieser App nicht.“

## Hinweise für Begleit-Apps

- Zum **Erzeugen** reicht: `format`, `version`, `army`, `formations[].formation` (+ `choices`/`upgrades`, falls zutreffend).
- Zum **Lesen** ohne Armeedaten sind `name`, `points` und `formations[].name/points` direkt verwendbar.
  Für Einheiten und Aufwertungen im Klartext die Armeedatei laden:
  `https://largow.github.io/epic-army-builder/data/<army>.json` (Profile: `<army>.profiles.json`).
- Unbekannte zusätzliche Felder sollten beim Lesen ignoriert und – wenn möglich – beim Zurückschreiben erhalten werden.
- Das Format ist versioniert. Abwärtsinkompatible Änderungen erhöhen `version`.
- Ein QR-Code fasst je nach Listengröße etwa 1–3 KB; sehr große Listen müssen als Datei oder Link geteilt werden.

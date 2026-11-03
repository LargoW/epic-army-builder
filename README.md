# Epic Army Builder

Mobile-first, offline-capable army list builder for Epic: Armageddon variants
(EA-R / Ragnarök German, NetEA, Epic UK). Replaces adam77's snapfire builder.

## Pipeline

```
sources/ (pinned, read-only)      convert/ (Node)        data/ (canonical)      engine/ -> ui/
  ragnarok-de  (lists_de)    -->  convert-ear.js   --+
  adam77/snapfire (NetEA)    -->  convert-adam.js  --+-> data/<ruleset>/<army>.json
  epic-uk (later)            -->  convert-uk.js    --+
```

- `sources/` is never edited by hand. Contents are fetched by a sync script (not yet written) and
  pinned in `sources.lock.json`. The folder itself is git-ignored.
- Ragnarök lists are prose-only, so the EA-R converter takes a hand-maintained overlay per army
  (`convert/overlays/`) for limits and structured upgrades. Overlays survive re-conversion.
- `engine/` is DOM-free (state, points, validation), tested with Node.
- `ui/` is plain HTML/CSS/JS, mobile-first, PWA/offline, no build step.

## Phases

1. Conception and architecture  <- current
2. Prototype: one army (Steel Legion, `lists_de/IG/steellegion.json`, released v1.0.2)
3. UI refinement -> **Alpha**
4. Intensive testing
5. Port more armies
6. Testing -> **Beta**
7. Hypercare
8. Release and lifecycle

See [docs/schema.md](docs/schema.md) for the canonical data format (draft).

## Run locally

The app uses ES modules and fetch, so serve the folder over HTTP (not file://), e.g. `python -m http.server 8123` or any static server, then open http://localhost:8123/. Tests: `node --test test/`.


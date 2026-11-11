# Gipfelkreuze der Ostalpen

Übersicht aller Gipfelkreuze der Ostalpen als Karte und Tabelle. Die Daten aktualisieren sich jeden Montag automatisch.

**Seite:** https://rascra-tech.github.io/gipfelkreuze/ · direkt zu einer Gruppe: `…/gipfelkreuze/#karwendel`

## Quellen

| Quelle | Was | Stand 8.11.2026 |
|---|---|---|
| **OpenStreetMap** (Geofabrik-Auszug `alps-latest.osm.pbf`) | Gipfel mit `summit:cross`, Kreuze (`man_made=cross`, Wegkreuze, Gedenkkreuze) bis 150 m neben einem Gipfel, Kreuze ab 1200 m ohne Gipfel | 4.510 |
| **BEV** (amtlich, Österreich) | DLM 7000 Namen, Tabelle `NAM_7600_SONSTIGE_P`, `OBJEKTART` = „2313 Gipfelkreuz“; Stichtag wird aus dem BEV-Datenkatalog gelesen | 307 (Stichtag 23.03.2026) |
| **Wikidata** | Objekte „Gipfelkreuz“ (Q361665), mit Errichtungsjahr | 86 |
| **Bayern** (LDBV, ATKIS Basis-DLM) | Kreuze (bauwerksfunktion 1760 = Bildstock/Wegekreuz/Gipfelkreuz) höchstens 100 m neben einem OSM-Gipfel | 507 |
| **Wikimedia Commons** (seit 11.11.2026) | Fotos aus den Kategorien „Summit crosses in …“ (AT, DE, IT, SLO, CH, LI), aufgenommen ≤ 100 m (Objektort ≤ 150 m) neben einem OSM-Gipfel; Kreuz = dieser Gipfel, mit Link auf ein Foto | ~520 Gipfel, davon ~120 neu |

Zusammen rund 4.840 Gipfelkreuze, davon gut 330 nicht in OSM (Häkchen „nur ‚fehlt in OSM‘“).

## Ablauf der Aktualisierung (`.github/workflows/update.yml`)

1. Geofabrik-Auszug der Alpen laden (~2,3 GB).
2. `scripts/extract_osm.py` filtert Gipfel und Kreuze (pyosmium, ~5–7 min).
3. `scripts/update_osm.mjs --from-file …` → `site/data/osm.json`
4. `scripts/update_by.py …` → `site/data/by.geojson` (bayerischer WFS + Gipfel aus Schritt 2)
5. `scripts/update_bev.py` → `site/data/bev.geojson` (nur bei neuem Stichtag)
6. `scripts/update_wikidata.mjs` → `site/data/wikidata.geojson`
7. `scripts/update_commons.py …` → `site/data/commons.geojson` (Commons-API + Gipfel aus Schritt 2)
8. Daten committen, Seite auf GitHub Pages veröffentlichen.

Schlägt ein Schritt fehl, bleibt die letzte Version dieser Quelle erhalten.

Früher wurden die OSM-Daten über 84 Overpass-Kacheln abgefragt. Das dauerte ~100 s pro Kachel (~2,5 h), und die öffentlichen Overpass-Server sind laut Betreiber nicht für automatisierte Massenabfragen gedacht. Die Live-Abfrage auf der Seite (von Hand ausgelöst) nutzt Overpass weiterhin.

## Dateien

| Datei | Zweck |
|---|---|
| `site/index.html`, `site/app.js` | Webseite |
| `site/core.js` | Gemeinsame Logik: Regionen, Overpass-Abfrage, Zusammenführung |
| `scripts/extract_osm.py` | OSM-Auszug → Gipfel und Kreuze (JSON im Overpass-Format) |
| `scripts/update_osm.mjs` | Gipfelkreuze aus OSM → `site/data/osm.json` |
| `scripts/update_by.py` | Bayern → `site/data/by.geojson` |
| `scripts/update_bev.py` | BEV → `site/data/bev.geojson` |
| `scripts/update_wikidata.mjs` | Wikidata → `site/data/wikidata.geojson` |
| `scripts/update_commons.py` | Wikimedia Commons → `site/data/commons.geojson` |

## Anpassen

- **Abstand und Mindesthöhe (OSM):** `DEFAULTS` in `site/core.js`; Bayern: `RADIUS` in `scripts/update_by.py`.
- **Zeitplan:** `cron` in `.github/workflows/update.yml`.
- **Regionen:** `GROUPS` in `site/core.js` (Rechtecke: Name, Süd, West, Nord, Ost).

## Lokal testen

```
pip install pyproj osmium certifi
curl -L -o alps.osm.pbf https://download.geofabrik.de/europe/alps-latest.osm.pbf
python scripts/extract_osm.py alps.osm.pbf osm_elements.json
node scripts/update_osm.mjs --from-file osm_elements.json
python scripts/update_by.py osm_elements.json
python scripts/update_bev.py
node scripts/update_wikidata.mjs
python scripts/update_commons.py osm_elements.json
python -m http.server -d site      # dann http://localhost:8000
```

## Lizenzen

Daten: © OpenStreetMap-Mitwirkende (ODbL) · © BEV (CC BY 4.0) · Wikidata (CC0) · © Bayerische Vermessungsverwaltung – www.geodaten.bayern.de (CC BY 4.0) · Wikimedia Commons (nur Aufnahmeort und Link; die Fotos stehen unter ihren eigenen freien Lizenzen). Die zusammengeführte Liste fällt wegen der OSM-Daten unter die ODbL.

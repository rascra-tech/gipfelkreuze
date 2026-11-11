#!/usr/bin/env python3
"""Gipfelkreuze aus Fotos auf Wikimedia Commons.

Durchläuft die Kategorien „Summit crosses in <Land>“ (Ostalpen-Länder) samt Unterkategorien, deren Name
cross/kreuz/croce/križ enthält, und liest die Koordinaten der Fotos. Ein Foto zählt als Gipfelkreuz, wenn seine
Koordinate höchstens RADIUS_CAM Meter (Aufnahmeort) bzw. RADIUS_OBJ Meter (Objektort) neben einem OSM-Gipfel
liegt – Fotos aus dem Tal fallen so heraus. Das Kreuz wird auf den Gipfel gesetzt; Name und Höhe kommen vom
Gipfel, dazu ein Link auf ein Foto.

Aufruf:  python scripts/update_commons.py osm_elements.json     (Datei von scripts/extract_osm.py)
Daten:   Wikimedia Commons (Fotos unter den jeweiligen freien Lizenzen; hier nur Ort und Link);
         Gipfel © OpenStreetMap-Mitwirkende (ODbL)
"""
import datetime, json, math, os, re, sys, time, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
COUNTRIES = ["Austria", "Germany", "Italy", "Slovenia", "Switzerland", "Liechtenstein"]
KEEP = re.compile(r"cross|kreuz|croce|križ", re.I)
CROSS_WORD = re.compile(r"cross|kreuz|croce|križ", re.I)
S, W, N, E = 45.55, 9.25, 48.10, 16.20          # Ostalpen (wie GROUPS[0] in site/core.js)
RADIUS_CAM, RADIUS_OBJ = 100, 150
MIN_FEATURES = 200                               # weniger → etwas ist schiefgegangen, Datei bleibt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data", "commons.geojson")
UA = {"User-Agent": "gipfelkreuze-uebersicht/1.0 (https://rascra-tech.github.io/gipfelkreuze/; GitHub Action)"}
try:
    import ssl, certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None


def api(**p):
    p.update(format="json", formatversion="2", maxlag="5")
    url = API + "?" + urllib.parse.urlencode(p)
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60, context=CTX) as r:
                d = json.load(r)
            if d.get("error", {}).get("code") == "maxlag":
                raise RuntimeError("maxlag")
            return d
        except Exception as e:
            print(f"  Wiederholung ({e})")
            time.sleep(5 * (i + 1))
    raise SystemExit("Commons-API nicht erreichbar – Datei bleibt unverändert.")


def members(cat, typ):
    cont, out = {}, []
    while True:
        d = api(action="query", list="categorymembers", cmtitle=cat, cmtype=typ, cmlimit="500", **cont)
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            return out
        cont = d["continue"]


def dist(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))


def main(elements_file):
    els = json.load(open(elements_file, encoding="utf-8"))["elements"]
    peaks = [(x["lat"], x["lon"], x.get("tags", {}), x["id"]) for x in els
             if x.get("tags", {}).get("natural") in ("peak", "volcano") and "lat" in x]
    grid = {}
    for p in peaks:
        grid.setdefault((int(p[0] * 100), int(p[1] * 100)), []).append(p)

    # 1) Kategorien und Dateien
    seen, files, queue = set(), set(), [f"Category:Summit crosses in {c}" for c in COUNTRIES]
    while queue:
        cat = queue.pop()
        if cat in seen:
            continue
        seen.add(cat)
        files.update(members(cat, "file"))
        queue += [c for c in members(cat, "subcat") if KEEP.search(c) and c not in seen]
    print(f"Commons: {len(seen)} Kategorien, {len(files)} Dateien")

    # 2) Koordinaten (Aufnahmeort = primary, Objektort = secondary)
    titles, coords = sorted(files), {}
    for i in range(0, len(titles), 50):
        d = api(action="query", prop="coordinates", titles="|".join(titles[i:i + 50]), coprimary="all", colimit="max")
        for pg in d["query"]["pages"]:
            for c in pg.get("coordinates", []):
                coords.setdefault(pg["title"], []).append((c["lat"], c["lon"], bool(c.get("primary"))))
    print(f"  mit Koordinaten: {len(coords)}")

    # 3) Foto → nächster OSM-Gipfel
    by_peak = {}
    for title, cs in coords.items():
        obj = [c for c in cs if not c[2]]
        use, radius = (obj, RADIUS_OBJ) if obj else (cs, RADIUS_CAM)
        best = None
        for lat, lon, _ in use:
            if not (S <= lat <= N and W <= lon <= E):
                continue
            a, b = int(lat * 100), int(lon * 100)
            for p in (p for i in (a - 1, a, a + 1) for j in (b - 1, b, b + 1) for p in grid.get((i, j), [])):
                d = dist((lat, lon), p)
                if d <= radius and (best is None or d < best[0]):
                    best = (d, p)
        if best:
            # Rang fürs Beispielfoto: Objektort vor Aufnahmeort, „cross/kreuz“ im Titel, dann Abstand
            rank = (0 if obj else 1, 0 if CROSS_WORD.search(title) else 1, best[0])
            by_peak.setdefault(best[1][3], []).append((rank, title, best[1]))

    feats = []
    for k, fotos in by_peak.items():
        _, title, p = min(fotos)
        n = len(fotos)
        t = p[2]
        try:
            ele = round(float(str(t.get("ele", "")).replace(",", ".").split()[0]))
        except (ValueError, IndexError):
            ele = None
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p[1], 6), round(p[0], 6)]},
                      "properties": {"id": f"node/{k}", "name": t.get("name"), "ele": ele,
                                     "commons": title.removeprefix("File:"), "photos": n}})
    if len(feats) < MIN_FEATURES:
        raise SystemExit(f"Nur {len(feats)} Gipfel gefunden – Datei bleibt unverändert.")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                   "license": "Wikimedia Commons (Fotos unter freien Lizenzen, hier nur Ort und Link)",
                   "radius_m": {"aufnahmeort": RADIUS_CAM, "objektort": RADIUS_OBJ}, "features": feats}, f, ensure_ascii=False)
    print(f"Fertig: {len(feats)} Gipfel mit Gipfelkreuz-Foto auf Commons → {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])

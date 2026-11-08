#!/usr/bin/env python3
"""Lädt das BEV-Produkt „DLM 7000 Namen“ (GeoPackage), filtert die Gipfelkreuze
(F_CODE 2313) und schreibt sie als GeoJSON in WGS84 nach site/data/bev.geojson.

Daten: © BEV – Bundesamt für Eich- und Vermessungswesen, CC BY 4.0 (data.bev.gv.at)

Aufruf:  python scripts/update_bev.py            (neuesten Stand suchen)
         BEV_URL=https://…gpkg python scripts/update_bev.py   (bestimmte Datei)
         python scripts/update_bev.py --file lokale.gpkg       (lokale Datei)
"""
import json, os, re, sqlite3, struct, sys, tempfile, datetime, urllib.request

BASE = "https://data.bev.gv.at/download/DLM/"
# Datenkatalog (GeoNetwork/Elasticsearch). Die Verzeichnisliste unter BASE liefert 403 (geprüft 8.11.2026),
# deshalb werden die Stichtage aus den Download-Links im Katalog gelesen.
CATALOG = "https://data.bev.gv.at/geonetwork/srv/api/search/records/_search"
KNOWN_DATES = ["20260323", "20250929", "20250325"]   # Rückfall, falls der Katalog nicht erreichbar ist
F_CODE = 2313
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data", "bev.geojson")
META = os.path.join(ROOT, "site", "data", "bev_meta.json")
UA = {"User-Agent": "gipfelkreuze-uebersicht (GitHub Action)"}


try:                                   # lokal unter Windows fehlt Python teils die Zwischenzertifikat-Kette
    import ssl, certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None


def http(url, method="GET", data=None, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})}, method=method, data=data)
    return urllib.request.urlopen(req, timeout=120, context=CTX)


def candidate_dates():
    dates = set(KNOWN_DATES)
    try:
        q = json.dumps({"size": 200, "query": {"query_string": {"query": "\"Geographische Namen\""}},
                        "_source": ["link"]}).encode()
        txt = http(CATALOG, "POST", q, {"Content-Type": "application/json",
                                         "Accept": "application/json"}).read().decode("utf-8", "ignore")
        found = set(re.findall(r"DLM_7000_NAMEN_(\d{8})\.gpkg", txt))
        print("Stichtage im BEV-Katalog:", ", ".join(sorted(found, reverse=True)) or "keine")
        dates |= found
    except Exception as e:
        print("BEV-Katalog nicht lesbar:", e)
    return sorted(dates, reverse=True)


def find_latest():
    for d in candidate_dates():
        url = f"{BASE}DLM_{d}/DLM_7000_NAMEN_{d}.gpkg"
        try:
            with http(url, "HEAD") as r:
                if r.status == 200:
                    return url, d
        except Exception:
            continue
    raise SystemExit("Keine BEV-Datei gefunden. BEV_URL setzen.")


def download(url, path):
    print("Lade", url)
    with http(url) as r, open(path, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    print(f"  {os.path.getsize(path) / 1e6:.1f} MB")


def gpkg_point(blob):
    """GeoPackage-Geometrie → (x, y) des (ersten) Punkts."""
    if not blob or blob[:2] != b"GP":
        return None
    flags = blob[3]
    env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get((flags >> 1) & 7, 0)
    wkb = blob[8 + env:]
    bo = "<" if wkb[0] == 1 else ">"
    gtype = (struct.unpack(bo + "I", wkb[1:5])[0] & 0x0FFFFFFF) % 1000
    if gtype == 1:                       # Point
        return struct.unpack(bo + "dd", wkb[5:21])
    if gtype == 4:                       # MultiPoint → erster Punkt
        inner = wkb[9:]
        bo2 = "<" if inner[0] == 1 else ">"
        return struct.unpack(bo2 + "dd", inner[5:21])
    return None


def extract(path):
    from pyproj import Transformer
    con = sqlite3.connect(path)
    feats, transformers = [], {}
    tables = con.execute("SELECT c.table_name, g.column_name, g.srs_id FROM gpkg_contents c "
                         "JOIN gpkg_geometry_columns g ON g.table_name = c.table_name "
                         "WHERE c.data_type = 'features'").fetchall()
    for table, geom, srs in tables:
        cols = {r[1].upper(): r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
        # Stand 23.03.2026: Gipfelkreuze stehen in NAM_7600_SONSTIGE_P mit OBJEKTART = "2313 Gipfelkreuz"
        # (F_CODE dort nur 7611/7603). F_CODE = 2313 bleibt als Rückfall für ältere/andere Ausgaben.
        conds = []
        if "OBJEKTART" in cols:
            conds.append(f'CAST("{cols["OBJEKTART"]}" AS TEXT) LIKE \'{F_CODE}%\'')
        if "F_CODE" in cols:
            conds.append(f'CAST("{cols["F_CODE"]}" AS INTEGER) = {F_CODE}')
        if not conds:
            continue
        sel = [cols.get("NAME"), cols.get("HOEHE_BODEN") or cols.get("HOEHE"),
               cols.get("OBJEKTART") or cols.get("F_NAME"), cols.get("OBJECTID")]
        sql = (f'SELECT "{geom}", ' + ", ".join(f'"{c}"' if c else "NULL" for c in sel) +
               f' FROM "{table}" WHERE ' + " OR ".join(conds))
        rows = con.execute(sql).fetchall()
        if not rows:
            continue
        if srs not in transformers:
            transformers[srs] = Transformer.from_crs(f"EPSG:{srs}", "EPSG:4326", always_xy=True)
        tr = transformers[srs]
        for blob, name, hoehe, fname, oid in rows:
            pt = gpkg_point(blob)
            if not pt:
                continue
            lon, lat = tr.transform(*pt)
            try:
                ele = round(float(hoehe)) if hoehe not in (None, "") else None
            except (TypeError, ValueError):
                ele = None
            if ele is not None and (ele <= 0 or ele >= 9999):   # 9999/0 = unbekannt
                ele = None
            feats.append({"type": "Feature",
                          "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                          "properties": {"id": f"{table}/{oid}", "name": (name or "").strip() or None,
                                         "ele": ele, "objektart": fname}})
        print(f"  {table}: {len(rows)} Gipfelkreuze (EPSG:{srs})")
    con.close()
    return feats


def main():
    local = sys.argv[sys.argv.index("--file") + 1] if "--file" in sys.argv else None
    old = json.load(open(META, encoding="utf-8")) if os.path.exists(META) else {}
    if local:
        url, date, path = local, "lokal", local
    else:
        url = os.environ.get("BEV_URL")
        date = re.search(r"(\d{8})", url).group(1) if url and re.search(r"(\d{8})", url) else None
        if not url:
            url, date = find_latest()
        if old.get("source") == url and os.path.exists(OUT) and "--force" not in sys.argv:
            print("BEV-Daten unverändert (", date, ") – nichts zu tun.")
            return
        path = os.path.join(tempfile.gettempdir(), "bev_namen.gpkg")
        download(url, path)
    feats = extract(path)
    if not feats:
        raise SystemExit("Keine Gipfelkreuze (F_CODE 2313) in der Datei gefunden – Datei bleibt unverändert.")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({"source": url, "stichtag": date, "count": len(feats),
               "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
               "license": "© BEV, CC BY 4.0"}, open(META, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Fertig: {len(feats)} BEV-Gipfelkreuze → {OUT}")


if __name__ == "__main__":
    main()

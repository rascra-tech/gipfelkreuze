#!/usr/bin/env python3
"""Gipfelkreuze in den bayerischen Alpen aus dem amtlichen ATKIS Basis-DLM (Bayerische Vermessungsverwaltung).

Das Basis-DLM unterscheidet Gipfelkreuze nicht von Wegkreuzen und Bildstöcken: alle stehen als
AX_SonstigesBauwerkOderSonstigeEinrichtung mit bauwerksfunktion 1760 („Bildstock, Wegekreuz, Gipfelkreuz“),
in Bayern rund 67.500 Stück (Stand 8.11.2026). Als Gipfelkreuz gilt hier ein solches Kreuz, das höchstens
RADIUS Meter neben einem OSM-Gipfel steht. Name und Höhe kommen vom Gipfel.

Aufruf:  python scripts/update_by.py osm_elements.json     (Datei von scripts/extract_osm.py)
Daten:   © Bayerische Vermessungsverwaltung – www.geodaten.bayern.de, CC BY 4.0; Gipfel © OpenStreetMap (ODbL)
"""
import json, math, os, re, sys, urllib.parse, urllib.request, datetime

WFS = "https://geoservices.bayern.de/wfs/v1/ogc_atkis_basisdlm.cgi"
BBOX = (47.25, 9.90, 47.85, 13.15)          # bayerischer Alpenraum (S, W, N, E)
RADIUS = 100                                # Meter zwischen Kreuz und Gipfel
PAGE = 5000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data", "by.geojson")
UA = {"User-Agent": "gipfelkreuze-uebersicht (GitHub Action)"}
try:
    import ssl, certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None


def wfs_crosses():
    s, w, n, e = BBOX
    flt = ('<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:adv="http://www.adv-online.de/namespaces/adv/gid/7.1" '
           'xmlns:gml="http://www.opengis.net/gml/3.2"><fes:And><fes:PropertyIsEqualTo><fes:ValueReference>adv:bauwerksfunktion'
           '</fes:ValueReference><fes:Literal>1760</fes:Literal></fes:PropertyIsEqualTo><fes:BBOX><fes:ValueReference>adv:position'
           f'</fes:ValueReference><gml:Envelope srsName="urn:ogc:def:crs:EPSG::4326"><gml:lowerCorner>{s} {w}</gml:lowerCorner>'
           f'<gml:upperCorner>{n} {e}</gml:upperCorner></gml:Envelope></fes:BBOX></fes:And></fes:Filter>')
    pts, start = [], 0
    while True:
        q = urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                                    "typeNames": "adv:AX_SonstigesBauwerkOderSonstigeEinrichtung",
                                    "namespaces": "xmlns(adv,http://www.adv-online.de/namespaces/adv/gid/7.1)",
                                    "srsName": "urn:ogc:def:crs:EPSG::4326", "count": PAGE, "startIndex": start,
                                    "filter": flt})
        xml = urllib.request.urlopen(urllib.request.Request(f"{WFS}?{q}", headers=UA), timeout=300,
                                     context=CTX).read().decode("utf-8", "ignore")
        if "ExceptionReport" in xml[:500]:
            raise SystemExit("WFS-Fehler: " + re.sub(r"\s+", " ", xml)[:400])
        page = re.findall(r'gml:id="([^"]+)"[\s\S]*?<gml:pos>([-\d.]+) ([-\d.]+)</gml:pos>', xml)
        pts += [(oid, float(lat), float(lon)) for oid, lat, lon in page if not oid.startswith("o")]
        print(f"  WFS ab {start}: {len(page)} Kreuze")
        if len(page) < PAGE:
            return pts
        start += PAGE


def dist(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))


def main(elements_file):
    els = json.load(open(elements_file, encoding="utf-8"))["elements"]
    s, w, n, e = BBOX
    peaks = [(x["lat"], x["lon"], x.get("tags", {})) for x in els
             if x.get("tags", {}).get("natural") in ("peak", "volcano") and "lat" in x
             and s - 0.01 <= x["lat"] <= n + 0.01 and w - 0.01 <= x["lon"] <= e + 0.01]
    grid = {}
    for p in peaks:
        grid.setdefault((int(p[0] * 100), int(p[1] * 100)), []).append(p)
    crosses = wfs_crosses()
    print(f"Bayern: {len(crosses)} Kreuze (1760) im Alpenraum, {len(peaks)} OSM-Gipfel")
    feats, seen = [], set()
    for oid, lat, lon in crosses:
        a, b = int(lat * 100), int(lon * 100)
        cand = [p for i in (a - 1, a, a + 1) for j in (b - 1, b, b + 1) for p in grid.get((i, j), [])]
        best = min(cand, key=lambda p: dist((lat, lon), p), default=None)
        if not best or dist((lat, lon), best) > RADIUS:
            continue
        key = (round(best[0], 5), round(best[1], 5))
        if key in seen:                       # zwei Kreuze am selben Gipfel → einmal zählen
            continue
        seen.add(key)
        t = best[2]
        try:
            ele = round(float(str(t.get("ele", "")).replace(",", ".").split()[0]))
        except (ValueError, IndexError):
            ele = None
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                      "properties": {"id": oid, "name": t.get("name"), "ele": ele}})
    if not feats:
        raise SystemExit("Keine Gipfelkreuze gefunden – Datei bleibt unverändert.")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                   "license": "© Bayerische Vermessungsverwaltung – www.geodaten.bayern.de, CC BY 4.0", "radius_m": RADIUS,
                   "features": feats}, f, ensure_ascii=False)
    print(f"Fertig: {len(feats)} Gipfelkreuze in Bayern (Kreuz ≤ {RADIUS} m neben Gipfel) → {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])

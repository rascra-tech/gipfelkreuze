#!/usr/bin/env python3
"""Liest einen OSM-Auszug (.osm.pbf, z. B. Geofabrik alps-latest) und schreibt alle Gipfel und Kreuze
im Format der Overpass-API (elements mit lat/lon bzw. center und tags) als JSON.
Ersetzt die wöchentlichen Overpass-Abfragen (zu langsam, öffentliche Server nicht für Automatik gedacht).

Aufruf:  python scripts/extract_osm.py alps-latest.osm.pbf osm_elements.json
Daten:   © OpenStreetMap-Mitwirkende, ODbL
"""
import json, re, sys, time
import osmium

S, W, N, E = 45.55, 9.25, 48.10, 16.20          # Ostalpen (wie GROUPS[0] in site/core.js)
CROSS = {("man_made", "cross"), ("man_made", "summit_cross"), ("historic", "wayside_cross")}
GK = re.compile("gipfelkreuz", re.I)


def inside(lat, lon):
    return S <= lat <= N and W <= lon <= E


def is_cross(t):
    if t.get("summit:cross", "no") != "no":
        return True
    if (("man_made", t.get("man_made")) in CROSS or ("historic", t.get("historic")) in CROSS
            or (t.get("historic") == "memorial" and t.get("memorial") == "cross")):
        return True
    return bool(GK.search(t.get("name", "") + t.get("description", "")))


def main(src, dst):
    t0 = time.time()
    out, way_refs = [], {}

    # 1) Gipfel (nur Knoten)
    fp = (osmium.FileProcessor(src, osmium.osm.NODE)
          .with_filter(osmium.filter.TagFilter(("natural", "peak"), ("natural", "volcano"))))
    for o in fp:
        if inside(o.location.lat, o.location.lon):
            out.append({"type": "node", "id": o.id, "lat": round(o.location.lat, 7),
                        "lon": round(o.location.lon, 7), "tags": dict(o.tags)})
    peaks = len(out)
    print(f"Gipfel: {peaks} ({time.time() - t0:.0f} s)")

    # 2) Kreuze (Knoten und Wege; Wege bekommen in Schritt 3 einen Mittelpunkt)
    fp = (osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY)
          .with_filter(osmium.filter.KeyFilter("summit:cross", "man_made", "historic", "name")))
    for o in fp:
        t = dict(o.tags)
        if t.get("natural") in ("peak", "volcano") or not is_cross(t):
            continue
        if o.is_node():
            if inside(o.location.lat, o.location.lon):
                out.append({"type": "node", "id": o.id, "lat": round(o.location.lat, 7),
                            "lon": round(o.location.lon, 7), "tags": t})
        else:
            way_refs[o.id] = ([n.ref for n in o.nodes], t)
    print(f"Kreuz-Knoten: {len(out) - peaks}, Kreuz-Wege: {len(way_refs)} ({time.time() - t0:.0f} s)")

    # 3) Mittelpunkte der Wege aus ihren Knoten
    if way_refs:
        need = {r for refs, _ in way_refs.values() for r in refs}
        loc = {}
        for o in osmium.FileProcessor(src, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need)):
            loc[o.id] = (o.location.lat, o.location.lon)
        for wid, (refs, t) in way_refs.items():
            pts = [loc[r] for r in refs if r in loc]
            if not pts:
                continue
            lat, lon = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            if inside(lat, lon):
                out.append({"type": "way", "id": wid, "center": {"lat": round(lat, 7), "lon": round(lon, 7)}, "tags": t})

    with open(dst, "w", encoding="utf-8") as f:
        json.dump({"source": src, "elements": out}, f, ensure_ascii=False)
    print(f"Fertig: {len(out)} Elemente → {dst} ({time.time() - t0:.0f} s)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])

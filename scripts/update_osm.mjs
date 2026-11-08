// Ermittelt die Gipfelkreuze der Ostalpen aus OpenStreetMap und schreibt site/data/osm.json.
//
// Normalbetrieb (GitHub Action):  node scripts/update_osm.mjs --from-file osm_elements.json
//   Die Datei erzeugt scripts/extract_osm.py aus dem Geofabrik-Auszug alps-latest.osm.pbf.
//   (Die frühere Abfrage über 84 Overpass-Kacheln dauerte ~100 s pro Kachel = ~2,5 h, und die
//   öffentlichen Overpass-Server sind laut Betreiber nicht für automatisierte Massenabfragen gedacht.)
//
// Test für einen kleinen Bereich über Overpass:  node scripts/update_osm.mjs --bbox 47.52,12.12,47.63,12.45
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { GROUPS, DEFAULTS, buildQuery, overpass, mergeElements, pack } from '../site/core.js';

const OUT = new URL('../site/data/osm.json', import.meta.url);
const argOf = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const entries = new Map();
let bbox = GROUPS[0].slice(1), source;

if (argOf('--from-file')) {
  const file = argOf('--from-file');
  const { elements, source: pbf } = JSON.parse(readFileSync(file, 'utf8'));
  const t0 = Date.now();
  mergeElements(entries, elements, DEFAULTS);
  source = 'Geofabrik-Auszug ' + (pbf || file).split(/[\\/]/).pop();
  console.log(`${elements.length} Elemente → ${entries.size} Gipfelkreuze (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} else if (argOf('--bbox')) {
  bbox = argOf('--bbox').split(',').map(Number);
  const els = await overpass(buildQuery(bbox.join(','), DEFAULTS),
    { headers: { 'User-Agent': 'gipfelkreuze-uebersicht (Test)' }, log: console.log });
  mergeElements(entries, els, DEFAULTS);
  source = 'Overpass (Testbereich)';
  console.log(`${els.length} Elemente → ${entries.size} Gipfelkreuze`);
} else {
  console.error('Aufruf: node scripts/update_osm.mjs --from-file osm_elements.json   oder   --bbox s,w,n,e');
  process.exit(2);
}

if (entries.size === 0) { console.error('Keine Daten erhalten – Datei bleibt unverändert.'); process.exit(1); }
mkdirSync(new URL('../site/data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  updated: new Date().toISOString(), source, bbox, options: DEFAULTS, failedTiles: [],
  fields: ['id', 'lat', 'lon', 'name', 'ele', 'src', 'crossId', 'wikipedia'],
  entries: [...entries.values()].map(pack),
}));
console.log(`Fertig: ${entries.size} Gipfelkreuze → site/data/osm.json`);

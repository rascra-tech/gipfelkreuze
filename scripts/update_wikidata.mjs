// Holt alle Gipfelkreuze (Wikidata Q361665 „summit cross“) der Ostalpen und schreibt site/data/wikidata.geojson.
// Daten: Wikidata, CC0. Aufruf: node scripts/update_wikidata.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { GROUPS } from '../site/core.js';

const OUT = new URL('../site/data/wikidata.geojson', import.meta.url);
const [s, w, n, e] = GROUPS[0].slice(1);
const query = `
SELECT ?item ?itemLabel ?lat ?lon ?ele ?inception ?peakEle ?article WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?c .
    bd:serviceParam wikibase:cornerSouthWest "Point(${w} ${s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${e} ${n})"^^geo:wktLiteral . }
  ?item wdt:P31 wd:Q361665 .
  BIND(geof:latitude(?c) AS ?lat) BIND(geof:longitude(?c) AS ?lon)
  OPTIONAL { ?item wdt:P2044 ?ele }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P706|wdt:P361 ?peak . ?peak wdt:P2044 ?peakEle }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en,it,sl". }
}`;

const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
let json;
for (let i = 0; i < 3; i++) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'gipfelkreuze-uebersicht (GitHub Action)', Accept: 'application/sparql-results+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    json = await r.json(); break;
  } catch (err) { console.log(`Versuch ${i + 1} fehlgeschlagen: ${err.message}`); await new Promise(r => setTimeout(r, 10000)); }
}
if (!json) { console.error('Wikidata nicht erreichbar – Datei bleibt unverändert.'); process.exit(1); }

const byItem = new Map();
for (const b of json.results.bindings) {
  const id = b.item.value.split('/').pop();
  if (byItem.has(id)) continue;                       // mehrere Treffer durch OPTIONALs → ersten nehmen
  const label = b.itemLabel?.value;
  const ele = b.ele ? Math.round(+b.ele.value) : b.peakEle ? Math.round(+b.peakEle.value) : null;
  const year = b.inception ? +b.inception.value.slice(0, 4) : null;
  const article = b.article ? 'de:' + decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' ') : null;
  byItem.set(id, { type: 'Feature',
    geometry: { type: 'Point', coordinates: [+(+b.lon.value).toFixed(6), +(+b.lat.value).toFixed(6)] },
    properties: { id, name: label && label !== id ? label.replace(/^Gipfelkreuz (auf dem |der |des )?/i, '') || label : null,
      ele, year: year && year > 1000 ? year : null, wikidata: id, wikipedia: article } });
}
if (byItem.size === 0) { console.error('Keine Gipfelkreuze erhalten – Datei bleibt unverändert.'); process.exit(1); }
mkdirSync(new URL('../site/data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', updated: new Date().toISOString(),
  license: 'Wikidata, CC0', features: [...byItem.values()] }));
console.log(`Fertig: ${byItem.size} Gipfelkreuze aus Wikidata.`);

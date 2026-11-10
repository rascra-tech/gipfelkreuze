// Gemeinsame Logik für die Webseite (Browser) und das Update-Skript (Node, GitHub Action).
// Keine DOM-Zugriffe in dieser Datei.

// Gebirgsgruppen der Ostalpen als Rechteck-Näherung [Name, Süd, West, Nord, Ost]
export const GROUPS = [
  ['Ostalpen gesamt', 45.55, 9.25, 48.10, 16.20],
  ['— Nördliche Kalkalpen —'],
  ['Bregenzerwaldgebirge', 47.30, 9.75, 47.55, 10.10],
  ['Allgäuer Alpen', 47.25, 10.00, 47.58, 10.62],
  ['Ammergauer Alpen', 47.45, 10.60, 47.65, 11.10],
  ['Lechtaler Alpen', 47.10, 10.15, 47.38, 10.85],
  ['Wetterstein & Mieminger Kette', 47.30, 10.85, 47.48, 11.25],
  ['Bayerische Voralpen', 47.55, 11.10, 47.75, 12.10],
  ['Karwendel', 47.30, 11.15, 47.55, 11.75],
  ['Rofan & Brandenberger Alpen', 47.40, 11.70, 47.62, 12.05],
  ['Kaisergebirge', 47.52, 12.12, 47.63, 12.45],
  ['Chiemgauer Alpen', 47.60, 12.30, 47.80, 12.85],
  ['Loferer & Leoganger Steinberge', 47.45, 12.55, 47.62, 12.85],
  ['Berchtesgadener Alpen', 47.45, 12.80, 47.70, 13.15],
  ['Tennengebirge & Hagengebirge', 47.45, 13.10, 47.60, 13.40],
  ['Dachstein & Gosaukamm', 47.40, 13.40, 47.60, 13.85],
  ['Salzkammergut-Berge', 47.60, 13.15, 47.90, 13.95],
  ['Totes Gebirge', 47.55, 13.75, 47.78, 14.30],
  ['Ennstaler Alpen / Gesäuse', 47.50, 14.30, 47.70, 14.85],
  ['Hochschwab', 47.50, 14.85, 47.70, 15.35],
  ['Ybbstaler & Türnitzer Alpen', 47.70, 14.70, 47.95, 15.60],
  ['Rax, Schneeberg & Wiener Alpen', 47.60, 15.55, 48.05, 16.15],
  ['— Zentralalpen —'],
  ['Rätikon', 46.95, 9.55, 47.15, 10.00],
  ['Silvretta & Verwall', 46.80, 9.95, 47.15, 10.45],
  ['Samnaun & Sesvenna', 46.65, 10.20, 47.05, 10.60],
  ['Ötztaler Alpen', 46.65, 10.60, 47.12, 11.10],
  ['Stubaier Alpen', 46.85, 11.00, 47.25, 11.45],
  ['Tuxer & Zillertaler Alpen', 46.90, 11.45, 47.25, 12.10],
  ['Kitzbüheler Alpen', 47.20, 11.75, 47.525, 12.70],   // Nord 47.525: Pölven (Schwoicher/Söller Kreuz) gehört dazu
  ['Hohe Tauern', 46.85, 12.10, 47.25, 13.55],
  ['Niedere Tauern', 47.10, 13.40, 47.45, 14.75],
  ['Gurktaler Alpen & Nockberge', 46.75, 13.55, 47.05, 14.30],
  ['Seetaler, Kor- & Saualpe', 46.70, 14.30, 47.15, 15.10],
  ['Ortler & Adamello', 46.00, 10.30, 46.65, 10.90],
  ['Sarntaler Alpen', 46.55, 11.20, 46.85, 11.55],
  ['— Südalpen —'],
  ['Brenta & Gardaseeberge', 45.70, 10.60, 46.30, 11.10],
  ['Dolomiten', 46.20, 11.40, 46.80, 12.55],
  ['Karnische Alpen & Gailtaler', 46.50, 12.40, 46.80, 13.80],
  ['Julische Alpen', 46.20, 13.40, 46.55, 14.10],
  ['Karawanken & Steiner Alpen', 46.30, 13.75, 46.60, 14.95],
];

export const DEFAULTS = { radius: 150, minEleFree: 1200 };

// Quellen-Kennungen
export const SRC = { TAG: 1, NEAR: 2, FREE: 3, BEV: 4, WD: 5, BY: 6 };
export const SRC_LABEL = { 1: 'Kreuz-Tag', 2: 'Kreuz-Punkt', 3: 'ohne Gipfel', 4: 'BEV', 5: 'Wikidata', 6: 'Bayern' };
export const SRC_COLOR = { 1: '#1f7a4d', 2: '#d08a1e', 3: '#7b6fb0', 4: '#2563a8', 5: '#a3366f', 6: '#0f766e' };
export const OSM_SRC = [SRC.TAG, SRC.NEAR, SRC.FREE];

export const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Kreuze, die weiter als das von jedem Gruppen-Rechteck entfernt liegen, bekommen keine Gruppe
export const GROUP_MAX_KM = 30;

// Abstand eines Punktes zu einem Gruppen-Rechteck in km (0 = innerhalb)
export function boxDistKm(lat, lon, g) {
  const dLat = lat < g[1] ? g[1] - lat : lat > g[3] ? lat - g[3] : 0;
  const dLon = lon < g[2] ? g[2] - lon : lon > g[4] ? lon - g[4] : 0;
  return Math.hypot(dLat * 111.2, dLon * 111.2 * Math.cos(lat * Math.PI / 180));
}

// Gebirgsgruppe eines Punktes: das kleinste Rechteck, in dem er liegt;
// liegt er in einer Lücke zwischen den Rechtecken, das nächstgelegene (bis GROUP_MAX_KM).
export function groupOf(lat, lon) {
  let best = '', area = 1e9, near = '', nearKm = GROUP_MAX_KM;
  for (const g of GROUPS.slice(1)) {
    if (g.length === 1) continue;
    const d = boxDistKm(lat, lon, g);
    if (d === 0) {
      const a = (g[3] - g[1]) * (g[4] - g[2]);
      if (a < area) { area = a; best = g[0]; }
    } else if (d < nearKm) { nearKm = d; near = g[0]; }
  }
  return best || near;
}

export function dist(a, b) {
  const R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const num = v => { const f = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(f) ? null : f; };

export function buildQuery(bb, opt = DEFAULTS) {
  const R = Math.max(20, Math.min(500, opt.radius | 0 || 150));
  const minFree = opt.minEleFree | 0 || 1200;
  return `[out:json][timeout:180];
(
  nwr["summit:cross"]["summit:cross"!="no"](${bb});
  nwr["man_made"="summit_cross"](${bb});
  nwr["name"~"gipfelkreuz",i](${bb});
  nwr["description"~"gipfelkreuz",i](${bb});
)->.direct;
(
  nwr["man_made"="cross"](${bb});
  nwr["historic"="wayside_cross"](${bb});
  nwr["historic"="memorial"]["memorial"="cross"](${bb});
)->.allc;
node(around.allc:${R})["natural"~"^(peak|volcano)$"]->.pk;
nwr.allc(around.pk:${R})->.cnear;
nwr.allc(if: number(t["ele"]) >= ${minFree})->.chigh;
(.direct; .pk; .cnear; .chigh;);
out center tags;`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function overpass(q, { headers = {}, log = () => {}, timeoutMs = 200000 } = {}) {
  const errs = [];
  for (let round = 0; round < 3; round++) {
    for (const srv of SERVERS) {
      const host = new URL(srv).host;
      try {
        // Ohne Zeitlimit blieb ein hängender Server für immer stehen (Test 8.11.2026) → nach timeoutMs abbrechen
        const r = await fetch(srv, { method: 'POST', body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
          signal: AbortSignal.timeout(timeoutMs) });
        if (r.status === 429 || r.status === 504) { errs.push(host + ' ' + r.status); await sleep(5000 * (round + 1)); continue; }
        if (!r.ok) { errs.push(host + ' ' + r.status); continue; }
        const j = await r.json();
        if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) { errs.push(host + ': ' + j.remark.slice(0, 80)); continue; }
        return j.elements || [];
      } catch (e) { errs.push(host + ': ' + e.message); }
      log('  Fehler: ' + errs[errs.length - 1]);
    }
  }
  throw new Error(errs.join(' | '));
}

export function tiles(s, w, n, e, step = 0.5) {
  const out = [];
  for (let a = s; a < n - 1e-9; a += step)
    for (let b = w; b < e - 1e-9; b += step)
      out.push([a, b, Math.min(a + step, n), Math.min(b + step, e)].map(x => +x.toFixed(4)));
  return out;
}

const isPeak = t => t.natural === 'peak' || t.natural === 'volcano';
const isCrossObj = t => ['cross', 'summit_cross'].includes(t.man_made) || t.historic === 'wayside_cross' ||
  (t.historic === 'memorial' && t.memorial === 'cross') || /gipfelkreuz/i.test((t.name || '') + (t.description || ''));

// Fügt Overpass-Elemente in die Map `entries` (key -> Eintrag) ein.
// Eintrag: { id, lat, lon, name, ele, src:[...], crossId, wikipedia }
export function mergeElements(entries, els, opt = DEFAULTS) {
  const R = Math.max(20, Math.min(500, opt.radius | 0 || 150));
  const minFree = opt.minEleFree | 0 || 1200;
  const items = els.map(el => ({ id: el.type + '/' + el.id, lat: el.lat ?? el.center?.lat, lon: el.lon ?? el.center?.lon, t: el.tags || {} }))
    .filter(x => x.lat != null);
  const peaks = items.filter(x => isPeak(x.t));
  const crosses = items.filter(x => !isPeak(x.t) && isCrossObj(x.t));
  const used = new Set();
  // Gitter (0,01°) statt Vergleich jeder mit jedem – nötig für die ganzen Ostalpen auf einmal
  const G = 0.01, cell = (la, lo) => Math.floor(la / G) + ':' + Math.floor(lo / G);
  const grid = new Map();
  for (const c of crosses) { const k = cell(c.lat, c.lon); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  const nearby = (pt, r) => {
    const out = [], dLa = Math.ceil(r / 1100) , dLo = Math.ceil(r / 700);
    const a = Math.floor(pt.lat / G), b = Math.floor(pt.lon / G);
    for (let i = a - dLa; i <= a + dLa; i++) for (let j = b - dLo; j <= b + dLo; j++) { const l = grid.get(i + ':' + j); if (l) out.push(...l); }
    return out;
  };

  for (const p of peaks) {
    const tagged = p.t['summit:cross'] && p.t['summit:cross'] !== 'no';
    const ownCross = isCrossObj(p.t);
    let near = null, nd = 1e9;
    for (const c of nearby(p, R)) { const d = dist(p, c); if (d < nd) { nd = d; near = c; } }
    const hasNear = near && nd <= R;
    if (!tagged && !ownCross && !hasNear) continue;
    const src = new Set(entries.get(p.id)?.src || []);
    if (tagged) src.add(SRC.TAG);
    if (ownCross || hasNear) src.add(SRC.NEAR);
    entries.set(p.id, { id: p.id, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6),
      name: p.t.name || (hasNear && near.t.name) || '(ohne Namen)', ele: num(p.t.ele),
      wikipedia: p.t.wikipedia || null, src: [...src].sort(), crossId: hasNear ? near.id : null });
    if (hasNear) used.add(near.id);
  }
  // Gitter über die bisherigen Einträge für die Doppelt-Prüfung der freien Kreuze
  const eg = new Map();
  const entryGrid = {
    add: en => { const k = cell(en.lat, en.lon); if (!eg.has(k)) eg.set(k, []); eg.get(k).push(en); },
    near: (pt, r) => { const out = [], a = Math.floor(pt.lat / G), b = Math.floor(pt.lon / G), dLa = Math.ceil(r / 1100), dLo = Math.ceil(r / 700);
      for (let i = a - dLa; i <= a + dLa; i++) for (let j = b - dLo; j <= b + dLo; j++) { const l = eg.get(i + ':' + j); if (l) out.push(...l); } return out; },
  };
  for (const en of entries.values()) entryGrid.add(en);
  for (const c of crosses) {
    if (used.has(c.id) || entries.has(c.id)) continue;
    const ele = num(c.t.ele);
    const named = /gipfelkreuz/i.test((c.t.name || '') + (c.t.description || '')) || c.t.man_made === 'summit_cross' || c.t['summit:cross'];
    if (!named && !(ele != null && ele >= minFree)) continue;
    let dup = false;
    for (const en of entryGrid.near(c, R)) if (en.crossId === c.id || dist(en, c) <= R) { dup = true; break; }
    if (dup) continue;
    const en = { id: c.id, lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6),
      name: c.t.name || (c.t.inscription || '').slice(0, 40) || 'Kreuz (ohne Gipfelname)',
      ele, wikipedia: null, src: [SRC.FREE], crossId: c.id };
    entries.set(c.id, en); entryGrid.add(en);
  }
}

// Punkte einer Zusatzquelle (GeoJSON-Features) mit bestehenden Einträgen abgleichen.
// Liegt ein Eintrag näher als `radius`, bekommt er die Quelle dazu; sonst wird ein neuer Eintrag angelegt.
// Properties: name, ele, optional year (Errichtungsjahr), wikidata (Q-Nummer), wikipedia ("de:Titel").
const PREFIX = { [SRC.BEV]: 'bev/', [SRC.WD]: 'wd/', [SRC.BY]: 'by/' };
const FALLBACK = { [SRC.BEV]: 'Gipfelkreuz (BEV)', [SRC.WD]: 'Gipfelkreuz (Wikidata)', [SRC.BY]: 'Gipfelkreuz (Bayern)' };
export function mergePoints(entries, features, src, radius = 250) {
  let matched = 0, added = 0;
  const list = [...entries.values()];
  for (const ft of features) {
    const [lon, lat] = ft.geometry.coordinates, p = ft.properties || {};
    const pt = { lat, lon };
    let best = null, bd = 1e9;
    for (const en of list) {
      if (Math.abs(en.lat - lat) > 0.01 || Math.abs(en.lon - lon) > 0.015) continue;
      const d = dist(en, pt); if (d < bd) { bd = d; best = en; }
    }
    if (best && bd <= radius) {
      if (!best.src.includes(src)) best.src = [...best.src, src];
      if (!best.ele && p.ele) best.ele = p.ele;
      if (p.name && (best.name.startsWith('(') || best.name.startsWith('Kreuz (') || best.name.startsWith('Gipfelkreuz ('))) best.name = p.name;
      if (src === SRC.BEV) best.bevName = p.name || null;
      if (p.year && !best.year) best.year = p.year;
      if (p.wikidata && !best.wikidata) best.wikidata = p.wikidata;
      if (p.wikipedia && !best.wikipedia) best.wikipedia = p.wikipedia;
      matched++;
    } else {
      const key = PREFIX[src] + (p.id ?? `${lat},${lon}`);
      const en = { id: key, lat, lon, name: p.name || FALLBACK[src], ele: p.ele || null,
        wikipedia: p.wikipedia || null, src: [src], crossId: null, bevName: src === SRC.BEV ? p.name || null : null,
        year: p.year || null, wikidata: p.wikidata || null };
      entries.set(key, en); list.push(en); added++;
    }
  }
  return { matched, added };
}
export const mergeBev = (entries, features, radius = 250) => mergePoints(entries, features, SRC.BEV, radius);

// Kompaktes Format für data/osm.json
export const pack = en => [en.id, en.lat, en.lon, en.name, en.ele, en.src, en.crossId, en.wikipedia];
export const unpack = a => ({ id: a[0], lat: a[1], lon: a[2], name: a[3], ele: a[4], src: a[5], crossId: a[6], wikipedia: a[7] });

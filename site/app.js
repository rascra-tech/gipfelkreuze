import { GROUPS, SRC, SRC_LABEL, SRC_COLOR, OSM_SRC, groupOf, dist, num, buildQuery, overpass, tiles,
         mergeElements, mergeBev, mergePoints, unpack } from './core.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let entries = new Map(), bevFeatures = [];
const extra = { [SRC.WD]: [], [SRC.BY]: [] };   // weitere Zusatzquellen (Wikidata, Bayern)
let shown = 300, sortKey = 'ele', sortDir = -1;
let map, layer;

// ---------- Regionen ----------
const sel = $('preset');
GROUPS.forEach((g, i) => {
  const o = document.createElement('option');
  o.value = i; o.textContent = g[0];
  if (g.length === 1) o.disabled = true;
  if (g[0] === 'Kaisergebirge') o.selected = true;
  sel.appendChild(o);
});
const box = () => [+$('s').value, +$('w').value, +$('n').value, +$('e').value];
function setBox(s, w, n, e) { $('s').value = s; $('w').value = w; $('n').value = n; $('e').value = e; }
// Gewählte Gebirgsgruppe: Liste nach Gruppenzuordnung filtern (nicht nach dem Rechteck),
// damit Kreuze in Lücken zwischen den Rechtecken nicht herausfallen. null = freier Bereich.
let groupSel = null;
function applyPreset() {
  const g = GROUPS[sel.value];
  if (g.length > 1) {
    setBox(g[1], g[2], g[3], g[4]); $('regionTitle').textContent = g[0];
    groupSel = +sel.value > 0 ? g[0] : null;   // 0 = Ostalpen gesamt → Rechteck
  }
}
// Region über #hash merken/teilen (z. B. …/#karwendel)
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fromHash = GROUPS.findIndex(g => g.length > 1 && slug(g[0]) === location.hash.slice(1));
if (fromHash >= 0) sel.value = fromHash;
applyPreset();
sel.onchange = () => {
  applyPreset(); history.replaceState(null, '', '#' + slug(GROUPS[sel.value][0]));
  shown = 300; render(true);
};

$('legend').innerHTML = 'Quelle:' + [1, 2, 3, 4, 5, 6].map(k => `<span class="dot" style="background:${SRC_COLOR[k]}"></span>${SRC_LABEL[k]}`).join('');

// ---------- Karte & Liste ----------
function initMap() {
  map = L.map('map', { preferCanvas: true });
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17,
    attribution: '© OpenStreetMap-Mitwirkende, SRTM | © OpenTopoMap (CC-BY-SA)' }).addTo(map);
  layer = L.layerGroup().addTo(map);
  const [s, w, n, e] = box(); map.fitBounds([[s, w], [n, e]]);
}
const mainSrc = en => Math.min(...en.src);
const osmUrl = en => en.id.startsWith('bev/') || en.id.startsWith('imp/')
  ? `https://www.openstreetmap.org/?mlat=${en.lat}&mlon=${en.lon}#map=17/${en.lat}/${en.lon}`
  : `https://www.openstreetmap.org/${en.id}`;

function filtered() {
  const [s, w, n, e] = box();
  const f = $('filter').value.toLowerCase(), minE = parseInt($('minEle').value) || 0;
  const want = new Set([...document.querySelectorAll('.q:checked')].map(x => +x.value));
  const onlyBev = $('onlyBev').checked;
  const inRegion = groupSel
    ? en => (en.group ??= groupOf(en.lat, en.lon)) === groupSel
    : en => en.lat >= s && en.lat <= n && en.lon >= w && en.lon <= e;
  return [...entries.values()].filter(en =>
    inRegion(en) &&
    en.src.some(k => want.has(k)) && (!onlyBev || !en.src.some(k => OSM_SRC.includes(k))) &&
    (en.name.toLowerCase().includes(f) || (en.bevName || '').toLowerCase().includes(f)) &&
    (minE === 0 || (en.ele || 0) >= minE));
}

function render(fit) {
  const list = filtered();
  list.forEach(en => en.group ??= groupOf(en.lat, en.lon));
  list.sort((a, b) => {
    if (sortKey === 'ele') return sortDir * ((a.ele || 0) - (b.ele || 0));
    if (sortKey === 'src') return sortDir * (mainSrc(a) - mainSrc(b));
    return sortDir * String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'de');
  });
  $('rows').innerHTML = list.slice(0, shown).map(en => {
    const wiki = en.wikipedia ? (() => { const i = en.wikipedia.indexOf(':');
      return ` · <a target="_blank" href="https://${en.wikipedia.slice(0, i)}.wikipedia.org/wiki/${encodeURIComponent(en.wikipedia.slice(i + 1))}">Wikipedia</a>`; })() : '';
    const alt = (en.bevName && en.bevName !== en.name ? `<div style="font-size:11.5px;color:var(--mute)">BEV: ${esc(en.bevName)}</div>` : '') +
      (en.year ? `<div style="font-size:11.5px;color:var(--mute)">Kreuz errichtet ${en.year}</div>` : '');
    const wd = en.wikidata ? ` · <a target="_blank" href="https://www.wikidata.org/wiki/${en.wikidata}">Wikidata</a>` : '';
    return `<tr>
      <td><a href="#" data-ll="${en.lat},${en.lon}">${esc(en.name)}</a>${alt}</td>
      <td class="num">${en.ele ? Math.round(en.ele) + ' m' : '–'}</td>
      <td class="hide-sm">${esc(en.group)}</td>
      <td>${en.src.map(k => `<span class="b" style="background:${SRC_COLOR[k]}">${SRC_LABEL[k]}</span>`).join('')}</td>
      <td class="hide-sm"><a target="_blank" href="${osmUrl(en)}">OSM</a>${en.crossId && en.crossId !== en.id ? ` · <a target="_blank" href="https://www.openstreetmap.org/${en.crossId}">Kreuz</a>` : ''}${wiki}${wd}</td>
    </tr>`;
  }).join('');
  $('moreBtn').style.display = list.length > shown ? '' : 'none';
  $('moreBtn').textContent = `Mehr anzeigen (${list.length - shown} weitere)`;

  layer.clearLayers();
  for (const en of list) {
    L.circleMarker([en.lat, en.lon], { radius: 5, color: SRC_COLOR[mainSrc(en)], weight: 1, fillOpacity: .9 })
      .bindPopup(`<b>${esc(en.name)}</b><br>${en.ele ? Math.round(en.ele) + ' m<br>' : ''}${en.src.map(k => SRC_LABEL[k]).join(', ')}<br><a target="_blank" href="${osmUrl(en)}">in OSM öffnen</a>`)
      .addTo(layer);
  }
  if (fit) {
    const [s, w, n, e] = box(), b = L.latLngBounds([[s, w], [n, e]]);
    if (groupSel) list.forEach(en => b.extend([en.lat, en.lon]));   // auch zugeordnete Kreuze außerhalb des Rechtecks
    map.fitBounds(b);
  }
  const c = k => list.filter(en => en.src.includes(k)).length;
  const notOsm = list.filter(en => !en.src.some(k => OSM_SRC.includes(k))).length;
  $('status').textContent = `${list.length} Gipfelkreuze in der Auswahl · Kreuz-Tag ${c(1)} · Kreuz-Punkt ${c(2)} · ohne Gipfel ${c(3)} · BEV ${c(4)}` +
    (c(5) ? ` · Wikidata ${c(5)}` : '') + (c(6) ? ` · Bayern ${c(6)}` : '') + (notOsm ? ` (davon ${notOsm} nicht in OSM)` : '');
  return list.length;
}

// ---------- Daten laden ----------
async function loadPrecomputed() {
  const info = [];
  try {
    const r = await fetch('data/osm.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    for (const a of j.entries) { const en = unpack(a); entries.set(en.id, en); }
    info.push(`OSM: ${j.entries.length} Kreuze, Stand ${new Date(j.updated).toLocaleDateString('de-AT')}`);
  } catch { info.push('OSM-Vorberechnung nicht gefunden'); }
  try {
    const [g, m] = await Promise.all([fetch('data/bev.geojson'), fetch('data/bev_meta.json')]);
    if (!g.ok) throw new Error(g.status);
    bevFeatures = (await g.json()).features || [];
    const meta = m.ok ? await m.json() : {};
    mergeBev(entries, bevFeatures);
    const st = meta.stichtag && /^\d{8}$/.test(meta.stichtag) ? `${meta.stichtag.slice(6)}.${meta.stichtag.slice(4, 6)}.${meta.stichtag.slice(0, 4)}` : '?';
    info.push(`BEV: ${bevFeatures.length} Kreuze, Stichtag ${st}`);
  } catch { info.push('BEV-Daten nicht gefunden'); }
  for (const [src, file] of [[SRC.WD, 'data/wikidata.geojson'], [SRC.BY, 'data/by.geojson']]) {
    try {
      const r = await fetch(file, { cache: 'no-cache' }); if (!r.ok) continue;   // Quelle (noch) nicht vorhanden
      extra[src] = (await r.json()).features || [];
      mergePoints(entries, extra[src], src, src === SRC.WD ? 300 : 150);
      info.push(`${SRC_LABEL[src]}: ${extra[src].length}`);
    } catch { /* optional */ }
  }
  $('dataInfo').textContent = info.join(' · ');
  return entries.size > 0;
}

async function liveUpdate() {
  const [s, w, n, e] = box();
  if (!(n > s && e > w)) { $('status').textContent = 'Koordinaten prüfen.'; return; }
  const opt = { radius: parseInt($('rad').value) || 150, minEleFree: parseInt($('minEleFree').value) || 1200 };
  $('live').disabled = true;
  const fresh = new Map(), errors = [];
  const ts = (n - s) * (e - w) > 0.3 ? tiles(s, w, n, e) : [[s, w, n, e]];
  for (let i = 0; i < ts.length; i++) {
    $('status').textContent = `Live-Abfrage OSM … Teil ${i + 1}/${ts.length}`;
    $('bar').firstChild.style.width = (100 * i / ts.length) + '%';
    try { mergeElements(fresh, await overpass(buildQuery(ts[i].join(','), opt)), opt); }
    catch (err) { errors.push(err.message); }
  }
  $('bar').firstChild.style.width = '100%';
  if (fresh.size) {
    // Einträge im Bereich durch die frischen ersetzen, dann BEV neu abgleichen
    for (const [k, en] of entries) if (en.lat >= s && en.lat <= n && en.lon >= w && en.lon <= e) entries.delete(k);
    for (const [k, en] of fresh) entries.set(k, en);
    const inBox = f => { const [lo, la] = f.geometry.coordinates; return la >= s && la <= n && lo >= w && lo <= e; };
    mergeBev(entries, bevFeatures.filter(inBox));
    for (const src of [SRC.WD, SRC.BY]) mergePoints(entries, extra[src].filter(inBox), src, src === SRC.WD ? 300 : 150);
  }
  render(false);
  if (errors.length) $('status').textContent += ` · ${errors.length} Teil(e) fehlgeschlagen: ${errors[0]}`;
  $('live').disabled = false;
}

// ---------- Import ----------
$('imp').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  const txt = await f.text(); const feats = [];
  try {
    if (/\.csv$/i.test(f.name)) {
      const lines = txt.split(/\r?\n/).filter(Boolean), sep = lines[0].includes(';') ? ';' : ',';
      const h = lines[0].split(sep).map(x => x.trim().replace(/"/g, '').toLowerCase());
      const ix = ks => h.findIndex(x => ks.includes(x));
      const iLat = ix(['lat', 'latitude', 'breite']), iLon = ix(['lon', 'lng', 'longitude', 'länge', 'laenge']),
            iName = ix(['name', 'bezeichnung', 'gipfel']), iEle = ix(['ele', 'höhe', 'hoehe']);
      for (const l of lines.slice(1)) {
        const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
        const lat = num(c[iLat]), lon = num(c[iLon]);
        if (lat != null && lon != null) feats.push({ geometry: { coordinates: [lon, lat] }, properties: { name: c[iName], ele: num(c[iEle]) } });
      }
    } else {
      for (const ft of JSON.parse(txt).features || []) if (ft.geometry?.type === 'Point') feats.push(ft);
    }
    // Punkte, die schon bekannt sind (< 150 m), überspringen; neue als „ohne Gipfel“ hinzufügen
    let matched = 0, added = 0;
    const all = [...entries.values()];
    feats.forEach((ft, i) => {
      const [lon, lat] = ft.geometry.coordinates, p = ft.properties || {};
      if (all.some(en => Math.abs(en.lat - lat) < 0.01 && dist(en, { lat, lon }) < 150)) { matched++; return; }
      const en = { id: `imp/${f.name}/${i}`, lat, lon, name: p.name || p.NAME || 'Import', ele: num(p.ele ?? p.HOEHE),
                   src: [SRC.FREE], crossId: null, wikipedia: null };
      entries.set(en.id, en); all.push(en); added++;
    });
    render(false);
    $('status').textContent = `Import: ${matched} bekannte, ${added} neue Punkte.`;
  } catch (e) { $('status').textContent = 'Import fehlgeschlagen: ' + e.message; }
};

// ---------- Bedienung ----------
$('csv').onclick = () => {
  const rows = [['Name', 'Name BEV', 'Höhe', 'Gruppe (ca.)', 'Quelle', 'Lat', 'Lon', 'OSM']].concat(
    filtered().map(en => [en.name, en.bevName || '', en.ele ? Math.round(en.ele) : '', en.group || groupOf(en.lat, en.lon),
      en.src.map(k => SRC_LABEL[k]).join(', '), en.lat, en.lon, osmUrl(en)]));
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = 'gipfelkreuze_' + slug($('regionTitle').textContent) + '.csv';
  a.click();
};
$('fromMap').onclick = () => {
  const b = map.getBounds();
  setBox(b.getSouth().toFixed(3), b.getWest().toFixed(3), b.getNorth().toFixed(3), b.getEast().toFixed(3));
  $('regionTitle').textContent = '(Kartenausschnitt)'; groupSel = null; render(false);
};
$('live').onclick = liveUpdate;
['filter', 'minEle', 'onlyBev'].forEach(id => $(id).addEventListener('input', () => { shown = 300; render(false); }));
document.querySelectorAll('.q').forEach(x => x.addEventListener('change', () => { shown = 300; render(false); }));
['s', 'w', 'n', 'e'].forEach(id => $(id).addEventListener('change', () => { groupSel = null; render(true); }));
$('moreBtn').onclick = () => { shown += 300; render(false); };
document.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
  const k = th.dataset.k; sortDir = sortKey === k ? -sortDir : (k === 'ele' ? -1 : 1); sortKey = k; render(false);
});
$('rows').onclick = ev => {
  const a = ev.target.closest('a[data-ll]'); if (!a) return;
  ev.preventDefault(); const [la, lo] = a.dataset.ll.split(',').map(Number);
  map.setView([la, lo], 15); window.scrollTo({ top: $('map').offsetTop - 10, behavior: 'smooth' });
};

initMap();
if (await loadPrecomputed()) render(true);
else { $('status').textContent = 'Keine vorberechneten Daten – lade live aus OSM …'; await liveUpdate(); }

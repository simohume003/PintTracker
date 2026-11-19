const STORAGE_KEY = 'pint-register-v1';
const CSV_FILE = 'pubs.csv';
const HEADERS = ['id','name','type','location','guinness_rating','visited','latitude','longitude','notes','prices','image_url','group'];
const GROUP_NAME = 'Simon & Scotts';

let venues = [];
let pendingImage = null; // null = no change, string = new image (URL, data URL or '' to remove)
let map = null;
let markers = [];
let fitted = false;

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function num(x) {
  if (x === '' || x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parsePrices(x) {
  if (Array.isArray(x)) return x;
  if (!x) return [];
  try {
    const p = JSON.parse(x);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    return [];
  }
}

// Cleans any venue (from CSV, import, storage or the form) so bad values like "N/A" never reach the UI.
function normalise(v) {
  const rating = num(v.guinness_rating);
  return {
    id: v.id || 'venue-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name: v.name || '',
    type: v.type || 'Pub',
    location: v.location || '',
    guinness_rating: rating !== null && rating >= 1 && rating <= 5 ? rating : null,
    visited: v.visited === true || v.visited === 'true',
    latitude: num(v.latitude),
    longitude: num(v.longitude),
    notes: v.notes || '',
    image_url: v.image_url || '',
    group: v.group || '',
    prices: parsePrices(v.prices)
      .map(p => ({ amount: Number(p.amount), date: String(p.date || '') }))
      .filter(p => Number.isFinite(p.amount) && p.date)
  };
}

function parseCSVLine(line) {
  const out = [];
  let v = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"' && q) { v += '"'; i++; }
    else if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(v); v = ''; }
    else v += c;
  }
  out.push(v);
  return out;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines.shift());
  return lines.filter(l => l.trim()).map(line => {
    const vals = parseCSVLine(line);
    const o = Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    return normalise(o);
  });
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      venues = saved.map(normalise);
      return true;
    }
  } catch (e) {}
  return false;
}

async function seed() {
  const r = await fetch(CSV_FILE);
  if (!r.ok) throw new Error('CSV not found');
  venues = parseCSV(await r.text());
  save();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(venues));
  } catch (e) {
    alert('Storage is full. Try smaller photos or paste image links instead.');
  }
  render();
}

function fmtPrice(n) {
  return '€' + Number(n).toFixed(2);
}

function thumb(v) {
  if (v.image_url) {
    return `<img class="venue-thumb" src="${escapeHtml(v.image_url)}" alt="" loading="lazy">`;
  }
  return `<span class="thumb-placeholder" aria-hidden="true">${escapeHtml((v.name || '?').charAt(0).toUpperCase())}</span>`;
}

function render() {
  const visited = venues.filter(v => v.visited);
  const rated = venues.filter(v => v.guinness_rating !== null);
  const prices = venues.flatMap(v => v.prices.map(p => p.amount));

  $('uniqueCount').textContent = visited.length;
  $('ratingCount').textContent = rated.length;
  $('averagePrice').textContent = prices.length
    ? fmtPrice(prices.reduce((a, b) => a + b, 0) / prices.length)
    : '—';

  const best = [...rated]
    .sort((a, b) => b.guinness_rating - a.guinness_rating || a.name.localeCompare(b.name))
    .slice(0, 8);
  $('leaderboard').innerHTML = best.length
    ? best.map((v, i) => `<div class="leader-row"><span class="rank">${String(i + 1).padStart(2, '0')}</span><span class="leader-name">${escapeHtml(v.name)}</span><span class="score">${v.guinness_rating}/5</span></div>`).join('')
    : '<div class="empty">Add your first Guinness rating to start the leaderboard.</div>';

  renderGroup();
  renderVenues();
  renderMap();
}

function renderGroup() {
  const list = venues.filter(v => v.group.trim().toLowerCase() === GROUP_NAME.toLowerCase());
  $('groupList').innerHTML = list.length
    ? list.map(v => `
        <button class="venue-card" data-id="${escapeHtml(v.id)}">
          ${thumb(v)}
          <span class="venue-main">
            <span class="venue-name">${escapeHtml(v.name || 'Untitled venue')}</span>
            <span class="venue-meta">${escapeHtml(v.location)}</span>
          </span>
          <span class="venue-score">${v.guinness_rating !== null ? v.guinness_rating + '/5' : '—'}</span>
        </button>`).join('')
    : `<div class="empty">No ${escapeHtml(GROUP_NAME)} locations added yet. Open a venue and set its group to ${escapeHtml(GROUP_NAME)}.</div>`;

  document.querySelectorAll('#groupList .venue-card').forEach(b =>
    b.addEventListener('click', () => openVenue(b.dataset.id)));
}

function renderVenues() {
  const q = $('searchInput').value.toLowerCase();
  const f = $('filterSelect').value;
  let list = venues.filter(v => v.name.toLowerCase().includes(q) || v.location.toLowerCase().includes(q));
  if (f === 'visited') list = list.filter(v => v.visited);
  if (f === 'not-visited') list = list.filter(v => !v.visited);
  if (f === 'rated') list = list.filter(v => v.guinness_rating !== null);
  if (f === 'unrated') list = list.filter(v => v.guinness_rating === null);

  $('venueList').innerHTML = list.length
    ? list.map(v => `
        <button class="venue-card" data-id="${escapeHtml(v.id)}">
          <span class="venue-index">${String(venues.indexOf(v) + 1).padStart(2, '0')}</span>
          ${thumb(v)}
          <span class="venue-main">
            <span class="venue-name">${escapeHtml(v.name || 'Untitled venue')}</span>
            <span class="venue-meta"><i class="visit-dot ${v.visited ? '' : 'no'}"></i>${v.visited ? 'Visited' : 'Not visited'} · ${escapeHtml(v.type)}</span>
          </span>
          <span class="venue-score">${v.guinness_rating !== null ? v.guinness_rating + '/5' : '—'}</span>
        </button>`).join('')
    : '<div class="empty">No venues match that search.</div>';

  document.querySelectorAll('#venueList .venue-card').forEach(b =>
    b.addEventListener('click', () => openVenue(b.dataset.id)));
}

function initMap() {
  if (!window.L) return;
  map = L.map('map', { scrollWheelZoom: false }).setView([53.3, -6.23], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
}

function renderMap() {
  if (!map) return;
  markers.forEach(m => m.remove());
  markers = venues
    .filter(v => v.latitude !== null && v.longitude !== null)
    .map(v => L.marker([v.latitude, v.longitude]).addTo(map).bindPopup(
      `<strong>${escapeHtml(v.name)}</strong><br>${v.guinness_rating !== null ? 'Guinness: ' + v.guinness_rating + '/5' : 'Not rated'}`
    ));
  // Only zoom to fit the first time, so edits don't jump the map around.
  if (!fitted && markers.length) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15), { maxZoom: 14 });
    fitted = true;
  }
}

function setSelect(id, val) {
  const sel = $(id);
  if (val && ![...sel.options].some(o => o.value === val)) sel.add(new Option(val, val));
  sel.value = val || 'Pub';
}

function setPreview(src) {
  const img = $('photoPreview');
  if (src) {
    img.src = src;
    img.hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
}

function openVenue(id) {
  const v = venues.find(x => x.id === id);
  if (!v) return;
  pendingImage = null;
  $('venueId').value = v.id;
  $('dialogTitle').textContent = v.name || 'New venue';
  $('venueName').value = v.name;
  setSelect('venueType', v.type);
  $('venueVisited').value = String(v.visited);
  $('venueLocation').value = v.location;
  $('venueRating').value = v.guinness_rating ?? '';
  $('venueLat').value = v.latitude ?? '';
  $('venueLng').value = v.longitude ?? '';
  $('venueNotes').value = v.notes;
  $('venueGroup').value = v.group;
  $('venueImage').value = v.image_url;
  setPreview(v.image_url);
  $('priceAmount').value = '';
  $('priceDate').value = today();
  renderPriceHistory(v);
  $('venueDialog').showModal();
}

function renderPriceHistory(v) {
  const ps = [...v.prices].sort((a, b) => b.date.localeCompare(a.date));
  $('priceHistory').innerHTML = ps.length
    ? ps.map(p => `<div class="price-row"><span>${escapeHtml(p.date)}</span><strong>${fmtPrice(p.amount)}</strong></div>`).join('')
    : '<p class="muted">No prices recorded yet.</p>';
}

$('venueImage').addEventListener('input', e => {
  pendingImage = e.target.value.trim();
  setPreview(pendingImage);
});

$('venueForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = venues.find(x => x.id === $('venueId').value);
  if (!v) return;
  v.name = $('venueName').value.trim();
  v.type = $('venueType').value;
  v.visited = $('venueVisited').value === 'true';
  v.location = $('venueLocation').value.trim();
  v.guinness_rating = $('venueRating').value === '' ? null : Number($('venueRating').value);
  v.latitude = num($('venueLat').value);
  v.longitude = num($('venueLng').value);
  v.notes = $('venueNotes').value.trim();
  v.group = $('venueGroup').value.trim();
  if (pendingImage !== null) v.image_url = pendingImage;
  $('venueDialog').close();
  save();
});

$('addPriceBtn').addEventListener('click', () => {
  const v = venues.find(x => x.id === $('venueId').value);
  const amount = Number($('priceAmount').value);
  const date = $('priceDate').value;
  if (!v || !amount || amount <= 0 || !date) return alert('Enter a valid price and date.');
  v.prices.push({ amount, date });
  $('priceAmount').value = '';
  renderPriceHistory(v);
  save();
});

$('deleteVenueBtn').addEventListener('click', () => {
  const v = venues.find(x => x.id === $('venueId').value);
  if (v && confirm(`Delete ${v.name || 'this venue'}?`)) {
    venues = venues.filter(x => x.id !== v.id);
    $('venueDialog').close();
    save();
  }
});

$('addVenueBtn').addEventListener('click', () => {
  const id = 'venue-' + Date.now();
  venues.push(normalise({ id, name: '', visited: false }));
  save();
  openVenue(id);
});

$('searchInput').addEventListener('input', renderVenues);
$('filterSelect').addEventListener('change', renderVenues);

function csvCell(v) {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

$('exportBtn').addEventListener('click', () => {
  const lines = [HEADERS.join(',')];
  venues.forEach(v => {
    const row = {
      id: v.id,
      name: v.name,
      type: v.type,
      location: v.location,
      guinness_rating: v.guinness_rating ?? 'N/A',
      visited: String(v.visited),
      latitude: v.latitude ?? '',
      longitude: v.longitude ?? '',
      notes: v.notes,
      prices: JSON.stringify(v.prices),
      image_url: v.image_url,
      group: v.group
    };
    lines.push(HEADERS.map(h => csvCell(row[h])).join(','));
  });
  download(lines.join('\r\n'), 'pint-register-export.csv', 'text/csv;charset=utf-8;');
});

function download(data, name, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const incoming = parseCSV(await file.text());
  if (confirm('Replace the current register with the imported CSV?')) {
    venues = incoming;
    fitted = false;
    save();
  }
  e.target.value = '';
});

(async () => {
  initMap();
  if (!load()) {
    try {
      await seed();
    } catch (err) {
      $('venueList').innerHTML = `<div class="empty">Could not load ${CSV_FILE}. Serve this folder over HTTP, or use Import CSV in the footer.</div>`;
    }
  }
  render();
})();

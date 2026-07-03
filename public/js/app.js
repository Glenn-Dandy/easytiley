// Main app: dashboard load/save, Gridstack editor, tabs, live wiring.
// Loads last; ui.js + dialogs.js provide pickers and dialogs (shared scope).
let grid, currentDash = null, editMode = false;
let tiles = {};               // id -> tile config
let deviceCache = [];         // [{name,type,room,readings[],sets[],onoff}]
let editingTileId = null;     // set while the dialog edits an existing tile
let noteEditId = null;        // set while the dedicated note dialog is open

const $  = sel => document.querySelector(sel);
const el = {};
// 24-column grid (finer snap than the old 12). Sizes are in those finer units.
const GRID_GEN = 2;                 // bump when the column resolution changes
const APP_NAME = 'EasyTiley', APP_VERSION = '1.03-dev';
const COLS = 23;
const DEFAULT_SIZE = {
  value:  { w: 4, h: 4 }, switch: { w: 4, h: 4 }, dimmer: { w: 6, h: 4 },
  color:  { w: 4, h: 4 }, light: { w: 6, h: 6 }, readingsgroup: { w: 24, h: 8 },
  group:  { w: 8, h: 8 }, button: { w: 4, h: 4 }, label: { w: 6, h: 2 },
  clock:  { w: 3, h: 3 },   // also the min size (see addWidget)
  note:   { w: 6, h: 5 },
  weather:{ w: 12, h: 8 },
  thermostat: { w: 5, h: 6 },
  status: { w: 4, h: 4 },
  cover: { w: 5, h: 6 },
  chart: { w: 9, h: 5 },
};

// ---- init ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

function applyTheme(name) {
  name = (name === 'clean') ? 'clean' : 'aurora';
  document.body.classList.remove('theme-aurora', 'theme-clean');
  document.body.classList.add('theme-' + name);
  localStorage.setItem('theme', name);
  const sel = document.getElementById('sTheme');
  if (sel) sel.value = name;
}

// GridStack ships column CSS only for gs-2..gs-12. Generate the rules for the
// finer counts we use (main grid = COLS, group sub-grids up to COLS).
function injectColumnCss(maxCol) {
  const r = v => Math.round(v * 1000) / 1000;
  let css = '';
  for (let n = 13; n <= maxCol; n++) {
    const p = 100 / n;
    css += `.gs-${n}>.grid-stack-item{width:${r(p)}%}`;
    for (let i = 1; i < n; i++) css += `.gs-${n}>.grid-stack-item[gs-x="${i}"]{left:${r(p * i)}%}`;
    for (let w = 2; w <= n; w++) css += `.gs-${n}>.grid-stack-item[gs-w="${w}"]{width:${r(p * w)}%}`;
  }
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
}

// Double a saved layout's top-level coordinates (12-col -> 24-col). Group
// children are left as-is: a group's box doubles in main-grid units but keeps
// the same pixel size, and its sub-grid auto-fits columns by width, so the
// children stay exactly where they were.
function scaleLayout(list) {
  for (const t of list) {
    t.x = (t.x || 0) * 2; t.y = (t.y || 0) * 2;
    t.w = (t.w || 2) * 2; t.h = (t.h || 2) * 2;
  }
}

// Migrate every dashboard once when the grid resolution changes. The marker is
// stored server-side (global setting), so other devices skip an already-done run.
async function migrateGrid() {
  try {
    const s = await API.settings();
    if ((s.gridGen || 1) >= GRID_GEN) return;
    const { dashboards: list } = await API.dashboards();
    for (const d of list) {
      const full = await API.dashboard(d.id);
      scaleLayout(full.layout);
      await API.saveDashboard(d.id, d.name, full.layout);
    }
    await API.setGridGen(GRID_GEN);
  } catch (e) { /* leave layouts untouched on any error */ }
}

async function init() {
  applyTheme(localStorage.getItem('theme') || 'aurora');
  injectColumnCss(COLS);                     // GridStack only ships CSS up to gs-12
  ['tabs','addBtn','saveBtn','editBtn','settingsBtn','fsBtn','status'].forEach(id => el[id] = document.getElementById(id));

  grid = GridStack.init({
    column: COLS, cellHeight: 38, margin: 4, float: true,   // free placement; only the common top gap is auto-removed (collapseTop)
    disableDrag: true, disableResize: true,
    acceptWidgets: true,                     // allow dragging tiles in/out of group boxes
    // whole card is the drag handle (default); resize via bottom-right corner
    // + bottom/right edges (no bottom-left).
    resizable: { handles: 'se, s, e' },
  });
  // Don't let a tap on the edit/delete badges start a tile drag.
  // Don't let a press on the action badges start a tile drag (the rest of the
  // card is the drag handle).
  ['mousedown', 'touchstart'].forEach(ev => document.addEventListener(ev, e => {
    if (e.target.closest('.tile-del, .tile-edit, .tile-link, .merge-split, .merge-link, .link-edge')) e.stopPropagation();
  }, true));
  // The grid is built at a fixed design width and zoom-scaled to fit, so a
  // layout looks identical on laptop and tablet (just proportionally smaller).
  applyScale();
  grid.on('change added removed resizestop dragstop', applyScale);
  grid.on('dragstop resizestop dropped removed added', () => collapseTop()); // gently pull off the empty top margin
  grid.on('resizestop', (e, el) => syncGroupColumns(el)); // group box resized -> match its sub-grid columns to the new width
  grid.on('resize resizestop', (e, item) => {   // charts re-layout live instead of scaling while dragging
    const c = item.querySelector && item.querySelector('.tile-chart');
    if (c && c._chPts) Tiles.drawChart(c, tiles[c.dataset.tileId] || {}, c._chPts);
  });
  grid.on('added removed', () => { clearTimeout(window._lvr); window._lvr = setTimeout(() => Live.reconnect(), 600); }); // device set changed -> re-subscribe
  grid.on('dragstart', cancelLink);            // dragging is for repositioning, not linking
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelLink(); });
  window.addEventListener('resize', () => { clearTimeout(window._sc); window._sc = setTimeout(applyScale, 120); });

  grid.el.addEventListener('click', onGridClick);
  grid.el.addEventListener('change', onNoteCheck);   // tick a checklist item (normal mode)
  el.editBtn.addEventListener('click', toggleEdit);
  el.addBtn.addEventListener('click', openAddDialog);
  el.saveBtn.addEventListener('click', save);
  el.settingsBtn.addEventListener('click', openSettings);
  // Browser fullscreen: works over plain http, unlike PWA standalone (needs https).
  el.fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () =>
    el.fsBtn.classList.toggle('active', !!document.fullscreenElement));
  if (!document.documentElement.requestFullscreen) el.fsBtn.classList.add('hidden'); // e.g. iPhone Safari
  setupDialog();
  setupNoteDialog();
  setupSettings();

  // Instant paint from the last snapshot (tiles + last values appear at once,
  // pulsing until fresh data lands) - then load the real state from the server.
  paintFromSnapshot();
  window.addEventListener('pagehide', () => saveSnapshot());

  await migrateGrid();                       // one-time ×2 layout rescale to the finer grid
  // NOTE: the full device list (heavy on single-threaded FHEM) is loaded
  // lazily on first "+ Kachel", not on every page load.
  await loadDashboards();

  Live.start(activeDeviceNames, applyLive, setStatus, 3000);
  setInterval(refreshReadingsGroups, 30000); // readingsGroups change slowly
  setInterval(refreshCharts, 300000);        // log history: 5 min is plenty
  updateClocks();
  setInterval(updateClocks, 1000);            // local clock tiles (no FHEM)
}

// ---- dashboards / rooms as tabs -----------------------------------------
let dashboards = [];

async function loadDashboards(selectId) {
  dashboards = (await API.dashboards()).dashboards;
  const id = selectId || (currentDash && currentDash.id) || (dashboards[0] && dashboards[0].id);
  if (id) await loadDashboard(id); else renderTabs(null);
}

let dragTabId = null;

function renderTabs(activeId) {
  el.tabs.innerHTML = '';
  dashboards.forEach(d => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (d.id === activeId ? ' active' : '');
    tab.innerHTML = `<span class="tab-name">${esc(d.name)}</span><span class="tab-x" title="${tr('Raum löschen')}">✕</span>`;
    tab.addEventListener('click', e => {
      if (e.target.closest('.tab-x'))      return deleteTab(d.id);
      if (editMode && d.id === activeId)   return renameTab(d.id);
      loadDashboard(d.id);
    });
    if (editMode) {                                    // reorder rooms by drag (edit mode only)
      tab.draggable = true;
      tab.addEventListener('dragstart', e => { dragTabId = d.id; tab.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
      tab.addEventListener('dragend',   () => { dragTabId = null; el.tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('drag', 'drop-target')); });
      tab.addEventListener('dragover',  e => { e.preventDefault(); if (dragTabId != null && dragTabId !== d.id) tab.classList.add('drop-target'); });
      tab.addEventListener('dragleave', () => tab.classList.remove('drop-target'));
      tab.addEventListener('drop',      e => { e.preventDefault(); tab.classList.remove('drop-target'); reorderTabs(dragTabId, d.id); });
    }
    el.tabs.appendChild(tab);
  });
  if (editMode) {                                      // adding rooms only in edit mode
    const add = document.createElement('div');
    add.className = 'tab-add'; add.textContent = '＋'; add.title = tr('Neuer Raum');
    add.addEventListener('click', addTab);
    el.tabs.appendChild(add);
  }
}

async function reorderTabs(srcId, destId) {
  if (srcId == null || srcId === destId) return;
  const arr = dashboards.slice();
  const from = arr.findIndex(x => x.id === srcId), to = arr.findIndex(x => x.id === destId);
  if (from < 0 || to < 0) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  dashboards = arr;
  renderTabs(currentDash && currentDash.id);
  try { await API.reorderDashboards(arr.map(x => x.id)); } catch (e) { /* order is best-effort */ }
}

async function addTab() {
  const name = prompt(tr('Name des neuen Raums/Tabs:'));
  if (!name) return;
  const { id } = await API.createDashboard(name);
  await loadDashboards(id);
}

async function renameTab(id) {
  const d = dashboards.find(x => x.id === id);
  const name = prompt(tr('Raum umbenennen:'), d ? d.name : '');
  if (!name) return;
  await API.saveDashboard(id, name, currentDash.layout);
  await loadDashboards(id);
}

async function deleteTab(id) {
  if (dashboards.length <= 1) { alert(tr('Mindestens ein Raum muss bleiben.')); return; }
  if (!confirm(tr('Diesen Raum mit allen Kacheln löschen?'))) return;
  await API.deleteDashboard(id);
  if (currentDash && currentDash.id === id) currentDash = null;
  await loadDashboards();
}

async function loadDashboard(id) {
  currentDash = await API.dashboard(id);
  // Painted from the snapshot and the server agrees? Keep the DOM - no flicker.
  const same = bootPaintedJson && bootPaintedId === id &&
               JSON.stringify(currentDash.layout) === bootPaintedJson;
  bootPaintedJson = null;
  if (!same) {
    tiles = {};
    eachGrid(g => { if (g !== grid) g.destroy(false); }); // tear down old sub-grids
    grid.removeAll();
    for (const t of currentDash.layout) addWidget(t);     // addWidget registers + recurses into groups
    applyScale();                                         // re-fit zoom after layout change
    requestAnimationFrame(syncAllGroups);                 // match group sub-grid columns once laid out
  }
  renderTabs(id);
  refreshReadingsGroups();
  refreshCharts();
  updateClocks();
  saveSnapshot();
}

// ---- boot snapshot: the last dashboard, painted instantly on reload --------
let bootPaintedJson = null, bootPaintedId = null, _lastMap = null, _lastSnapSave = 0;

function saveSnapshot(map) {
  try {
    if (!currentDash) return;
    localStorage.setItem('snap', JSON.stringify({
      v: 1, dashboards, activeId: currentDash.id, layout: currentDash.layout, map: map || _lastMap || null,
    }));
  } catch (e) { /* storage blocked/full -> reload just paints later */ }
}

function paintFromSnapshot() {
  let s;
  try { s = JSON.parse(localStorage.getItem('snap') || 'null'); } catch (e) { return; }
  if (!s || !Array.isArray(s.layout) || !s.layout.length) return;
  dashboards = s.dashboards || [];
  renderTabs(s.activeId);
  for (const t of s.layout) addWidget(t);
  applyScale();
  requestAnimationFrame(syncAllGroups);
  if (s.map) { _lastMap = s.map; applyLive(s.map); }    // last known values...
  grid.el.querySelectorAll('.tile[data-tile-id]').forEach(c => {  // ...pulsing until fresh
    const t = tiles[c.dataset.tileId];
    if (t && t.device && t.type !== 'readingsgroup' && t.type !== 'group') c.classList.add('tile-wait');
  });
  updateClocks();
  bootPaintedJson = JSON.stringify(s.layout);
  bootPaintedId = s.activeId;
}

// Align every group's sub-grid cell width with the main grid (run after layout).
function syncAllGroups() {
  grid.el.querySelectorAll('.grid-stack-item').forEach(it => syncGroupColumns(it));
}

// readingsGroup tiles: pull FHEM's own rendered HTML and inject it.
// Pull log history for every chart tile and (re)draw it.
async function refreshCharts() {
  for (const t of Object.values(tiles)) {
    if (t.type !== 'chart' || !t.chLog || !t.chSpec) continue;
    const el2 = grid.el.querySelector(`.tile[data-tile-id="${t.id}"]`);
    if (!el2) continue;
    try {
      const { points } = await API.chart(t.chLog, t.chSpec, t.chHours || 24);
      el2.classList.remove('tile-wait');
      Tiles.drawChart(el2, t, points);
    } catch (e) {
      el2.classList.remove('tile-wait');
      const em = el2.querySelector('.ch-empty');
      if (em) { em.style.display = ''; em.textContent = tr('Fehler: ') + e.message; }
    }
  }
}

async function refreshReadingsGroups() {
  for (const t of Object.values(tiles)) {
    if (t.type !== 'readingsgroup' || !t.device) continue;
    // works for a standalone tile and for a readingsGroup merged into a card
    // (a merge child is not a grid item, so look it up by its tile id instead)
    const target = grid.el.querySelector(`.tile[data-tile-id="${t.id}"] .rg-content`);
    if (!target) continue;
    try {
      const { rows } = await API.readingsGroup(t.device);
      target.classList.remove('rg-loading');
      target.innerHTML = renderRgTable(rows);
    } catch (e) { target.classList.remove('rg-loading'); target.textContent = tr('Fehler: ') + e.message; }
  }
}

// Build our own themed table from the parsed readingsGroup rows.
function renderRgTable(rows) {
  if (!rows || !rows.length) return '<div class="rg-empty">' + tr('– keine Daten –') + '</div>';
  const cols = rows.reduce((m, r) => Math.max(m, r.cells.length), 1);
  let h = '<table class="rg-table">';
  for (const r of rows) {
    if (r.sep) { h += `<tr class="rg-sep"><td colspan="${cols}"></td></tr>`; continue; }
    h += '<tr>' + r.cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
  }
  return h + '</table>';
}

// ---- widgets -------------------------------------------------------------
// A group's sub-grid mirrors the main grid: same cell height, and as many columns
// as the group is wide in main-grid cells. That makes the group a true window into
// the same coordinate system, so a tile keeps its size and proportions 1:1 when
// dragged in or out — no per-grid rescaling needed.
const NESTED_OPTS = {                          // options for a group's sub-grid
  cellHeight: 38, margin: 4, float: true,      // free placement like the main grid; column set per group width
  acceptWidgets: true, resizable: { handles: 'se, s, e' },
};
// Match a group's sub-grid column count to its pixel width so the sub-grid's cell
// width equals the main grid's — then a tile keeps its exact size when dragged in
// or out, and the box "grows by columns" rather than stretching its cells.
function syncGroupColumns(el) {
  const sub = el && el.gridstackNode && el.gridstackNode.subGrid;
  if (!sub || !sub.el || !sub.el.clientWidth || !grid.el.clientWidth) return;
  // Use unscaled clientWidth on both sides (CSS-transform zoom would skew
  // getBoundingClientRect / cellWidth()). cols so the sub cell width ≈ main's.
  const cols = Math.max(2, Math.round(sub.el.clientWidth * grid.getColumn() / grid.el.clientWidth));
  if (sub.getColumn() !== cols) sub.column(cols, 'none');
}

// run a callback for every grid on the page (main grid + all group sub-grids)
function eachGrid(fn) {
  document.querySelectorAll('.grid-stack').forEach(g => g.gridstack && fn(g.gridstack));
}

// Zoom the whole grid (built at REF px) down to fit the viewport, so the same
// layout renders identically — just smaller — on tablet vs laptop. Edit mode
// stays 1:1 so GridStack drag math is exact.
const REF = 1227;   // 23 columns × ~53.3px cell (was 24×… = 1280); one raster narrower, same cell size
function applyScale() {
  const main = document.querySelector('main');
  if (!main || !grid) return;
  grid.el.style.width = REF + 'px';
  grid.el.style.transformOrigin = 'top left';
  const s = editMode ? 1 : Math.min(1, main.clientWidth / REF);
  grid.el.style.transform = s === 1 ? '' : `scale(${s})`;
  const h = grid.el.offsetHeight;            // unscaled layout height
  grid.el.style.marginBottom = s < 1 ? `${-Math.round(h * (1 - s))}px` : '';
  syncAllGroups();   // single source of truth for sub-grid columns (1:1 cell size with the main grid)
}

// Register a tile in the flat tiles map, recursing into merge children (which
// may themselves be merges — nested stacks). Groups keep their own sub-grid path.
function registerTile(t) {
  tiles[t.id] = t;
  if (t.type === 'merge') (t.children || []).forEach(registerTile);
}
function unregisterTile(t) {
  if (t && t.type === 'merge') (t.children || []).forEach(unregisterTile);
  if (t) delete tiles[t.id];
}


// Remove only the empty band above *all* tiles (the shared top margin) without
// touching internal gaps — the "free grid, but no dead space up top" behaviour.
function collapseTop() {
  const nodes = grid.engine.nodes;
  if (!nodes.length) return;
  const minY = Math.min(...nodes.map(n => n.y || 0));
  if (minY <= 0) return;
  grid.batchUpdate();
  nodes.forEach(n => grid.update(n.el, { y: (n.y || 0) - minY }));
  grid.commit();
}

function addWidget(tile, targetGrid = grid) {
  tiles[tile.id] = tile;
  if (tile.type === 'merge') (tile.children || []).forEach(registerTile); // children (and nested merges) live in the same map
  const big = tile.type === 'group';
  const item = document.createElement('div');
  item.className = 'grid-stack-item';
  item.setAttribute('gs-id', tile.id);
  if (tile.autoPosition) item.setAttribute('gs-auto-position', 'true'); // float:true -> let GridStack find a free slot
  else { item.setAttribute('gs-x', tile.x ?? 0); item.setAttribute('gs-y', tile.y ?? 0); }
  item.setAttribute('gs-w', tile.w ?? (big ? 8 : 4));
  item.setAttribute('gs-h', tile.h ?? (big ? 8 : 4));
  if (tile.type === 'clock') {                 // clock: don't shrink below its default size
    item.setAttribute('gs-min-w', DEFAULT_SIZE.clock.w);
    item.setAttribute('gs-min-h', DEFAULT_SIZE.clock.h);
  }
  if (tile.type === 'weather') {               // weather needs room for stats + forecast strip
    item.setAttribute('gs-min-w', 9);
    item.setAttribute('gs-min-h', 5);
  }
  item.appendChild(Tiles.build(tile, onAction));
  targetGrid.el.appendChild(item);
  targetGrid.makeWidget(item);

  if (big) { // turn the inner .grid-stack into a real sub-grid and fill it
    const nestedEl = item.querySelector('.grid-stack');
    const sub = GridStack.init({ ...NESTED_OPTS, column: Math.max(2, Math.round(tile.w || 6)), disableDrag: !editMode, disableResize: !editMode }, nestedEl);
    // Wire the parent<->child relationship so tiles can also be dragged OUT.
    // GridStack.init() alone doesn't set this (only makeSubGrid / a drop does).
    const gn = item.gridstackNode;
    if (gn) { gn.subGrid = sub; sub.parentGridItem = gn; }
    for (const child of (tile.children || [])) addWidget(child, sub);
  }
}

function removeTile(item, id) {
  const t = tiles[id];
  if (t && t.type === 'group') {                           // drop children configs too
    item.querySelectorAll('.grid-stack-item').forEach(ci => delete tiles[ci.getAttribute('gs-id')]);
  }
  if (t && t.type === 'merge') (t.children || []).forEach(unregisterTile);
  if (item) { const owner = (item.gridstackNode && item.gridstackNode.grid) || grid; owner.removeWidget(item); }
  delete tiles[id];
}

// The merge tile that contains a given child id (or null).
function findMergeOf(id) {
  return Object.values(tiles).find(t => t && t.type === 'merge' && (t.children || []).some(c => c.id === id));
}

function onGridClick(e) {
  if (!editMode) {
    // notes are edited in normal mode: tap the card (but not a checkbox) to open the note dialog
    if (e.target.closest('.tile-note') && !e.target.closest('.chk-item')) {
      const it = e.target.closest('.grid-stack-item');
      if (it) openNoteDialog(it.getAttribute('gs-id'));
    }
    return;
  }
  const item = e.target.closest('.grid-stack-item');
  if (!item) { if (linkSource) cancelLink(); return; }   // tap empty space cancels linking
  const id = item.getAttribute('gs-id');
  // 🔗 badge: pick this tile as the link source (or unpick)
  if (e.target.closest('.tile-link') || e.target.closest('.merge-link')) { toggleLink(id); return; }
  // while a source is picked, a tap on any other tile is the merge partner;
  // a tap on one of its dock-edge zones picks that side explicitly
  if (linkSource) { const z = e.target.closest('.link-edge'); performLink(id, z && z.dataset.side); return; }
  // merge container controls (no delete on a merged card — split it first)
  if (e.target.closest('.merge-split')) { dissolveMerge(id); return; }
  // a child's edit badge inside a merged card
  const cell = e.target.closest('.merge-cell');
  if (cell) {
    if (e.target.closest('.tile-edit')) openEditDialog(cell.querySelector('.tile').dataset.tileId);
    return;
  }
  if (e.target.closest('.tile-del'))       removeTile(item, id);
  else if (e.target.closest('.tile-edit')) { const t = tiles[id]; (t && t.type === 'note') ? openNoteDialog(id) : openEditDialog(id); }
}

// Tick/untick a checklist item directly on the tile (normal mode) -> persist.
function onNoteCheck(e) {
  const cb = e.target.closest('.tile-note .chk-item input');
  if (!cb || editMode) return;
  const item = e.target.closest('.grid-stack-item'); if (!item) return;
  const t = tiles[item.getAttribute('gs-id')];
  if (!t || !t.items || !t.items[+cb.dataset.i]) return;
  t.items[+cb.dataset.i].done = cb.checked;
  cb.closest('.chk-item').classList.toggle('done', cb.checked);
  save();
}

// Replace a tile's content in place, keeping its grid position/size. Editing a
// merge child rebuilds the whole merge card (children aren't grid items).
function rebuildTileContent(id) {
  const parent = findMergeOf(id);
  if (parent) {
    const i = parent.children.findIndex(c => c.id === id);
    if (i >= 0) parent.children[i] = tiles[id];            // keep the merge's array in sync with edits
    return rebuildTileContent(parent.id);
  }
  const item = grid.el.querySelector(`.grid-stack-item[gs-id="${id}"]`);
  if (!item) return;
  // Update in place: keep the same .grid-stack-item-content node so GridStack's
  // drag/resize handle binding survives (replacing the whole node breaks dragging).
  const content = item.querySelector('.grid-stack-item-content');
  const built = Tiles.build(tiles[id], onAction);   // a fresh .grid-stack-item-content
  content.className = built.className;               // pick up tile-type / no-head class changes
  content.replaceChildren(...built.childNodes);      // move children (with their listeners) over
}

// Split a merged card back into standalone tiles at its old spot.
function dissolveMerge(id) {
  const m = tiles[id];
  if (!m || m.type !== 'merge') return;
  const item = grid.el.querySelector(`.grid-stack-item[gs-id="${id}"]`);
  const n = (item && item.gridstackNode) || {};
  const x0 = n.x ?? m.x ?? 0, y0 = n.y ?? m.y ?? 0;
  const kids = (m.children || []).map(c => ({ ...c }));
  removeTile(item, id);
  let x = x0;
  kids.forEach(c => { const w = c.w || 4; addWidget({ ...c, x: Math.min(x, COLS - w), y: y0, w, h: c.h || 4 }); x += w; });
  afterMerge();
}

function afterMerge() {
  applyScale();
  setTimeout(() => Live.start(activeDeviceNames, applyLive, setStatus, 3000), 200);
}

// ---- merge by linking: tap 🔗 on a tile, then tap a neighbour. No drag, so
// it never interferes with repositioning. Direction is inferred from the two
// tiles' relative grid positions.
let linkSource = null;

function setLinkUI() {
  document.body.classList.toggle('linking', !!linkSource);
  grid.el.querySelectorAll('.grid-stack-item.link-source').forEach(i => i.classList.remove('link-source'));
  grid.el.querySelectorAll('.link-edges').forEach(n => n.remove());
  if (!linkSource) return;
  const srcItem = grid.el.querySelector(`.grid-stack-item[gs-id="${linkSource}"]`);
  if (srcItem) srcItem.classList.add('link-source');
  // Paint 4 dock zones onto every candidate so the user can pick a side directly
  // (tap-friendly: the tap *is* the choice, no hover needed on tablets).
  grid.el.querySelectorAll('.grid-stack-item').forEach(it => {
    const id = it.getAttribute('gs-id');
    const t = tiles[id];
    if (id === linkSource || !t || t.type === 'group') return;
    const ov = document.createElement('div');
    ov.className = 'link-edges';
    ['top', 'right', 'bottom', 'left'].forEach(s => {
      const z = document.createElement('div');
      z.className = 'link-edge le-' + s;
      z.dataset.side = s;
      ov.appendChild(z);
    });
    const content = it.querySelector('.grid-stack-item-content');
    if (content) content.appendChild(ov);
  });
}
function cancelLink() { linkSource = null; setLinkUI(); }
function toggleLink(id) {
  const t = tiles[id];
  if (!t || t.type === 'group') return;                 // room-groups don't merge
  linkSource = (linkSource === id) ? null : id;
  setLinkUI();
}

// Side of the target (computed from grid positions) the source sits on, used as
// a fallback when the user taps a tile body rather than one of its edge zones.
function sideFromCenters(a, b) {
  const ai = grid.el.querySelector(`.grid-stack-item[gs-id="${a.id}"]`);
  const bi = grid.el.querySelector(`.grid-stack-item[gs-id="${b.id}"]`);
  const an = (ai && ai.gridstackNode) || a, bn = (bi && bi.gridstackNode) || b;
  const dx = (an.x + (an.w || 1) / 2) - (bn.x + (bn.w || 1) / 2);
  const dy = (an.y + (an.h || 1) / 2) - (bn.y + (bn.h || 1) / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
}

// Merge the linked source onto `side` of the tapped target `bId`. `side` comes
// from the dock edge the user tapped (or is inferred if they tapped the body).
function performLink(bId, side) {
  const aId = linkSource; cancelLink();
  if (!aId || aId === bId) return;
  const a = tiles[aId], b = tiles[bId];
  if (!a || !b || a.type === 'group' || b.type === 'group') return;
  createMerge(b, a, side || sideFromCenters(a, b));   // source a docks onto target b
}

// Drop grid position but capture the *live* size from the grid node — the
// tiles[] copy may hold a stale w/h if the user resized the card in edit mode,
// and that w/h is what drives the merged cell's size ratio.
const stripGeo = t => {
  const it = grid.el.querySelector(`.grid-stack-item[gs-id="${t.id}"]`);
  const n = it && it.gridstackNode;
  const o = { ...t, w: (n && n.w) || t.w, h: (n && n.h) || t.h };
  delete o.x; delete o.y;
  return o;
};

const itemOf = id => grid.el.querySelector(`.grid-stack-item[gs-id="${id}"]`);
const liveSize = id => { const n = itemOf(id) && itemOf(id).gridstackNode; return { w: (n && n.w) || 4, h: (n && n.h) || 4 }; };

// Merge `src` onto `side` of `tgt`. If `tgt` is already a merge whose axis matches
// the dock side, the source is appended as another cell (and the card grows along
// that axis). Otherwise a new outer merge is built in the perpendicular/other
// direction — `tgt` (which may itself be a merge) becomes a nested cell, giving a
// true 2D stack.
function createMerge(tgt, src, side) {
  const horiz = side === 'left' || side === 'right';
  const before = side === 'left' || side === 'top';
  const wantDir = horiz ? 'row' : 'col';
  const srcItem = itemOf(src.id);

  if (tgt.type === 'merge' && (tgt.dir || 'row') === wantDir) {   // append into existing card, same axis
    const ss = liveSize(src.id);
    const child = stripGeo(src);
    before ? tgt.children.unshift(child) : tgt.children.push(child);
    registerTile(child);
    const tItem = itemOf(tgt.id);                                  // grow the card so the new cell keeps its size
    if (tItem) horiz ? grid.update(tItem, { w: Math.min((tItem.gridstackNode.w || 4) + ss.w, COLS) })
                     : grid.update(tItem, { h: (tItem.gridstackNode.h || 4) + ss.h });
    removeTile(srcItem, src.id);
    rebuildTileContent(tgt.id);
    return afterMerge();
  }

  // New outer merge: tgt + src as cells (tgt may be a nested merge).
  const ts = liveSize(tgt.id), ss = liveSize(src.id);
  const tn = (itemOf(tgt.id) && itemOf(tgt.id).gridstackNode) || tgt;
  const tgtChild = stripGeo(tgt), srcChild = stripGeo(src);
  const merge = {
    id: 'm' + Date.now() + Math.floor(performance.now()), type: 'merge', dir: wantDir,
    children: before ? [srcChild, tgtChild] : [tgtChild, srcChild],
    x: tn.x ?? 0, y: tn.y ?? 0,
    w: Math.min(horiz ? ts.w + ss.w : Math.max(ts.w, ss.w), COLS),
    h: horiz ? Math.max(ts.h, ss.h) : ts.h + ss.h,
  };
  removeTile(srcItem, src.id);
  removeTile(itemOf(tgt.id), tgt.id);
  addWidget(merge);
  afterMerge();
}

// A tile interaction was triggered -> send to FHEM, refresh soon after.
async function onAction(tile, args) {
  if (editMode || !tile.device) return;   // no toggling while editing
  try {
    setStatus('ok');
    await API.cmd(tile.device, args);
    setTimeout(() => Live.start(activeDeviceNames, applyLive, setStatus, 3000), 400);
  } catch (err) {
    setStatus('err', err.message);
  }
}

// Walk a merge tile's children (recursing into nested merges) and refresh each
// device cell. The descendant `.merge-cell .tile[data-tile-id]` selector reaches
// grandchildren too, since they all live inside the same grid item.
function applyMergeLive(item, mergeTile, map) {
  (mergeTile.children || []).forEach(c => {
    if (c.type === 'merge') { applyMergeLive(item, c, map); return; }
    if (!c.device) return;
    const cont = item.querySelector(`.merge-cell .tile[data-tile-id="${c.id}"]`);
    if (cont) Tiles.apply(cont, c, map[c.device], map);
  });
}

function applyLive(map) {
  _lastMap = map;
  if (Date.now() - _lastSnapSave > 30000) { _lastSnapSave = Date.now(); saveSnapshot(map); }
  grid.el.querySelectorAll('.grid-stack-item').forEach(item => {
    const id = item.getAttribute('gs-id');
    const tile = tiles[id];
    if (!tile) return;
    if (tile.type === 'merge') { applyMergeLive(item, tile, map); return; } // incl. nested stacks
    if (!tile.device) return;
    Tiles.apply(item.querySelector('.grid-stack-item-content'), tile, map[tile.device], map);
  });
}

// Local date/time tiles — pure client-side, no FHEM.
// Line 1: HH:mm   Line 2: "Mo., 30. Jun." (Wochentag., TT. Monat.)
const WDAYS  = I18N_DAYS;
const MONTHS = I18N_MONTHS;
function updateClocks() {
  const n = new Date(), p = x => String(x).padStart(2, '0');
  const time = p(n.getHours()) + ':' + p(n.getMinutes());
  const date = `${WDAYS[n.getDay()]}., ${p(n.getDate())}. ${MONTHS[n.getMonth()]}.`;
  document.querySelectorAll('.tile-clock').forEach(el => {
    const t = el.querySelector('.clk-time'); if (t) t.textContent = time;
    const d = el.querySelector('.clk-date'); if (d) d.textContent = date;
  });
}

function activeDeviceNames() {
  const s = new Set();
  for (const t of Object.values(tiles)) {
    if (t.device && t.type !== 'readingsgroup') s.add(t.device);
    if (t.type === 'weather' && t.sources)                       // weather: also foreign sources
      for (const k in t.sources) { const src = t.sources[k]; if (src && src.device) s.add(src.device); }
  }
  return [...s];
}

// ---- edit mode -----------------------------------------------------------
function toggleEdit() {
  editMode = !editMode;
  eachGrid(g => { g.enableMove(editMode); g.enableResize(editMode); }); // incl. group sub-grids
  document.body.classList.toggle('editing', editMode);
  el.editBtn.classList.toggle('active', editMode);
  el.editBtn.textContent = editMode ? tr('Fertig') : '✎';
  el.addBtn.classList.toggle('hidden', !editMode);
  el.saveBtn.classList.toggle('hidden', !editMode);
  renderTabs(currentDash && currentDash.id);    // show/hide the "+ Raum" add button, enable tab drag
  applyScale();                                 // edit = 1:1, view = zoom-to-fit
  requestAnimationFrame(syncAllGroups);         // cell width may shift between fit/1:1
}

// Serialize one grid's direct items into tile configs (recurses into groups).
// Reads geometry from gridstackNode (always explicit, incl. size 1) — grid.save()
// omits w/h at the default (1), which would silently drop shrink-to-1 resizes.
function serializeGrid(gridEl) {
  const num = (item, k) => { const v = item.getAttribute('gs-' + k); return v == null ? undefined : parseInt(v, 10); };
  return [...gridEl.children].filter(c => c.classList.contains('grid-stack-item')).map(item => {
    const id = item.getAttribute('gs-id');
    const t  = tiles[id] || {};
    const n  = item.gridstackNode || {};
    const o = {
      ...t,
      x: n.x ?? num(item, 'x') ?? t.x ?? 0,
      y: n.y ?? num(item, 'y') ?? t.y ?? 0,
      w: n.w ?? num(item, 'w') ?? t.w ?? 2,
      h: n.h ?? num(item, 'h') ?? t.h ?? 2,
    };
    delete o.autoPosition;                       // resolved to real x/y now; don't re-flow on reload
    if (t.type === 'group') {
      const inner = item.querySelector('.grid-stack');
      o.children = inner ? serializeGrid(inner) : (t.children || []);
      delete o.device;
    }
    if (t.type === 'merge') {                  // children are flex cells, not grid items
      o.children = (t.children || []).map(c => ({ ...c }));
      o.dir = t.dir || 'row';
      delete o.device;
    }
    return o;
  });
}

async function save() {
  const layout = serializeGrid(grid.el);
  try {
    await API.saveDashboard(currentDash.id, currentDash.name, layout);
    currentDash.layout = layout;
    saveSnapshot();
    flash(el.saveBtn, tr('Gespeichert ✓'));
  } catch (err) {
    setStatus('err', err.message);
  }
}

// ---- add/edit dialog -----------------------------------------------------
async function loadDeviceCache() {
  try {
    const { devices } = await API.deviceList();
    deviceCache = devices;
  } catch (err) { setStatus('err', err.message); }
}

// ---- helpers -------------------------------------------------------------
function setStatus(state, msg) {
  el.status.className = 'status ' + (state || '');
  el.status.textContent = state === 'err' ? 'Fehler' : '';   // dot only when ok
  el.status.title = msg || '';
}
function flash(btn, text) {
  const old = btn.textContent; btn.textContent = text;
  setTimeout(() => btn.textContent = old, 1200);
}

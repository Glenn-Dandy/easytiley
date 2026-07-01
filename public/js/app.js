// Main app: dashboard load/save, Gridstack editor, live wiring.
(() => {
  let grid, currentDash = null, editMode = false;
  let tiles = {};               // id -> tile config
  let deviceCache = [];         // [{name,type,room,readings[],sets[],onoff}]
  let editingTileId = null;     // set while the dialog edits an existing tile
  let noteEditId = null;        // set while the dedicated note dialog is open

  const $  = sel => document.querySelector(sel);
  const el = {};
  // 24-column grid (finer snap than the old 12). Sizes are in those finer units.
  const GRID_GEN = 2;                 // bump when the column resolution changes
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
    ['tabs','addBtn','saveBtn','editBtn','settingsBtn','status'].forEach(id => el[id] = document.getElementById(id));
    await migrateGrid();                       // one-time ×2 layout rescale to the finer grid

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
    setupDialog();
    setupNoteDialog();
    setupSettings();

    // NOTE: the full device list (heavy on single-threaded FHEM) is loaded
    // lazily on first "+ Kachel", not on every page load.
    await loadDashboards();

    Live.start(activeDeviceNames, applyLive, setStatus, 3000);
    setInterval(refreshReadingsGroups, 30000); // readingsGroups change slowly
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
      tab.innerHTML = `<span class="tab-name">${esc(d.name)}</span><span class="tab-x" title="Raum löschen">✕</span>`;
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
      add.className = 'tab-add'; add.textContent = '＋'; add.title = 'Neuer Raum';
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
    const name = prompt('Name des neuen Raums/Tabs:');
    if (!name) return;
    const { id } = await API.createDashboard(name);
    await loadDashboards(id);
  }

  async function renameTab(id) {
    const d = dashboards.find(x => x.id === id);
    const name = prompt('Raum umbenennen:', d ? d.name : '');
    if (!name) return;
    await API.saveDashboard(id, name, currentDash.layout);
    await loadDashboards(id);
  }

  async function deleteTab(id) {
    if (dashboards.length <= 1) { alert('Mindestens ein Raum muss bleiben.'); return; }
    if (!confirm('Diesen Raum mit allen Kacheln löschen?')) return;
    await API.deleteDashboard(id);
    if (currentDash && currentDash.id === id) currentDash = null;
    await loadDashboards();
  }

  async function loadDashboard(id) {
    currentDash = await API.dashboard(id);
    tiles = {};
    eachGrid(g => { if (g !== grid) g.destroy(false); }); // tear down old sub-grids
    grid.removeAll();
    for (const t of currentDash.layout) addWidget(t);     // addWidget registers + recurses into groups
    renderTabs(id);
    applyScale();                                         // re-fit zoom after layout change
    requestAnimationFrame(syncAllGroups);                 // match group sub-grid columns once laid out
    refreshReadingsGroups();
    updateClocks();
  }

  // Align every group's sub-grid cell width with the main grid (run after layout).
  function syncAllGroups() {
    grid.el.querySelectorAll('.grid-stack-item').forEach(it => syncGroupColumns(it));
  }

  // readingsGroup tiles: pull FHEM's own rendered HTML and inject it.
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
      } catch (e) { target.classList.remove('rg-loading'); target.textContent = 'Fehler: ' + e.message; }
    }
  }

  // Build our own themed table from the parsed readingsGroup rows.
  function renderRgTable(rows) {
    if (!rows || !rows.length) return '<div class="rg-empty">– keine Daten –</div>';
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
    cellHeight: 38, margin: 4, float: false,     // column is set per group from its width
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
    fitSubGrids();
  }

  // Group sub-grids: keep a constant tile (cell) size by adapting the column
  // count to the group's width -> tiles don't shrink, and the grid grows wider
  // (more columns) when there's room. ~64px cell.
  function fitSubGrids() {
    document.querySelectorAll('.grid-stack-nested').forEach(el => {
      const sub = el.gridstack; if (!sub) return;
      const w = el.clientWidth; if (w < 30) return;
      const col = Math.max(2, Math.min(COLS, Math.round(w / 64)));
      if (sub.getColumn() !== col) sub.column(col, 'none');
    });
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
  const WDAYS  = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MONTHS = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
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
    el.editBtn.textContent = editMode ? 'Fertig' : '✎';
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
      flash(el.saveBtn, 'Gespeichert ✓');
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

  // Custom autocomplete dropdown (replaces the cramped native <datalist>):
  // wider, live-filtering, keyboard-navigable. `getItems` returns the current
  // candidate list lazily -> reading options always reflect the chosen device.
  function attachAutocomplete(input, getItems) {
    const wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const menu = document.createElement('div');
    menu.className = 'ac-menu';
    wrap.appendChild(menu);

    let items = [], active = -1;
    const render = () => {
      const f = input.value.trim().toLowerCase();
      const all = getItems() || [];
      items = f ? all.filter(i => (i.value + ' ' + (i.sub || '')).toLowerCase().includes(f)) : all;
      if (active >= items.length) active = items.length - 1;
      menu.innerHTML = items.length
        ? items.map((i, idx) => `<div class="ac-item${idx === active ? ' active' : ''}" data-i="${idx}">
             <span class="ac-v">${esc(i.value)}</span>${i.sub ? `<span class="ac-s">${esc(i.sub)}</span>` : ''}</div>`).join('')
        : '<div class="ac-empty">keine Treffer</div>';
    };
    const open  = () => { render(); menu.classList.add('open'); };
    const close = () => { menu.classList.remove('open'); active = -1; };
    const choose = idx => {
      if (!items[idx]) return;
      input.value = items[idx].value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };

    input.addEventListener('focus', open);
    input.addEventListener('input', () => { active = -1; open(); });
    input.addEventListener('keydown', e => {
      if (!menu.classList.contains('open')) { if (e.key === 'ArrowDown') open(); return; }
      if (e.key === 'ArrowDown')      { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp')   { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter')     { if (active >= 0) { choose(active); e.preventDefault(); } }
      else if (e.key === 'Escape')    { close(); }
    });
    menu.addEventListener('mousedown', e => { const it = e.target.closest('.ac-item'); if (it) { e.preventDefault(); choose(+it.dataset.i); } });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  }

  // Reading is auto-derived for switches; only value/dimmer show the field.
  function dlgSyncRows() {
    const t = document.getElementById('tType').value;
    document.getElementById('rowDevice').style.display  = (t === 'group' || t === 'clock' || t === 'note' || t === 'label') ? 'none' : '';
    document.getElementById('rowUnit').style.display    = t === 'value'  ? '' : 'none';
    document.getElementById('rowCmds').style.display    = t === 'button' ? '' : 'none';
    document.getElementById('rowLight').style.display   = t === 'light'  ? '' : 'none';
    document.getElementById('rowNote').style.display    = t === 'note'   ? '' : 'none';
    document.getElementById('rowWeatherHint').style.display = t === 'weather' ? '' : 'none';
    document.getElementById('rowWeather').style.display = t === 'weather' ? '' : 'none';
    document.getElementById('rowThermo').style.display  = t === 'thermostat' ? '' : 'none';
    document.getElementById('rowStatus').style.display  = t === 'status' ? '' : 'none';
    document.getElementById('rowReading').style.display = (t === 'value' || t === 'dimmer' || t === 'status') ? '' : 'none';
    document.getElementById('rowIcon').style.display     = (t === 'clock') ? 'none' : ''; // clock has no chip
  }

  // Sensible defaults for the light-tile option block (RGB cmd from device, CT 2000-6500K).
  function initLightOpts() {
    const d = deviceCache.find(x => x.name === document.getElementById('tDevice').value);
    document.getElementById('lOptRgb').checked = true;
    document.getElementById('lOptCt').checked  = true;
    document.getElementById('lOptDim').checked = !!(d && (d.sets || []).some(s => ['pct', 'bright', 'dim', 'level', 'brightness'].includes(s)));
    document.getElementById('lRgbCmd').value = pickColor(d);
    document.getElementById('lCtCmd').value  = 'ct';
    document.getElementById('lCtMin').value  = 2000;
    document.getElementById('lCtMax').value  = 6500;
  }

  function fillReadings(deviceName) {
    return deviceCache.find(x => x.name === deviceName);
  }

  const deviceSets = name => { const d = deviceCache.find(x => x.name === name); return (d && d.sets) || []; };

  // ---- weather tile: foreign-device sources for current values -------------
  function collectWeatherSources() {
    const s = {};
    document.querySelectorAll('#rowWeather .wsrc').forEach(row => {
      const dev = row.querySelector('.wsrc-dev').value.trim();
      const rd  = row.querySelector('.wsrc-rd').value.trim();
      if (dev && rd) s[row.querySelector('.wsrc-dev').dataset.metric] = { device: dev, reading: rd };
    });
    return s;
  }
  function fillWeatherSources(sources) {
    document.querySelectorAll('#rowWeather .wsrc').forEach(row => {
      const dev = row.querySelector('.wsrc-dev');
      const s = (sources || {})[dev.dataset.metric] || {};
      dev.value = s.device || '';
      row.querySelector('.wsrc-rd').value = s.reading || '';
    });
  }

  // ---- icon picker ---------------------------------------------------------
  // A shared popover grid of all library icons. Lives INSIDE the modal dialog so
  // it renders in the dialog's top layer (a body child would hide behind the modal).
  let iconPickerEl = null, iconPickerCb = null;
  function ensureIconPicker() {
    if (iconPickerEl) return iconPickerEl;
    const pop = document.createElement('div');
    pop.className = 'icon-picker';
    pop.style.display = 'none';
    pop.innerHTML = '<input type="text" class="ip-search" placeholder="Icon suchen…" autocomplete="off">'
      + '<button type="button" class="ip-cell ip-auto" data-key="" title="Standard (automatisch)">Auto</button>'
      + '<button type="button" class="ip-cell ip-auto" data-key="none" title="Kein Icon">&#8709;</button>'
      + Tiles.iconList().map(i => `<button type="button" class="ip-cell" data-key="${i.key}" data-label="${esc(i.label.toLowerCase())}" title="${esc(i.label)}">${i.svg}</button>`).join('');
    pop.addEventListener('click', e => {
      const c = e.target.closest('.ip-cell'); if (!c) return;
      if (iconPickerCb) iconPickerCb(c.dataset.key);
      hideIconPicker();
    });
    const search = pop.querySelector('.ip-search');
    search.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });  // don't submit the form
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      pop.querySelectorAll('.ip-cell').forEach(c => {
        if (c.classList.contains('ip-auto')) { c.style.display = q ? 'none' : ''; return; }
        c.style.display = (!q || (c.dataset.label || '').includes(q)) ? '' : 'none';
      });
    });
    (document.getElementById('tileDialog') || document.body).appendChild(pop);
    iconPickerEl = pop;
    return pop;
  }
  function hideIconPicker() { if (iconPickerEl) iconPickerEl.style.display = 'none'; iconPickerCb = null; }
  // Position a popover just under `anchor`, inside the anchor's dialog (whose
  // backdrop-filter makes it the containing block for our fixed popover, so we
  // convert viewport coords -> dialog-relative coords).
  function placePopover(pop, anchor) {
    const host = anchor.closest('dialog') || document.getElementById('tileDialog') || document.body;
    if (pop.parentElement !== host) host.appendChild(pop);
    pop.style.display = 'grid';
    const hr = host.getBoundingClientRect();
    const ox = hr.left + (host.clientLeft || 0), oy = hr.top + (host.clientTop || 0);
    const r = anchor.getBoundingClientRect();
    const vx = Math.max(8, Math.min(r.left,      window.innerWidth  - pop.offsetWidth  - 8));
    const vy = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8));
    pop.style.left = (vx - ox) + 'px';
    pop.style.top  = (vy - oy) + 'px';
  }
  function openIconPicker(anchor, current, cb) {
    const pop = ensureIconPicker();
    iconPickerCb = cb;
    const search = pop.querySelector('.ip-search');
    if (search) { search.value = ''; pop.querySelectorAll('.ip-cell').forEach(c => c.style.display = ''); }
    pop.querySelectorAll('.ip-cell').forEach(c => c.classList.toggle('sel', c.dataset.key === (current || '')));
    placePopover(pop, anchor);
    if (search) setTimeout(() => search.focus(), 0);
  }
  document.addEventListener('mousedown', e => {
    if (iconPickerEl && iconPickerEl.style.display !== 'none'
        && !iconPickerEl.contains(e.target) && !e.target.closest('.icon-pick-btn')) hideIconPicker();
  });
  // Show the chosen icon (or placeholder) on an icon-pick button + store its key.
  function setIconBtn(btn, key) {
    btn.dataset.icon = key || '';
    btn.innerHTML = key === 'none' ? '&#8709;' : (key ? Tiles.iconSvg(key) : (btn.dataset.ph || 'Standard'));
  }
  function attachIconField(btn) {
    btn.addEventListener('click', () => openIconPicker(btn, btn.dataset.icon, key => setIconBtn(btn, key)));
  }

  // ---- icon colour picker (sits next to each icon field) -------------------
  const COLOR_PRESETS = ['#ff5d5d', '#ff9f3b', '#ffd25d', '#43d17a', '#54a0ff', '#6a5dff', '#ff5dce', '#e9edf4'];
  let colorPickerEl = null, colorPickerCb = null;
  function ensureColorPicker() {
    if (colorPickerEl) return colorPickerEl;
    const pop = document.createElement('div');
    pop.className = 'color-picker';
    pop.style.display = 'none';
    pop.innerHTML = '<button type="button" class="cpk-cell cpk-std" data-color="" title="Standard">&#8709;</button>'
      + COLOR_PRESETS.map(c => `<button type="button" class="cpk-cell" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')
      + '<label class="cpk-cell cpk-custom" title="Eigene Farbe"><input type="color"></label>';
    pop.addEventListener('click', e => {
      const cell = e.target.closest('.cpk-cell'); if (!cell || cell.classList.contains('cpk-custom')) return;
      if (colorPickerCb) colorPickerCb(cell.dataset.color);
      hideColorPicker();
    });
    const inp = pop.querySelector('.cpk-custom input');
    inp.addEventListener('input',  () => colorPickerCb && colorPickerCb(inp.value)); // live
    inp.addEventListener('change', () => hideColorPicker());
    (document.getElementById('tileDialog') || document.body).appendChild(pop);
    colorPickerEl = pop;
    return pop;
  }
  function hideColorPicker() { if (colorPickerEl) colorPickerEl.style.display = 'none'; colorPickerCb = null; }
  function openColorPicker(anchor, current, cb) {
    const pop = ensureColorPicker();
    colorPickerCb = cb;
    pop.querySelectorAll('.cpk-cell').forEach(c => c.classList.toggle('sel', (c.dataset.color || '') === (current || '')));
    if (current) pop.querySelector('.cpk-custom input').value = current;
    placePopover(pop, anchor);
  }
  document.addEventListener('mousedown', e => {
    if (colorPickerEl && colorPickerEl.style.display !== 'none'
        && !colorPickerEl.contains(e.target) && !e.target.closest('.color-pick-btn')) hideColorPicker();
  });
  function setColorBtn(btn, color) {
    btn.dataset.color = color || '';
    btn.classList.toggle('is-std', !color);
    btn.style.background = color || '';
  }
  function attachColorField(btn) {
    btn.addEventListener('click', () => openColorPicker(btn, btn.dataset.color, c => setColorBtn(btn, c)));
  }

  // Button tile editor: each button is a row of [command + optional label].
  function renderCmdSetList(deviceName) {            // autocomplete for the command field
    document.getElementById('cmdSetList').innerHTML =
      deviceSets(deviceName).map(s => `<option value="${esc(s)}">`).join('');
  }
  function addCmdRow(cmd = '', label = '', icon = '', glow = true, iconColor = '') {
    const row = document.createElement('div');
    row.className = 'cmd-row';
    row.innerHTML =
      `<input class="cmd-c" list="cmdSetList" placeholder="Befehl, z.B. on" value="${esc(cmd)}">
       <input class="cmd-l" placeholder="Text (optional)" value="${esc(label)}">
       <button type="button" class="cmd-ic icon-pick-btn" data-ph="Icon"></button>
       <button type="button" class="cmd-col color-pick-btn is-std" title="Icon-Farbe"></button>
       <label class="cmd-glow" title="Leuchtet, wenn dieser Zustand aktiv ist"><input type="checkbox" class="cmd-g"${glow !== false ? ' checked' : ''}>✨</label>
       <button type="button" class="cmd-rm" title="Entfernen">✕</button>`;
    const ic = row.querySelector('.cmd-ic');  setIconBtn(ic, icon);       attachIconField(ic);
    const co = row.querySelector('.cmd-col'); setColorBtn(co, iconColor); attachColorField(co);
    row.querySelector('.cmd-rm').addEventListener('click', () => row.remove());
    document.getElementById('cmdRows').appendChild(row);
  }
  function collectCmdRows() {
    return [...document.querySelectorAll('#cmdRows .cmd-row')]
      .map(r => ({ cmd: r.querySelector('.cmd-c').value.trim(), label: r.querySelector('.cmd-l').value.trim(),
                   icon: r.querySelector('.cmd-ic').dataset.icon || '', glow: r.querySelector('.cmd-g').checked,
                   iconColor: r.querySelector('.cmd-col').dataset.color || '' }))
      .filter(b => b.cmd);
  }

  // ---- status tile: reading value -> icon rows (reuses .cmd-row styling, no glow) ----
  function renderStatusValList() {                   // convenience presets for the value field
    document.getElementById('statusValList').innerHTML =
      ['open', 'closed', 'tilted', 'on', 'off', 'present', 'absent', 'locked', 'unlocked', 'motion', 'error']
        .map(v => `<option value="${esc(v)}">`).join('');
  }
  function addStatusRow(val = '', label = '', icon = '', iconColor = '') {
    const row = document.createElement('div');
    row.className = 'cmd-row';
    row.innerHTML =
      `<input class="cmd-c" list="statusValList" placeholder="Wert, z.B. open (leer=Standard)" value="${esc(val)}">
       <input class="cmd-l" placeholder="Text (optional)" value="${esc(label)}">
       <button type="button" class="cmd-ic icon-pick-btn" data-ph="Icon"></button>
       <button type="button" class="cmd-col color-pick-btn is-std" title="Icon-Farbe"></button>
       <button type="button" class="cmd-rm" title="Entfernen">✕</button>`;
    const ic = row.querySelector('.cmd-ic');  setIconBtn(ic, icon);       attachIconField(ic);
    const co = row.querySelector('.cmd-col'); setColorBtn(co, iconColor); attachColorField(co);
    row.querySelector('.cmd-rm').addEventListener('click', () => row.remove());
    document.getElementById('statusRows').appendChild(row);
  }
  function collectStatusRows() {
    return [...document.querySelectorAll('#statusRows .cmd-row')]
      .map(r => ({ val: r.querySelector('.cmd-c').value.trim(), label: r.querySelector('.cmd-l').value.trim(),
                   icon: r.querySelector('.cmd-ic').dataset.icon || '', iconColor: r.querySelector('.cmd-col').dataset.color || '' }))
      .filter(s => s.val || s.icon || s.label);   // keep "Standard" rows that at least set an icon/label
  }
  function seedStatusRows() {                        // helpful window defaults on first switch
    document.getElementById('statusRows').innerHTML = '';
    addStatusRow('open',   'offen',   'window-open',   '#e0a44c');
    addStatusRow('tilted', 'gekippt', 'window-tilt',   '#e0a44c');
    addStatusRow('closed', 'zu',      'window-closed', '#4caf7d');
  }

  function setupDialog() {
    el.dlg = document.getElementById('tileDialog');
    // Opening the modal makes the grid inert -> GridStack drops its pointer bindings.
    // Re-arm drag/resize on every close (OK, Abbrechen or Esc) while in edit mode.
    el.dlg.addEventListener('close', () => {
      if (editMode) eachGrid(g => { g.enableMove(true); g.enableResize(true); });
    });
    const type = document.getElementById('tType');
    const dev  = document.getElementById('tDevice');
    const reading = document.getElementById('tReading');

    // Wider, live-filtering pickers for device + reading.
    attachAutocomplete(dev, () => deviceCache.map(d => ({
      value: d.name,
      sub: (d.alias && d.alias !== d.name ? d.alias + ' · ' : '') + (d.type || ''),
    })));
    attachAutocomplete(reading, () => {
      const d = deviceCache.find(x => x.name === dev.value);
      return (d ? d.readings : []).map(r => ({ value: r }));
    });

    // Weather foreign-source rows: same device + reading autocomplete as above.
    document.querySelectorAll('#rowWeather .wsrc').forEach(row => {
      const wd = row.querySelector('.wsrc-dev'), wr = row.querySelector('.wsrc-rd');
      attachAutocomplete(wd, () => deviceCache.map(d => ({
        value: d.name, sub: (d.alias && d.alias !== d.name ? d.alias + ' · ' : '') + (d.type || ''),
      })));
      attachAutocomplete(wr, () => { const d = deviceCache.find(x => x.name === wd.value); return (d ? d.readings : []).map(r => ({ value: r })); });
    });

    // Fill the reading field with the sensible default for the chosen device+type.
    const applyDefaults = () => {
      const d = deviceCache.find(x => x.name === dev.value);
      if (!d) return;
      if (type.value === 'switch')      reading.value = d.onoff || 'state'; // YeeLight -> "power"
      else if (type.value === 'dimmer') reading.value = pickDim(d).reading;
    };

    document.getElementById('cmdAdd').addEventListener('click', () => addCmdRow());
    document.getElementById('statusAdd').addEventListener('click', () => addStatusRow());
    attachIconField(document.getElementById('tIconField'));
    attachColorField(document.getElementById('tIconColor'));

    type.addEventListener('change', () => {
      dlgSyncRows(); applyDefaults();
      if (type.value === 'button') { renderCmdSetList(dev.value); if (!document.querySelector('#cmdRows .cmd-row')) addCmdRow(); }
      if (type.value === 'status') { renderStatusValList(); if (!document.querySelector('#statusRows .cmd-row')) seedStatusRows(); }
      if (type.value === 'light')  initLightOpts();
      if (type.value === 'thermostat') fillThermoAuto(deviceCache.find(x => x.name === dev.value), false);
      if (type.value === 'weather' && !dev.value) {   // default to the PROPLANTA device
        const w = deviceCache.find(d => /proplanta|weather/i.test(d.type || ''));
        if (w) { dev.value = w.name; dev.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });
    document.getElementById('tLabelReset').addEventListener('click', () => {
      const d = deviceCache.find(x => x.name === dev.value);
      if (d) document.getElementById('tLabel').value = d.alias || d.name;
    });

    dev.addEventListener('change', () => {
      const d = fillReadings(dev.value);
      if (d) document.getElementById('tLabel').value = d.alias || d.name; // Geräte-Alias übernehmen
      applyDefaults();
      if (type.value === 'button') renderCmdSetList(dev.value);
      if (type.value === 'light')  document.getElementById('lRgbCmd').value = pickColor(d);
      if (type.value === 'thermostat') fillThermoAuto(d, true);   // device changed -> overwrite
    });

    document.getElementById('tileForm').addEventListener('submit', e => {
      // submit fires for every button. returnValue isn't set yet here, so check
      // the clicked button directly (Enter -> submitter null -> treat as OK).
      if (e.submitter && e.submitter.value !== 'ok') { editingTileId = null; return; }
      const f = e.target;
      const device = f.device.value.trim();
      const t = f.type.value;
      if (!device && t !== 'label' && t !== 'group' && t !== 'clock' && t !== 'note') return; // kein Gerät -> nichts anlegen
      const d = deviceCache.find(x => x.name === device);

      let rd = f.reading.value.trim();
      let setcmd, colorcmd, buttons, ctcmd, useRgb, useCt, ctMin, ctMax, useDim, dimcmd, dimReading;
      if (t === 'switch') rd = d ? (d.onoff || 'state') : (rd || 'state'); // on/off-Reading automatisch
      if (t === 'dimmer') { const p = pickDim(d); setcmd = p.setcmd; rd = rd || p.reading; }
      if (t === 'color')  { colorcmd = pickColor(d); rd = rd || (d && d.readings.includes('rgb') ? 'rgb' : 'state'); }
      if (t === 'light') {
        rd = d ? (d.onoff || 'state') : 'state';
        useRgb   = document.getElementById('lOptRgb').checked;
        colorcmd = document.getElementById('lRgbCmd').value;
        useCt    = document.getElementById('lOptCt').checked;
        ctcmd    = document.getElementById('lCtCmd').value.trim() || 'ct';
        ctMin    = parseInt(document.getElementById('lCtMin').value, 10) || 2000;
        ctMax    = parseInt(document.getElementById('lCtMax').value, 10) || 6500;
        if (document.getElementById('lOptDim').checked) { const p = pickDim(d); useDim = true; dimcmd = p.setcmd; dimReading = p.reading; }
      }
      let btnDisplay, sources;
      if (t === 'button') {
        buttons = collectCmdRows(); if (!buttons.length) buttons = [{ cmd: 'on' }];
        btnDisplay = document.getElementById('btnDisplay').value;
      }
      if (t === 'weather') sources = collectWeatherSources();
      const thermo = t === 'thermostat' ? collectThermo() : null;
      const statusMap = t === 'status' ? collectStatusRows() : undefined;

      const cfg = {
        type: t, device, setcmd, colorcmd, buttons, btnDisplay, sources, ctcmd, useRgb, useCt, ctMin, ctMax,
        useDim, dimcmd, dimReading, statusMap, ...(thermo || {}),
        icon: document.getElementById('tIconField').dataset.icon || '',
        iconColor: document.getElementById('tIconColor').dataset.color || '',
        hideHeader: !document.getElementById('tHeader').checked,
        reading: rd || 'state',
        label: f.label.value.trim(),
        unit:  f.unit.value.trim(),
        text:  t === 'note' ? document.getElementById('tNote').value : undefined,
      };

      if (editingTileId) {                          // --- update existing tile ---
        const ex = tiles[editingTileId] || {};
        if (ex.type === 'group') {                  // groups: rename only (keep nested grid + children)
          ex.label = cfg.label;
          const lbl = document.querySelector(`.grid-stack-item[gs-id="${editingTileId}"] .tile-label`);
          if (lbl) lbl.textContent = cfg.label;
        } else {
          tiles[editingTileId] = { ...ex, ...cfg };
          rebuildTileContent(editingTileId);
        }
      } else {                                      // --- create new tile ---
        const tile = { id: 't' + Date.now() + Math.floor(performance.now()),
                       autoPosition: true, ...DEFAULT_SIZE[t], ...cfg };
        if (t === 'group') tile.children = [];
        tiles[tile.id] = tile;
        addWidget(tile);
      }
      editingTileId = null;
      applyScale();                                 // re-fit zoom after adding a tile
      refreshReadingsGroups();                      // fill any new readingsGroup tile
      updateClocks();                               // fill a new clock tile right away
      if (!editMode) save();                        // normal-mode edit (note) -> persist now (no Save button visible)
    });
    dlgSyncRows();
  }

  // Pick the dim set-command + level reading a device actually supports
  // (YeeLight uses "bright", others "pct"/"dim"/"level").
  function pickDim(d) {
    const sets = (d && d.sets) || [], rds = (d && d.readings) || [];
    const setcmd  = ['pct', 'bright', 'dim', 'level', 'brightness'].find(s => sets.includes(s)) || 'pct';
    const reading = ['pct', 'bright', 'brightness', 'level', 'dim'].find(r => rds.includes(r)) || setcmd;
    return { setcmd, reading };
  }

  // ---- thermostat: auto-detect readings/commands across HM / MAX / HmIP -----
  function autoThermo(d) {
    const rds = (d && d.readings) || [], sets = (d && d.sets) || [];
    const pick = cands => cands.find(c => rds.includes(c)) || '';
    const actual  = pick(['measured-temp', 'temperature', 'ACTUAL_TEMPERATURE', 'temp']);
    const desired = pick(['desired-temp', 'desiredTemperature', 'SET_POINT_TEMPERATURE', 'desired']);
    const setcmd  = ['desired-temp', 'desiredTemperature', 'desired'].find(c => sets.includes(c)) || desired || 'desired-temp';
    const valve   = pick(['valveposition', 'ValveState', 'valve', 'valvePosition', 'LEVEL']);
    const battery = pick(['batteryLevel', 'battery', 'batteryPercent', 'BATTERY_STATE']);
    const mode    = pick(['controlMode', 'mode', 'SET_POINT_MODE']);
    return { actual, desired, setcmd, valve, battery, mode };
  }
  const thF = id => document.getElementById(id);
  // Fill the thermostat config fields. `force` overwrites (device change);
  // otherwise only empty fields are auto-filled (don't clobber manual edits).
  function fillThermoAuto(d, force) {
    if (!d) return;
    const a = autoThermo(d);
    const put = (id, v) => { const e = thF(id); if (e && (force || !e.value.trim())) e.value = v || ''; };
    put('tThActual', a.actual); put('tThDesired', a.desired); put('tThSet', a.setcmd);
    put('tThValve', a.valve);   put('tThBattery', a.battery); put('tThMode', a.mode);
    put('tThModeCmd', a.mode);
  }
  function fillThermo(t) {                                      // from a stored tile
    thF('tThStep').value    = t.tstep != null ? t.tstep : 0.5;
    thF('tThActual').value  = t.taReading || '';
    thF('tThDesired').value = t.tdReading || '';
    thF('tThSet').value     = t.tsetCmd   || '';
    thF('tThValve').value   = t.tvReading || '';
    thF('tThBattery').value = t.tbReading || '';
    thF('tThMode').value    = t.tmReading || '';
    thF('tThModeCmd').value = t.tmodeCmd  || '';
  }
  function collectThermo() {
    const g = id => thF(id).value.trim();
    return {
      taReading: g('tThActual'), tdReading: g('tThDesired'), tsetCmd: g('tThSet'),
      tstep: parseFloat(thF('tThStep').value) || 0.5,
      tvReading: g('tThValve'), tbReading: g('tThBattery'),
      tmReading: g('tThMode'),  tmodeCmd: g('tThModeCmd'),
    };
  }

  // Which colour set-command the device supports (rgb hex, hsv, or color); rgb default.
  function pickColor(d) {
    const sets = (d && d.sets) || [];
    return ['rgb', 'hsv', 'color'].find(c => sets.includes(c)) || 'rgb';
  }

  function openAddDialog() {
    if (!deviceCache.length) loadDeviceCache(); // lazy: fills the picker when ready
    editingTileId = null;
    document.getElementById('dlgTitle').textContent = 'Kachel hinzufügen';
    document.getElementById('tileForm').reset();
    document.getElementById('cmdRows').innerHTML = '';
    document.getElementById('statusRows').innerHTML = '';
    setIconBtn(document.getElementById('tIconField'), '');
    setColorBtn(document.getElementById('tIconColor'), '');
    document.getElementById('btnDisplay').value = 'text';
    fillWeatherSources({});
    dlgSyncRows();
    el.dlg.returnValue = '';
    el.dlg.showModal();
  }

  async function openEditDialog(id) {
    if (!deviceCache.length) await loadDeviceCache();
    const t = tiles[id];
    if (!t) return;
    editingTileId = id;
    document.getElementById('dlgTitle').textContent = 'Kachel bearbeiten';
    const f = document.getElementById('tileForm');
    f.reset();
    f.type.value   = t.type;
    f.device.value = t.device || '';
    fillReadings(t.device);
    f.reading.value = t.reading || '';
    f.label.value   = t.label || '';
    f.unit.value    = t.unit || '';
    document.getElementById('tHeader').checked = !t.hideHeader;
    document.getElementById('tNote').value = t.text || '';
    setIconBtn(document.getElementById('tIconField'), t.icon || '');
    setColorBtn(document.getElementById('tIconColor'), t.iconColor || '');
    if (t.type === 'weather') fillWeatherSources(t.sources);
    if (t.type === 'thermostat') fillThermo(t);
    if (t.type === 'status') {
      document.getElementById('statusRows').innerHTML = '';
      renderStatusValList();
      (t.statusMap && t.statusMap.length ? t.statusMap : [{}])
        .forEach(s => addStatusRow(s.val || '', s.label || '', s.icon || '', s.iconColor || ''));
    }
    if (t.type === 'button') {
      document.getElementById('btnDisplay').value = t.btnDisplay || 'text';
      document.getElementById('cmdRows').innerHTML = '';
      renderCmdSetList(t.device);
      const list = t.buttons || (t.cmds || []).map(c => ({ cmd: c }));
      (list.length ? list : [{ cmd: '' }]).forEach(b => addCmdRow(b.cmd, b.label || '', b.icon || '', b.glow, b.iconColor || ''));
    }
    if (t.type === 'light') {
      document.getElementById('lOptRgb').checked = t.useRgb !== false;
      document.getElementById('lOptCt').checked  = t.useCt  !== false;
      document.getElementById('lOptDim').checked = !!t.useDim;
      document.getElementById('lRgbCmd').value = t.colorcmd || 'rgb';
      document.getElementById('lCtCmd').value  = t.ctcmd || 'ct';
      document.getElementById('lCtMin').value  = t.ctMin || 2000;
      document.getElementById('lCtMax').value  = t.ctMax || 6500;
    }
    dlgSyncRows();
    el.dlg.returnValue = '';
    el.dlg.showModal();
  }

  // ---- dedicated note editor (separate from the big tile dialog) -----------
  function noteSyncRows() {
    const check = document.getElementById('nMode').value === 'check';
    document.getElementById('nTextRow').style.display  = check ? 'none' : '';
    document.getElementById('nItemsRow').style.display = check ? '' : 'none';
  }
  function setupNoteDialog() {
    el.noteDlg = document.getElementById('noteDialog');
    attachIconField(document.getElementById('nIcon'));
    attachColorField(document.getElementById('nIconColor'));
    document.getElementById('nMode').addEventListener('change', noteSyncRows);
    el.noteDlg.addEventListener('close', () => {
      const id = noteEditId; noteEditId = null;
      if (el.noteDlg.returnValue !== 'ok' || !id) return;
      const t = tiles[id]; if (!t) return;
      t.hideHeader = !document.getElementById('nHeader').checked;
      t.label = document.getElementById('nTitle').value.trim();
      t.icon  = document.getElementById('nIcon').dataset.icon || '';
      t.iconColor = document.getElementById('nIconColor').dataset.color || '';
      t.noteMode = document.getElementById('nMode').value;
      if (t.noteMode === 'check') {
        const prev = t.items || [];
        t.items = document.getElementById('nItems').value.split('\n').map(s => s.trim()).filter(Boolean)
          .map(text => ({ text, done: (prev.find(p => p.text === text) || {}).done || false })); // keep ticks for unchanged lines
      } else {
        t.text = document.getElementById('nText').value;
      }
      rebuildTileContent(id);
      save();                                       // normal mode has no Save button -> persist now
    });
  }
  function openNoteDialog(id) {
    const t = tiles[id]; if (!t) return;
    noteEditId = id;
    document.getElementById('nHeader').checked = !t.hideHeader;
    document.getElementById('nTitle').value = t.label || '';
    setIconBtn(document.getElementById('nIcon'), t.icon || '');
    setColorBtn(document.getElementById('nIconColor'), t.iconColor || '');
    document.getElementById('nMode').value = t.noteMode || 'text';
    document.getElementById('nText').value = t.text || '';
    document.getElementById('nItems').value = (t.items || []).map(it => it.text).join('\n');
    noteSyncRows();
    el.noteDlg.returnValue = '';
    el.noteDlg.showModal();
  }

  // ---- settings ------------------------------------------------------------
  function setupSettings() {
    el.settingsDlg = document.getElementById('settingsDialog');
    document.getElementById('sTheme').addEventListener('change', e => applyTheme(e.target.value)); // live

    document.getElementById('btnExport').addEventListener('click', async () => {
      try {
        const data = await API.exportLayout();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'fhem-dashboard-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click(); URL.revokeObjectURL(a.href);
        settingsResult('Layout exportiert ✓', true);
      } catch (err) { settingsResult('Export-Fehler: ' + err.message, false); }
    });
    const fileInput = document.getElementById('importFile');
    document.getElementById('btnImport').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0]; fileInput.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.dashboards) throw new Error('keine Dashboards in der Datei');
        if (!confirm('Alle aktuellen Dashboards durch den Import ersetzen?')) return;
        await API.importLayout(data);
        el.settingsDlg.close();
        currentDash = null;
        deviceCache = [];
        await loadDashboards();
      } catch (err) { settingsResult('Import-Fehler: ' + err.message, false); }
    });

    document.getElementById('settingsForm').addEventListener('submit', async e => {
      const action = e.submitter && e.submitter.value;
      if (action === 'cancel') return;              // close normally
      e.preventDefault();                           // keep open for test/save feedback
      const url  = document.getElementById('sFhemUrl').value.trim();
      const test = action === 'test';
      if (!url) { settingsResult('Bitte eine Adresse eingeben.', false); return; }
      settingsResult('…prüfe Verbindung…');
      try {
        const r = await API.saveSettings(url, test);
        if (test) {
          settingsResult(r.reachable ? '✓ erreichbar: ' + r.fhemUrl : '✗ nicht erreichbar: ' + r.fhemUrl, r.reachable);
        } else if (r.reachable) {
          settingsResult('✓ gespeichert & verbunden', true);
          deviceCache = [];                         // refresh picker for the new instance
          el.settingsDlg.close();
          await loadDashboards();
        } else {
          settingsResult('⚠ gespeichert, aber nicht erreichbar: ' + r.fhemUrl, false);
        }
      } catch (err) { settingsResult('Fehler: ' + err.message, false); }
    });
  }

  function settingsResult(text, ok) {
    let r = document.getElementById('sResult');
    if (!r) {
      r = document.createElement('div'); r.id = 'sResult';
      document.getElementById('settingsForm').insertBefore(r, document.querySelector('#settingsForm menu'));
    }
    r.textContent = text;
    r.className = 'result' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  }

  async function openSettings() {
    document.getElementById('sTheme').value = localStorage.getItem('theme') || 'aurora';
    try { const s = await API.settings(); document.getElementById('sFhemUrl').value = s.fhemUrl || ''; }
    catch (e) { /* ignore */ }
    settingsResult('');
    el.settingsDlg.showModal();
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
  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
})();

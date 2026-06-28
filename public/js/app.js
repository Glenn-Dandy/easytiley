// Main app: dashboard load/save, Gridstack editor, live wiring.
(() => {
  let grid, currentDash = null, editMode = false;
  let tiles = {};               // id -> tile config
  let deviceCache = [];         // [{name,type,room,readings[],sets[],onoff}]
  let editingTileId = null;     // set while the dialog edits an existing tile

  const $  = sel => document.querySelector(sel);
  const el = {};
  const DEFAULT_SIZE = {
    value:  { w: 2, h: 2 }, switch: { w: 2, h: 2 }, dimmer: { w: 3, h: 2 },
    color:  { w: 2, h: 2 }, light: { w: 3, h: 3 }, readingsgroup: { w: 6, h: 4 },
    group:  { w: 4, h: 4 }, button: { w: 2, h: 2 }, label: { w: 3, h: 1 },
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

  async function init() {
    applyTheme(localStorage.getItem('theme') || 'aurora');
    ['tabs','addBtn','saveBtn','editBtn','settingsBtn','status'].forEach(id => el[id] = document.getElementById(id));

    grid = GridStack.init({
      column: 12, cellHeight: 72, margin: 6, float: true,
      disableDrag: true, disableResize: true,
      acceptWidgets: true,                     // allow dragging tiles in/out of group boxes
      handle: '.tile-head',                    // drag by the header, leaving the corner free to resize
      resizable: { handles: 'se, s, e, sw' },
    });

    grid.el.addEventListener('click', onGridClick);
    el.editBtn.addEventListener('click', toggleEdit);
    el.addBtn.addEventListener('click', openAddDialog);
    el.saveBtn.addEventListener('click', save);
    el.settingsBtn.addEventListener('click', openSettings);
    setupDialog();
    setupSettings();

    // NOTE: the full device list (heavy on single-threaded FHEM) is loaded
    // lazily on first "+ Kachel", not on every page load.
    await loadDashboards();

    Live.start(activeDeviceNames, applyLive, setStatus, 3000);
    setInterval(refreshReadingsGroups, 30000); // readingsGroups change slowly
  }

  // ---- dashboards / rooms as tabs -----------------------------------------
  let dashboards = [];

  async function loadDashboards(selectId) {
    dashboards = (await API.dashboards()).dashboards;
    const id = selectId || (currentDash && currentDash.id) || (dashboards[0] && dashboards[0].id);
    if (id) await loadDashboard(id); else renderTabs(null);
  }

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
      el.tabs.appendChild(tab);
    });
    const add = document.createElement('div');
    add.className = 'tab-add'; add.textContent = '＋'; add.title = 'Neuer Raum';
    add.addEventListener('click', addTab);
    el.tabs.appendChild(add);
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
    refreshReadingsGroups();
  }

  // readingsGroup tiles: pull FHEM's own rendered HTML and inject it.
  async function refreshReadingsGroups() {
    for (const t of Object.values(tiles)) {
      if (t.type !== 'readingsgroup' || !t.device) continue;
      const item = grid.el.querySelector(`.grid-stack-item[gs-id="${t.id}"]`);
      const target = item && item.querySelector('.rg-content');
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
  const NESTED_OPTS = {                          // options for a group's sub-grid
    column: 6, cellHeight: 60, margin: 4, float: true,
    acceptWidgets: true, handle: '.tile-head', resizable: { handles: 'se, s, e, sw' },
  };

  // run a callback for every grid on the page (main grid + all group sub-grids)
  function eachGrid(fn) {
    document.querySelectorAll('.grid-stack').forEach(g => g.gridstack && fn(g.gridstack));
  }

  function addWidget(tile, targetGrid = grid) {
    tiles[tile.id] = tile;
    const big = tile.type === 'group';
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.setAttribute('gs-id', tile.id);
    item.setAttribute('gs-x', tile.x ?? 0);
    item.setAttribute('gs-y', tile.y ?? 0);
    item.setAttribute('gs-w', tile.w ?? (big ? 4 : 2));
    item.setAttribute('gs-h', tile.h ?? (big ? 4 : 2));
    item.appendChild(Tiles.build(tile, onAction));
    targetGrid.el.appendChild(item);
    targetGrid.makeWidget(item);

    if (big) { // turn the inner .grid-stack into a real sub-grid and fill it
      const sub = GridStack.init({ ...NESTED_OPTS, disableDrag: !editMode, disableResize: !editMode },
                                 item.querySelector('.grid-stack'));
      // Wire the parent<->child relationship so tiles can also be dragged OUT.
      // GridStack.init() alone doesn't set this (only makeSubGrid / a drop does).
      const gn = item.gridstackNode;
      if (gn) { gn.subGrid = sub; sub.parentGridItem = gn; }
      for (const child of (tile.children || [])) addWidget(child, sub);
    }
  }

  function removeTile(item, id) {
    if (tiles[id] && tiles[id].type === 'group') {            // drop children configs too
      item.querySelectorAll('.grid-stack-item').forEach(ci => delete tiles[ci.getAttribute('gs-id')]);
    }
    const owner = (item.gridstackNode && item.gridstackNode.grid) || grid;
    owner.removeWidget(item);
    delete tiles[id];
  }

  function onGridClick(e) {
    if (!editMode) return;
    const item = e.target.closest('.grid-stack-item');
    if (!item) return;
    const id = item.getAttribute('gs-id');
    if (e.target.closest('.tile-del'))       removeTile(item, id);
    else if (e.target.closest('.tile-edit')) openEditDialog(id);
  }

  // Replace a tile's content in place, keeping its grid position/size.
  function rebuildTileContent(id) {
    const item = grid.el.querySelector(`.grid-stack-item[gs-id="${id}"]`);
    if (!item) return;
    item.replaceChild(Tiles.build(tiles[id], onAction), item.querySelector('.grid-stack-item-content'));
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

  function applyLive(map) {
    grid.el.querySelectorAll('.grid-stack-item').forEach(item => {
      const id = item.getAttribute('gs-id');
      const tile = tiles[id];
      if (!tile || !tile.device) return;
      Tiles.apply(item.querySelector('.grid-stack-item-content'), tile, map[tile.device]);
    });
  }

  function activeDeviceNames() {
    return [...new Set(Object.values(tiles)
      .filter(t => t.device && t.type !== 'readingsgroup')
      .map(t => t.device))];
  }

  // ---- edit mode -----------------------------------------------------------
  function toggleEdit() {
    editMode = !editMode;
    eachGrid(g => { g.enableMove(editMode); g.enableResize(editMode); }); // incl. group sub-grids
    document.body.classList.toggle('editing', editMode);
    el.editBtn.classList.toggle('active', editMode);
    el.editBtn.textContent = editMode ? 'Fertig' : 'Bearbeiten';
    el.addBtn.classList.toggle('hidden', !editMode);
    el.saveBtn.classList.toggle('hidden', !editMode);
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
      if (t.type === 'group') {
        const inner = item.querySelector('.grid-stack');
        o.children = inner ? serializeGrid(inner) : (t.children || []);
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
      document.getElementById('deviceOptions').innerHTML =
        devices.map(d => `<option value="${esc(d.name)}">${esc(d.alias || d.name)} · ${esc(d.type)}</option>`).join('');
    } catch (err) { setStatus('err', err.message); }
  }

  // Reading is auto-derived for switches; only value/dimmer show the field.
  function dlgSyncRows() {
    const t = document.getElementById('tType').value;
    document.getElementById('rowDevice').style.display  = t === 'group' ? 'none' : '';
    document.getElementById('rowUnit').style.display    = t === 'value'  ? '' : 'none';
    document.getElementById('rowCmds').style.display    = t === 'button' ? '' : 'none';
    document.getElementById('rowReading').style.display = (t === 'value' || t === 'dimmer') ? '' : 'none';
  }

  function fillReadings(deviceName) {
    const d = deviceCache.find(x => x.name === deviceName);
    document.getElementById('readingOptions').innerHTML =
      (d ? d.readings : []).map(r => `<option value="${esc(r)}">`).join('');
    return d;
  }

  const deviceSets = name => { const d = deviceCache.find(x => x.name === name); return (d && d.sets) || []; };

  // Show the device's set-commands as checkboxes (each becomes a button).
  function renderCmdChoices(deviceName, selected = []) {
    const sets = deviceSets(deviceName);
    document.getElementById('cmdChoices').innerHTML = sets.length
      ? sets.map(s => `<label class="cmd-choice"><input type="checkbox" value="${esc(s)}"${selected.includes(s) ? ' checked' : ''}>${esc(s)}</label>`).join('')
      : '<span class="hint">Keine set-Befehle bekannt (Gerät evtl. offline) – unten eintragen.</span>';
  }

  function setupDialog() {
    el.dlg = document.getElementById('tileDialog');
    const type = document.getElementById('tType');
    const dev  = document.getElementById('tDevice');
    const reading = document.getElementById('tReading');

    // Fill the reading field with the sensible default for the chosen device+type.
    const applyDefaults = () => {
      const d = deviceCache.find(x => x.name === dev.value);
      if (!d) return;
      if (type.value === 'switch')      reading.value = d.onoff || 'state'; // YeeLight -> "power"
      else if (type.value === 'dimmer') reading.value = pickDim(d).reading;
    };

    type.addEventListener('change', () => {
      dlgSyncRows(); applyDefaults();
      if (type.value === 'button') renderCmdChoices(dev.value);
    });
    dev.addEventListener('change', () => {
      const d = fillReadings(dev.value);
      if (d && !document.getElementById('tLabel').value)
        document.getElementById('tLabel').value = d.alias || d.name;
      applyDefaults();
      if (type.value === 'button') renderCmdChoices(dev.value);
    });

    document.getElementById('tileForm').addEventListener('submit', e => {
      // submit fires for every button. returnValue isn't set yet here, so check
      // the clicked button directly (Enter -> submitter null -> treat as OK).
      if (e.submitter && e.submitter.value !== 'ok') { editingTileId = null; return; }
      const f = e.target;
      const device = f.device.value.trim();
      const t = f.type.value;
      if (!device && t !== 'label' && t !== 'group') return; // kein Gerät -> nichts anlegen
      const d = deviceCache.find(x => x.name === device);

      let rd = f.reading.value.trim();
      let setcmd, colorcmd, cmds, ctcmd;
      if (t === 'switch') rd = d ? (d.onoff || 'state') : (rd || 'state'); // on/off-Reading automatisch
      if (t === 'dimmer') { const p = pickDim(d); setcmd = p.setcmd; rd = rd || p.reading; }
      if (t === 'color')  { colorcmd = pickColor(d); rd = rd || (d && d.readings.includes('rgb') ? 'rgb' : 'state'); }
      if (t === 'light')  { rd = d ? (d.onoff || 'state') : 'state'; colorcmd = pickColor(d); ctcmd = 'ct'; }
      if (t === 'button') {
        const checked = [...document.querySelectorAll('#cmdChoices input:checked')].map(i => i.value);
        const custom  = f.cmds.value.split(',').map(s => s.trim()).filter(Boolean);
        cmds = [...checked, ...custom];
        if (!cmds.length) cmds = ['on'];
      }

      const cfg = {
        type: t, device, setcmd, colorcmd, cmds, ctcmd,
        reading: rd || 'state',
        label: f.label.value.trim(),
        unit:  f.unit.value.trim(),
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
                       x: 0, y: 0, ...DEFAULT_SIZE[t], ...cfg };
        if (t === 'group') tile.children = [];
        tiles[tile.id] = tile;
        addWidget(tile);
      }
      editingTileId = null;
      refreshReadingsGroups();                      // fill any new readingsGroup tile
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
    if (t.type === 'button') {
      const list = t.cmds || (t.cmd ? [t.cmd] : []);
      const sets = deviceSets(t.device);
      renderCmdChoices(t.device, list.filter(c => sets.includes(c)));
      f.cmds.value = list.filter(c => !sets.includes(c)).join(', ');
    }
    dlgSyncRows();
    el.dlg.returnValue = '';
    el.dlg.showModal();
  }

  // ---- settings ------------------------------------------------------------
  function setupSettings() {
    el.settingsDlg = document.getElementById('settingsDialog');
    document.getElementById('sTheme').addEventListener('change', e => applyTheme(e.target.value)); // live
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
    el.status.textContent = state === 'err' ? ('Fehler: ' + (msg || '')) : 'verbunden';
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

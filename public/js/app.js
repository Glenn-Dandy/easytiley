// Main app: dashboard load/save, Gridstack editor, live wiring.
(() => {
  let grid, currentDash = null, editMode = false;
  let tiles = {};               // id -> tile config
  let deviceCache = [];         // [{name,type,room,readings[]}]

  const $  = sel => document.querySelector(sel);
  const el = {};
  const DEFAULT_SIZE = {
    value:  { w: 2, h: 2 }, switch: { w: 2, h: 2 }, dimmer: { w: 3, h: 2 },
    button: { w: 2, h: 2 }, label:  { w: 3, h: 1 },
  };

  // ---- init ----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    ['dashSelect','addBtn','saveBtn','editBtn','status'].forEach(id => el[id] = document.getElementById(id));

    grid = GridStack.init({
      column: 12, cellHeight: 88, margin: 6, float: true,
      disableDrag: true, disableResize: true,
      draggable: { handle: '.grid-stack-item-content' },
    });

    grid.el.addEventListener('click', onGridClick);
    el.editBtn.addEventListener('click', toggleEdit);
    el.addBtn.addEventListener('click', openAddDialog);
    el.saveBtn.addEventListener('click', save);
    el.dashSelect.addEventListener('change', onDashChange);
    setupDialog();

    // NOTE: the full device list (heavy on single-threaded FHEM) is loaded
    // lazily on first "+ Kachel", not on every page load.
    await loadDashboards();

    Live.start(activeDeviceNames, applyLive, setStatus, 3000);
  }

  // ---- dashboards ----------------------------------------------------------
  async function loadDashboards(selectId) {
    const { dashboards } = await API.dashboards();
    el.dashSelect.innerHTML =
      dashboards.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('') +
      `<option value="__new__">➕ Neues Dashboard…</option>`;
    const id = selectId || (dashboards[0] && dashboards[0].id);
    if (id) { el.dashSelect.value = id; await loadDashboard(id); }
  }

  async function onDashChange() {
    if (el.dashSelect.value === '__new__') {
      const name = prompt('Name des neuen Dashboards:');
      if (!name) { el.dashSelect.value = currentDash?.id ?? ''; return; }
      const { id } = await API.createDashboard(name);
      await loadDashboards(id);
      return;
    }
    await loadDashboard(parseInt(el.dashSelect.value, 10));
  }

  async function loadDashboard(id) {
    currentDash = await API.dashboard(id);
    tiles = {};
    grid.removeAll();
    for (const t of currentDash.layout) { tiles[t.id] = t; addWidget(t); }
  }

  // ---- widgets -------------------------------------------------------------
  function addWidget(tile) {
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.setAttribute('gs-id', tile.id);
    item.setAttribute('gs-x', tile.x ?? 0);
    item.setAttribute('gs-y', tile.y ?? 0);
    item.setAttribute('gs-w', tile.w ?? 2);
    item.setAttribute('gs-h', tile.h ?? 2);
    item.appendChild(Tiles.build(tile, onAction));
    grid.el.appendChild(item);
    grid.makeWidget(item);
  }

  function onGridClick(e) {
    const del = e.target.closest('.tile-del');
    if (del && editMode) {
      const item = del.closest('.grid-stack-item');
      const id = item.getAttribute('gs-id');
      grid.removeWidget(item);
      delete tiles[id];
    }
  }

  // A tile interaction was triggered -> send to FHEM, refresh soon after.
  async function onAction(tile, args) {
    if (!tile.device) return;
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
    return [...new Set(Object.values(tiles).map(t => t.device).filter(Boolean))];
  }

  // ---- edit mode -----------------------------------------------------------
  function toggleEdit() {
    editMode = !editMode;
    grid.enableMove(editMode);
    grid.enableResize(editMode);
    document.body.classList.toggle('editing', editMode);
    el.editBtn.classList.toggle('active', editMode);
    el.editBtn.textContent = editMode ? 'Fertig' : 'Bearbeiten';
    el.addBtn.classList.toggle('hidden', !editMode);
    el.saveBtn.classList.toggle('hidden', !editMode);
  }

  async function save() {
    // Merge live geometry from gridstack with our tile config.
    const nodes = grid.save(false); // [{x,y,w,h,id}]
    const layout = nodes.map(n => ({ ...tiles[n.id], x: n.x, y: n.y, w: n.w, h: n.h }));
    try {
      await API.saveDashboard(currentDash.id, currentDash.name, layout);
      currentDash.layout = layout;
      layout.forEach(t => tiles[t.id] = t);
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

  function setupDialog() {
    const dlg = document.getElementById('tileDialog');
    el.dlg = dlg;
    const type = document.getElementById('tType');
    const dev  = document.getElementById('tDevice');

    const reading = document.getElementById('tReading');

    // Reading is auto-derived for switches (and irrelevant for button/label),
    // so only the value/dimmer types show the field.
    const syncRows = () => {
      const t = type.value;
      document.getElementById('rowUnit').style.display    = t === 'value'  ? '' : 'none';
      document.getElementById('rowCmd').style.display     = t === 'button' ? '' : 'none';
      document.getElementById('rowReading').style.display = (t === 'value' || t === 'dimmer') ? '' : 'none';
    };

    // Fill the reading field with the sensible default for the chosen device+type.
    const applyDefaults = () => {
      const d = deviceCache.find(x => x.name === dev.value);
      if (!d) return;
      if (type.value === 'switch') {
        reading.value = d.onoff || 'state';            // YeeLight -> "power"
      } else if (type.value === 'dimmer') {
        reading.value = pickDim(d).reading;
      }
    };

    type.addEventListener('change', () => { syncRows(); applyDefaults(); });

    dev.addEventListener('change', () => {
      const d = deviceCache.find(x => x.name === dev.value);
      document.getElementById('readingOptions').innerHTML =
        (d ? d.readings : []).map(r => `<option value="${esc(r)}">`).join('');
      if (d && !document.getElementById('tLabel').value)
        document.getElementById('tLabel').value = d.alias || d.name;
      applyDefaults();
    });

    document.getElementById('tileForm').addEventListener('submit', e => {
      // submit fires for both buttons. returnValue isn't set yet here,
      // so check the clicked button directly (Enter -> submitter null -> treat as OK).
      if (e.submitter && e.submitter.value !== 'ok') return; // Abbrechen
      const f = e.target;
      const device = f.device.value.trim();
      const t = f.type.value;
      if (!device && t !== 'label') return; // kein Gerät -> nichts anlegen
      const d = deviceCache.find(x => x.name === device);

      let rd = f.reading.value.trim();
      let setcmd;
      if (t === 'switch') rd = d ? (d.onoff || 'state') : (rd || 'state'); // on/off-Reading automatisch
      if (t === 'dimmer') { const p = pickDim(d); setcmd = p.setcmd; rd = rd || p.reading; }

      const tile = {
        id:     't' + Date.now() + Math.floor(performance.now()),
        type:   t,
        device, setcmd,
        reading: rd || 'state',
        label:  f.label.value.trim(),
        unit:   f.unit.value.trim(),
        cmd:    f.cmd.value.trim(),
        x: 0, y: 0, ...DEFAULT_SIZE[t],
      };
      tiles[tile.id] = tile;
      addWidget(tile);
      f.reset(); syncRows();
    });
    syncRows();
  }

  // Pick the dim set-command + level reading a device actually supports
  // (YeeLight uses "bright", others "pct"/"dim"/"level").
  function pickDim(d) {
    const sets = (d && d.sets) || [], rds = (d && d.readings) || [];
    const setcmd  = ['pct', 'bright', 'dim', 'level', 'brightness'].find(s => sets.includes(s)) || 'pct';
    const reading = ['pct', 'bright', 'brightness', 'level', 'dim'].find(r => rds.includes(r)) || setcmd;
    return { setcmd, reading };
  }

  function openAddDialog() {
    if (!deviceCache.length) loadDeviceCache(); // lazy: fills the picker when ready
    document.getElementById('tileForm').reset();
    document.querySelectorAll('#tileForm .row-extra').forEach(r => r.style.display = 'none');
    document.getElementById('rowUnit').style.display = '';
    el.dlg.returnValue = '';
    el.dlg.showModal();
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

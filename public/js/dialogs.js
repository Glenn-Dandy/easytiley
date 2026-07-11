// Dialogs: tile add/edit (incl. button/status/thermostat/weather config),
// note editor and settings. Shares top-level scope with ui.js/app.js.
// Reading is auto-derived for switches; only value/dimmer show the field.
function dlgSyncRows() {
  const t = document.getElementById('tType').value;
  document.getElementById('rowDevice').style.display  = (t === 'group' || t === 'clock' || t === 'note' || t === 'label' || t === 'chart') ? 'none' : '';
  document.getElementById('rowUnit').style.display    = (t === 'value' || t === 'chart') ? '' : 'none';
  document.getElementById('rowCmds').style.display    = t === 'button' ? '' : 'none';
  document.getElementById('rowLight').style.display   = t === 'light'  ? '' : 'none';
  document.getElementById('rowNote').style.display    = t === 'note'   ? '' : 'none';
  document.getElementById('rowWeatherHint').style.display = t === 'weather' ? '' : 'none';
  document.getElementById('rowWeather').style.display = t === 'weather' ? '' : 'none';
  document.getElementById('rowThermo').style.display  = t === 'thermostat' ? '' : 'none';
  document.getElementById('rowCover').style.display   = t === 'cover' ? '' : 'none';
  document.getElementById('rowStatus').style.display  = t === 'status' ? '' : 'none';
  document.getElementById('rowChart').style.display   = t === 'chart' ? '' : 'none';
  document.getElementById('rowReading').style.display = (t === 'value' || t === 'dimmer' || t === 'status') ? '' : 'none';
  document.getElementById('rowIcon').style.display     = (t === 'clock' || t === 'weather') ? 'none' : ''; // clock has no chip; weather brings its own icon
  document.getElementById('rowLabel').style.display    = t === 'weather' ? 'none' : '';                    // weather needs no custom label
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

// Live values for the reading dropdown: fetched once per device, shown as the
// small right-hand column so you don't have to guess what a reading holds.
const readingVals = {};
async function loadReadingValues(name) {
  if (!name || readingVals[name]) return;
  try {
    const { devices } = await API.devices(name);
    if (devices && devices[0]) {
      readingVals[name] = {};
      for (const [k, v] of Object.entries(devices[0].readings || {})) readingVals[name][k] = v.value;
    }
  } catch (e) { /* dropdown just shows no values */ }
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

// Button tile editor: each button is a row of [command + optional label].
function renderCmdSetList(deviceName) {            // autocomplete for the command field
  document.getElementById('cmdSetList').innerHTML =
    deviceSets(deviceName).map(s => `<option value="${esc(s)}">`).join('');
}
function addCmdRow(cmd = '', label = '', icon = '', glow = true, iconColor = '') {
  const row = document.createElement('div');
  row.className = 'cmd-row';
  row.innerHTML =
    `<input class="cmd-c" list="cmdSetList" placeholder="${tr('Befehl, z.B. on')}" value="${esc(cmd)}">
     <input class="cmd-l" placeholder="${tr('Text (optional)')}" value="${esc(label)}">
     <button type="button" class="cmd-ic icon-pick-btn" data-ph="Icon"></button>
     <button type="button" class="cmd-col color-pick-btn is-std" title="${tr('Icon-Farbe')}"></button>
     <label class="cmd-glow" title="${tr('Leuchtet, wenn dieser Zustand aktiv ist')}"><input type="checkbox" class="cmd-g"${glow !== false ? ' checked' : ''}>✨</label>
     <button type="button" class="cmd-rm" title="${tr('Entfernen')}">✕</button>`;
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
    `<input class="cmd-c" list="statusValList" placeholder="${tr('Wert, z.B. open (leer=Standard)')}" value="${esc(val)}">
     <input class="cmd-l" placeholder="${tr('Text (optional)')}" value="${esc(label)}">
     <button type="button" class="cmd-ic icon-pick-btn" data-ph="Icon"></button>
     <button type="button" class="cmd-col color-pick-btn is-std" title="${tr('Icon-Farbe')}"></button>
     <button type="button" class="cmd-rm" title="${tr('Entfernen')}">✕</button>`;
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
  addStatusRow('open',   tr('offen'),   'window-open',   '#e0a44c');
  addStatusRow('tilted', tr('gekippt'), 'window-tilt',   '#e0a44c');
  addStatusRow('closed', tr('zu'),      'window-closed', '#4caf7d');
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
  attachAutocomplete(document.getElementById('tChLog'), () => deviceCache
    .filter(d => /^(filelog|dblog)$/i.test(d.type || ''))
    .map(d => ({ value: d.name, sub: d.type || '' })));
  document.getElementById('tChLog').addEventListener('change', () => chartLogChanged(true));
  document.getElementById('tChPart').addEventListener('change', chartPartChanged);
  attachAutocomplete(reading, () => {
    const d = deviceCache.find(x => x.name === dev.value);
    const vals = readingVals[dev.value] || {};
    return (d ? d.readings : []).map(r => ({
      value: r,
      sub: vals[r] !== undefined ? String(vals[r]).slice(0, 26) : '',
    }));
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
    if (type.value === 'cover') fillCoverAuto(deviceCache.find(x => x.name === dev.value), false);
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
    loadReadingValues(dev.value);                 // values for the reading dropdown
    const d = fillReadings(dev.value);
    if (d) document.getElementById('tLabel').value = d.alias || d.name; // Geräte-Alias übernehmen
    applyDefaults();
    if (type.value === 'button') renderCmdSetList(dev.value);
    if (type.value === 'light')  document.getElementById('lRgbCmd').value = pickColor(d);
    if (type.value === 'thermostat') fillThermoAuto(d, true);   // device changed -> overwrite
    if (type.value === 'cover') fillCoverAuto(d, true);
  });

  document.getElementById('tileForm').addEventListener('submit', e => {
    // submit fires for every button. returnValue isn't set yet here, so check
    // the clicked button directly (Enter -> submitter null -> treat as OK).
    if (e.submitter && e.submitter.value !== 'ok') { editingTileId = null; return; }
    const f = e.target;
    const device = f.device.value.trim();
    const t = f.type.value;
    if (!device && t !== 'label' && t !== 'group' && t !== 'clock' && t !== 'note' && t !== 'chart') return; // kein Gerät -> nichts anlegen
    if (t === 'chart' && !thF('tChLog').value.trim()) return;   // chart braucht nur ein Log-Gerät
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
    const cover  = t === 'cover' ? collectCover() : null;
    const chart  = t === 'chart' ? collectChart() : null;
    const statusMap = t === 'status' ? collectStatusRows() : undefined;

    const cfg = {
      type: t, device: t === 'chart' ? '' : device,   // charts read from the log, not a live device
      setcmd, colorcmd, buttons, btnDisplay, sources, ctcmd, useRgb, useCt, ctMin, ctMax,
      useDim, dimcmd, dimReading, statusMap, ...(thermo || {}), ...(cover || {}), ...(chart || {}),
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
    refreshCharts();                              // fill any new chart tile
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

// ---- chart: the log device is the source of truth. Its REGEXP internal lists
// what gets logged ("dev:reading:.*|dev2:reading2:.*") - we offer those as a
// readable "Messwert" dropdown and generate the cryptic column spec ourselves.
function chartSpecFor(logName, dev, rd) {
  const l = deviceCache.find(x => x.name === logName);
  if (l && /dblog/i.test(l.type || '')) return `${dev}:${rd}`;
  return `4:${dev}.${rd}:0:`;   // FileLog line "ts dev rd: val" -> col 4, "." matches the space
}
async function chartLogChanged(setLabel) {
  const log = thF('tChLog').value.trim();
  const sel = thF('tChPart');
  sel.innerHTML = '';
  if (!log) return;
  // Beschriftung aus dem Log-Namen: "FileLog_Bad_TempHum" -> "Bad TempHum"
  const lbl = document.getElementById('tLabel');
  if (setLabel || !lbl.value) lbl.value = log.replace(/^(FileLog[_.]|Log[_.])/i, '').replace(/_/g, ' ');
  let parts = [];
  try {
    const r = await API.rawCmd('jsonlist2 ' + log.replace(/[^A-Za-z0-9_.\-]/g, ''));
    const j = JSON.parse(r.result);
    const re = (((j.Results || [])[0] || {}).Internals || {}).REGEXP || '';
    const seen = new Set();
    for (const p of re.split('|')) {
      const m = /^([\w.\-]+):([\w.\-]+)/.exec(p.trim());
      if (!m || m[2] === '.*' || seen.has(m[1] + ':' + m[2])) continue;
      seen.add(m[1] + ':' + m[2]);
      parts.push({ dev: m[1], rd: m[2] });
    }
  } catch (e) { /* offline/DbLog etc. -> manual spec below */ }
  const oneDev = new Set(parts.map(p => p.dev)).size <= 1;
  const alias = n => { const d = deviceCache.find(x => x.name === n); return (d && d.alias && d.alias !== n) ? d.alias : n; };
  for (const p of parts) {
    const o = document.createElement('option');
    o.value = p.dev + '\n' + p.rd;                       // \n can't appear in either name
    o.textContent = oneDev ? p.rd : `${p.rd} – ${alias(p.dev)}`;
    sel.appendChild(o);
  }
  if (!parts.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = tr('– manuell (siehe Erweitert) –');
    sel.appendChild(o);
  }
  // keep a stored spec selected when re-opening the dialog for an existing tile
  const cur = thF('tChSpec').value.trim();
  let matched = false;
  for (const o of sel.options) {
    if (!o.value) continue;
    const [d, rd] = o.value.split('\n');
    if (chartSpecFor(log, d, rd) === cur) { sel.value = o.value; matched = true; break; }
  }
  if (!matched) chartPartChanged();                      // default: first entry -> generate spec
}
function chartPartChanged() {
  const log = thF('tChLog').value.trim();
  const v = thF('tChPart').value;
  if (!log || !v) return;
  const [dev, rd] = v.split('\n');
  thF('tChSpec').value = chartSpecFor(log, dev, rd);
}
function fillChart(t) {
  thF('tChLog').value   = t.chLog || '';
  thF('tChSpec').value  = t.chSpec || '';
  thF('tChHours').value = String(t.chHours || 24);
  thF('tChSmooth').checked = !!t.chSmooth;
  thF('tChLabels').checked = t.chLabels !== false;
  if (t.chLog) chartLogChanged(false);                   // repopulate the Messwert dropdown
}
function collectChart() {
  return {
    chLog: thF('tChLog').value.trim(),
    chSpec: thF('tChSpec').value.trim(),
    chHours: parseInt(thF('tChHours').value, 10) || 24,
    chSmooth: thF('tChSmooth').checked,
    chLabels: thF('tChLabels').checked,
  };
}

// ---- cover (Rollladen/Jalousie): auto-detect across HM / HmIP / Shelly / ROLLO / ZWave ----
function autoCover(d) {
  const rds = (d && d.readings) || [], sets = (d && d.sets) || [];
  const pos    = ['pct', 'level', 'position', 'ShutterPosition', 'dim', 'LEVEL'].find(r => rds.includes(r)) || '';
  const posCmd = ['pct', 'level', 'position', 'ShutterPosition', 'dim'].find(c => sets.includes(c)) || pos || 'pct';
  const up     = ['up', 'auf', 'open', 'on'].find(c => sets.includes(c)) || '';
  const down   = ['down', 'ab', 'close', 'closes', 'off'].find(c => sets.includes(c)) || '';
  const stop   = ['stop', 'halt'].find(c => sets.includes(c)) || '';
  return { pos, posCmd, up, down, stop };
}
function fillCoverAuto(d, force) {
  if (!d) return;
  const a = autoCover(d);
  const put = (id, v) => { const f = thF(id); if (force || !f.value) f.value = v; };
  put('tCvPos', a.pos); put('tCvPosCmd', a.posCmd);
  put('tCvUp', a.up); put('tCvDown', a.down); put('tCvStop', a.stop);
}
function fillCover(t) {                                       // from a stored tile
  thF('tCvPos').value    = t.cposReading || '';
  thF('tCvPosCmd').value = t.cposCmd || '';
  thF('tCvUp').value     = t.cupCmd || '';
  thF('tCvDown').value   = t.cdownCmd || '';
  thF('tCvStop').value   = t.cstopCmd || '';
  thF('tCvInvert').checked = !!t.cinvert;
}
function collectCover() {
  const g = id => thF(id).value.trim();
  return {
    cposReading: g('tCvPos'), cposCmd: g('tCvPosCmd'),
    cupCmd: g('tCvUp'), cdownCmd: g('tCvDown'), cstopCmd: g('tCvStop'),
    cinvert: thF('tCvInvert').checked,
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
  document.getElementById('dlgTitle').textContent = tr('Kachel hinzufügen');
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
  document.getElementById('dlgTitle').textContent = tr('Kachel bearbeiten');
  const f = document.getElementById('tileForm');
  f.reset();
  f.type.value   = t.type;
  f.device.value = t.device || '';
  fillReadings(t.device);
  loadReadingValues(t.device);
  f.reading.value = t.reading || '';
  f.label.value   = t.label || '';
  f.unit.value    = t.unit || '';
  document.getElementById('tHeader').checked = !t.hideHeader;
  document.getElementById('tNote').value = t.text || '';
  setIconBtn(document.getElementById('tIconField'), t.icon || '');
  setColorBtn(document.getElementById('tIconColor'), t.iconColor || '');
  if (t.type === 'weather') fillWeatherSources(t.sources);
  if (t.type === 'thermostat') fillThermo(t);
  if (t.type === 'cover') fillCover(t);
  if (t.type === 'chart') fillChart(t);
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
  document.getElementById('sLang').addEventListener('change', e => {
    localStorage.setItem('lang', e.target.value);
    location.reload();                       // re-translate the whole UI
  });
  const hap = document.getElementById('sHaptic');
  hap.addEventListener('change', () => localStorage.setItem('haptic', hap.checked ? '1' : '0'));
  const perf = document.getElementById('sPerf');
  perf.addEventListener('change', () => {          // wirkt sofort, pro Geraet gespeichert
    localStorage.setItem('perf', perf.checked ? '1' : '0');
    document.body.classList.toggle('perf', perf.checked);
  });
  el.settingsDlg = document.getElementById('settingsDialog');
  document.getElementById('sTheme').addEventListener('change', e => applyTheme(e.target.value)); // live

  document.getElementById('btnExport').addEventListener('click', async () => {
    try {
      const data = await API.exportLayout();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = 'fhem-dashboard-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click(); URL.revokeObjectURL(a.href);
      settingsResult(tr('Layout exportiert ✓'), true);
    } catch (err) { settingsResult(tr('Export-Fehler: ') + err.message, false); }
  });
  const fileInput = document.getElementById('importFile');
  document.getElementById('btnImport').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.dashboards) throw new Error(tr('keine Dashboards in der Datei'));
      if (!confirm(tr('Alle aktuellen Dashboards durch den Import ersetzen?'))) return;
      await API.importLayout(data);
      el.settingsDlg.close();
      currentDash = null;
      deviceCache = [];
      await loadDashboards();
    } catch (err) { settingsResult(tr('Import-Fehler: ') + err.message, false); }
  });

  document.getElementById('settingsForm').addEventListener('submit', async e => {
    const action = e.submitter && e.submitter.value;
    if (action === 'cancel') return;              // close normally
    e.preventDefault();                           // keep open for test/save feedback
    const url  = document.getElementById('sFhemUrl').value.trim();
    const test = action === 'test';
    if (!url) { settingsResult(tr('Bitte eine Adresse eingeben.'), false); return; }
    settingsResult(tr('…prüfe Verbindung…'));
    try {
      const cfg = {
        fhemUrl:  url,
        fhemUser: document.getElementById('sUser').value.trim(),
        fhemPass: document.getElementById('sPass').value,   // leer = gespeichertes behalten
        insecure: document.getElementById('sInsecure').checked,
      };
      const r = await API.saveSettings(cfg, test);
      if (test) {
        settingsResult(r.reachable ? tr('✓ erreichbar: ') + r.fhemUrl
          : (r.authFailed ? tr('✗ Login abgelehnt (Benutzer/Passwort prüfen)') : tr('✗ nicht erreichbar: ') + r.fhemUrl), r.reachable);
      } else if (r.reachable) {
        settingsResult(tr('✓ gespeichert & verbunden'), true);
        deviceCache = [];                         // refresh picker for the new instance
        el.settingsDlg.close();
        await loadDashboards();
      } else {
        settingsResult(r.authFailed ? tr('⚠ gespeichert, aber Login abgelehnt (Benutzer/Passwort prüfen)')
          : tr('⚠ gespeichert, aber nicht erreichbar: ') + r.fhemUrl, false);
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
  document.getElementById('sLang').value = LANG;
  document.getElementById('sHaptic').checked = localStorage.getItem('haptic') !== '0';
  document.getElementById('sPerf').checked = localStorage.getItem('perf') === '1';
  try {
    const s = await API.settings();
    document.getElementById('sFhemUrl').value = s.fhemUrl || '';
    document.getElementById('sUser').value = s.fhemUser || '';
    const pass = document.getElementById('sPass');
    pass.value = '';
    pass.placeholder = s.hasPass ? tr('gespeichert – leer lassen zum Behalten') : '';
    document.getElementById('sInsecure').checked = s.insecure !== false;
  } catch (e) { /* ignore */ }
  document.getElementById('sAbout').textContent = `${APP_NAME} V${APP_VERSION}`;
  settingsResult('');
  el.settingsDlg.showModal();
}


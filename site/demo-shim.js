// EasyTiley demo for GitHub Pages: the real frontend, but FHEM and the PHP
// backend are simulated in the browser. Loaded right after js/api.js (the Pages
// workflow injects it), it swaps every API method for an in-memory version and
// replaces EventSource with a fake push stream so live updates use the real
// Live code path. Dashboards persist in this browser only (localStorage).
(() => {
  const L = (de, en) => (typeof LANG !== 'undefined' && LANG === 'en') ? en : de;
  const STORE = 'easytiley-demo-v1';
  const now = () => Math.floor(Date.now() / 1000);
  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const round1 = n => Math.round(n * 10) / 10;

  // ---- simulated FHEM devices ------------------------------------------------
  const fcDate = i => { const d = new Date(); d.setDate(d.getDate() + i);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); };
  const fcWx = ['heiter', 'sonnig', 'bewölkt', 'Regenschauer', 'heiter', 'wolkig', 'sonnig'];
  const weather = { weather: 'heiter', temperature: 17, humidity: 62, pressure: 1016, wind: 9,
    fc0_tempMax: 19, fc0_tempMin: 8, fc0_chOfRainDay: 10, fc0_sun: 70, fc0_uv: 3 };
  for (let i = 1; i <= 6; i++) Object.assign(weather, {
    ['fc' + i + '_date']: fcDate(i), ['fc' + i + '_weatherDay']: fcWx[i],
    ['fc' + i + '_tempMax']: [18, 21, 16, 13, 17, 19][i - 1], ['fc' + i + '_tempMin']: [7, 9, 10, 8, 6, 9][i - 1],
    ['fc' + i + '_chOfRainDay']: [5, 0, 40, 80, 20, 10][i - 1] });

  //            name               type         room           alias                           sets                                   readings
  const DEFS = [
    ['Wetter',          'PROPLANTA', 'Wetter',       L('Wetter', 'Weather'),               [],                                     weather],
    ['Aussen',          'CUL_WS',    'Garten',       L('Außensensor', 'Outdoor sensor'),   [],                                     { temperature: 16.8, humidity: 64 }],
    ['WZ_Klima',        'MQTT2',     'Wohnzimmer',   L('Klima Wohnzimmer', 'Living climate'), [],                                  { temperature: 21.4, humidity: 47 }],
    ['WZ_Deckenlicht',  'HUEDevice', 'Wohnzimmer',   L('Deckenlicht', 'Ceiling light'),    ['on', 'off', 'pct', 'rgb', 'ct'],      { state: 'on', pct: 70, rgb: 'ffb36b', ct: 3000 }],
    ['WZ_Stehlampe',    'MQTT2',     'Wohnzimmer',   L('Stehlampe', 'Floor lamp'),         ['on', 'off'],                          { state: 'off' }],
    ['WZ_TV',           'MQTT2',     'Wohnzimmer',   L('Fernseher', 'TV'),                 ['on', 'off'],                          { state: 'on', power: 86 }],
    ['WZ_Szene',        'dummy',     'Wohnzimmer',   L('Szene', 'Scene'),                  ['scene'],                              { state: 'ok', scene: 'Hell' }],
    ['WZ_Thermostat',   'CUL_HM',    'Wohnzimmer',   L('Thermostat Wohnzimmer', 'Living thermostat'), ['desired-temp', 'controlMode'],
                                                                                           { 'measured-temp': 20.6, 'desired-temp': 21.5, controlMode: 'auto', ValvePosition: 34, batteryLevel: 80 }],
    ['WZ_Rollladen',    'CUL_HM',    'Wohnzimmer',   L('Rollladen', 'Shutter'),            ['pct', 'up', 'down', 'stop'],          { pct: 100, state: '100' }],
    ['WZ_Fenster',      'CUL_HM',    'Wohnzimmer',   L('Fenster Wohnzimmer', 'Living window'), [],                                 { state: 'closed' }],
    ['Flur_Tuer',       'CUL_HM',    'Flur',         L('Wohnungstür', 'Front door'),       [],                                     { state: 'closed' }],
    ['Alarmanlage',     'dummy',     'Sicherheit',   L('Alarmanlage', 'Alarm system'),     ['state'],                              { state: 'aus' }],
    ['Anwesenheit',     'dummy',     'Sicherheit',   L('Anwesenheit', 'Presence'),         ['presence'],                           { state: 'ok', presence: 'present' }],
    ['Stromzaehler',    'OBIS',      'Technik',      L('Stromzähler', 'Power meter'),      [],                                     { power: 412 }],
    ['SZ_Licht',        'HUEDevice', 'Schlafzimmer', L('Licht Schlafzimmer', 'Bedroom light'), ['on', 'off', 'pct'],               { state: 'off', pct: 40 }],
    ['SZ_Thermostat',   'CUL_HM',    'Schlafzimmer', L('Thermostat Schlafzimmer', 'Bedroom thermostat'), ['desired-temp', 'controlMode'],
                                                                                           { 'measured-temp': 18.2, 'desired-temp': 18, controlMode: 'manual', ValvePosition: 12, batteryLevel: 12 }],
    ['SZ_Rollladen',    'CUL_HM',    'Schlafzimmer', L('Rollladen Schlafzimmer', 'Bedroom shutter'), ['pct', 'up', 'down', 'stop'], { pct: 30, state: '30' }],
    ['SZ_Fenster',      'CUL_HM',    'Schlafzimmer', L('Fenster Schlafzimmer', 'Bedroom window'), [],                              { state: 'open' }],
    ['SZ_Klima',        'MQTT2',     'Schlafzimmer', L('Klima Schlafzimmer', 'Bedroom climate'), [],                               { temperature: 18.3, humidity: 55 }],
    ['Garten_Pumpe',    'MQTT2',     'Garten',       L('Bewässerung', 'Irrigation'),       ['on', 'off'],                          { state: 'off' }],
    ['Garten_Licht',    'MQTT2',     'Garten',       L('Gartenlicht', 'Garden light'),     ['on', 'off'],                          { state: 'on' }],
    ['Garten_Boden',    'MQTT2',     'Garten',       L('Bodenfeuchte', 'Soil moisture'),   [],                                     { moisture: 38 }],
    ['FileLog_Aussen',  'FileLog',   'Logs',         'FileLog_Aussen',                     [],                                     { state: 'active' }],
    ['FileLog_WZ',      'FileLog',   'Logs',         'FileLog_WZ',                         [],                                     { state: 'active' }],
  ];
  const LOG_REGEXP = { FileLog_Aussen: 'Aussen:temperature:.*|Aussen:humidity:.*', FileLog_WZ: 'WZ_Klima:temperature:.*|WZ_Klima:humidity:.*' };

  const devs = {};
  for (const [name, type, room, alias, sets, rd] of DEFS) {
    const readings = {};
    for (const [k, v] of Object.entries(rd)) readings[k] = { value: String(v), time: ts() };
    devs[name] = { name, type, room, alias, sets, state: rd.state != null ? String(rd.state) : '', readings };
  }
  const val = (d, r) => devs[d] && devs[d].readings[r] ? devs[d].readings[r].value : null;

  // ---- fake push stream (replaces /api/stream) ------------------------------
  const streams = new Set();
  class DemoEventSource {
    constructor(url) {
      const q = new URL(url, location.href).searchParams.get('names') || '';
      this.names = new Set(q.split(',').filter(Boolean));
      this.listeners = {};
      this.onopen = this.onmessage = this.onerror = null;
      streams.add(this);
      setTimeout(() => this.onopen && this.onopen({}), 30);
      this.ping = setInterval(() => (this.listeners.ping || []).forEach(f => f({})), 15000);
    }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    close() { clearInterval(this.ping); streams.delete(this); }
  }
  window.EventSource = DemoEventSource;

  function setReading(name, r, v) {
    const d = devs[name]; if (!d) return;
    v = String(v);
    d.readings[r] = { value: v, time: ts() };
    if (r === 'state') d.state = v;
    for (const s of streams) if (s.names.has(name) && s.onmessage) s.onmessage({ data: JSON.stringify({ d: name, r, v }) });
  }

  // Shutters travel instead of jumping (shows the cover tile's live tracking).
  const travel = {};
  function moveCover(name, target) {
    clearInterval(travel[name]);
    target = Math.max(0, Math.min(100, Math.round(target)));
    travel[name] = setInterval(() => {
      const cur = parseFloat(val(name, 'pct')) || 0;
      const next = Math.abs(target - cur) <= 5 ? target : cur + Math.sign(target - cur) * 5;
      setReading(name, 'pct', next); setReading(name, 'state', next);
      if (next === target) clearInterval(travel[name]);
    }, 250);
  }

  function runCmd(device, args) {
    const d = devs[device];
    if (!d) throw new Error(L('Unbekanntes Gerät: ', 'Unknown device: ') + device);
    const [k, ...rest] = String(args).trim().split(/\s+/);
    const v = rest.join(' ');
    if (d.sets.includes('pct') && d.sets.includes('up')) {          // shutter
      if (k === 'pct') return moveCover(device, +v);
      if (k === 'up') return moveCover(device, 100);
      if (k === 'down') return moveCover(device, 0);
      if (k === 'stop') return clearInterval(travel[device]);
    }
    if (!v) return setReading(device, 'state', k);                  // on / off / plain state
    if (k === 'state') return setReading(device, 'state', v);
    setReading(device, k, v);
    if ((k === 'pct' || k === 'rgb' || k === 'ct') && val(device, 'state') === 'off' && +v !== 0) setReading(device, 'state', 'on');
  }

  // Gentle sensor drift + the occasional door event, so the push is visible.
  const drift = (name, r, amp, min, max) => {
    const cur = parseFloat(val(name, r)); if (isNaN(cur)) return;
    setReading(name, r, round1(Math.max(min, Math.min(max, cur + (Math.random() - 0.5) * amp))));
  };
  setInterval(() => {
    drift('WZ_Klima', 'temperature', 0.2, 20.5, 22.5);
    drift('Aussen', 'temperature', 0.3, 14, 19);
    setReading('Stromzaehler', 'power', Math.round(300 + Math.random() * 250) + (val('WZ_TV', 'state') === 'on' ? 86 : 0));
    for (const t of ['WZ_Thermostat', 'SZ_Thermostat']) {            // rooms creep towards the set point
      const m = parseFloat(val(t, 'measured-temp')), s = parseFloat(val(t, 'desired-temp'));
      if (Math.abs(s - m) > 0.05) setReading(t, 'measured-temp', round1(m + Math.sign(s - m) * 0.1));
      setReading(t, 'ValvePosition', Math.max(0, Math.min(100, Math.round((s - m) * 25 + 10))));
    }
  }, 6000);
  setInterval(() => {
    setReading('Flur_Tuer', 'state', 'open');
    setTimeout(() => setReading('Flur_Tuer', 'state', 'closed'), 7000);
  }, 45000);

  // ---- chart history (generated) --------------------------------------------
  function history(spec, hours) {
    const hum = /humidity/.test(spec), inside = /WZ_Klima/.test(spec);
    const end = now(), start = end - hours * 3600, step = Math.max(300, Math.round(hours * 3600 / 300));
    const pts = [];
    for (let t = start; t <= end; t += step) {
      const day = Math.sin(((t / 3600) % 24 - 9) / 24 * 2 * Math.PI);      // warmest mid-afternoon
      const noise = Math.sin(t / 1700) * 0.4 + Math.sin(t / 5300) * 0.6;
      const v = hum ? (inside ? 47 - day * 4 : 64 - day * 14) + noise * 2
                    : (inside ? 21 + day * 0.8 : 12 + day * 6) + noise * (inside ? 0.2 : 0.8);
      pts.push([t, round1(v)]);
    }
    return pts;
  }

  // ---- demo dashboards ------------------------------------------------------
  const id = (() => { let n = 0; return () => 'd' + (++n); })();
  const status = (dev, label, kind) => ({ id: id(), type: 'status', device: dev, reading: 'state', label, icon: 'none', hideHeader: false,
    statusMap: [{ val: 'open', label: '', icon: kind + '-open', iconColor: '#ff5d5d' },
                { val: 'closed', label: '', icon: kind === 'door' ? 'door' : 'window-closed', iconColor: '#4caf7d' }] });
  const thermo = dev => ({ type: 'thermostat', device: dev, taReading: 'measured-temp', tdReading: 'desired-temp', tsetCmd: 'desired-temp',
    tstep: 0.5, tvReading: 'ValvePosition', tbReading: 'batteryLevel', tmReading: 'controlMode', tmodeCmd: 'controlMode', icon: 'heating', reading: 'state' });
  const cover = dev => ({ type: 'cover', device: dev, cposReading: 'pct', cposCmd: 'pct', cupCmd: '', cdownCmd: '', cstopCmd: 'stop', cinvert: false, reading: 'state' });
  const value = (dev, reading, label, unit, icon, iconColor) => ({ type: 'value', device: dev, reading, label, unit, icon, iconColor });

  function seed() {
    return [
      { id: 1, name: L('Übersicht', 'Overview'), layout: [
        { id: id(), type: 'clock', x: 0, y: 0, w: 4, h: 3, hideHeader: true },
        { id: id(), type: 'weather', device: 'Wetter', x: 4, y: 0, w: 9, h: 6, icon: 'none', hideHeader: true, reading: 'state',
          sources: { temperature: { device: 'Aussen', reading: 'temperature' }, humidity: { device: 'Aussen', reading: 'humidity' } } },
        { ...status('Flur_Tuer', L('Wohnungstür', 'Front door'), 'door'), x: 13, y: 0, w: 3, h: 3 },
        { ...status('WZ_Fenster', L('Fenster', 'Window'), 'window'), x: 16, y: 0, w: 3, h: 3 },
        { id: id(), type: 'button', device: 'Alarmanlage', reading: 'state', label: L('Alarm', 'Alarm'), icon: 'none', btnDisplay: 'toggle', x: 19, y: 0, w: 2, h: 3,
          buttons: [{ cmd: 'state an', icon: 'armed', glow: true, iconColor: '#43d17a' }, { cmd: 'state aus', icon: 'disarmed', glow: false, iconColor: '#ff5d5d' }] },
        { id: id(), type: 'button', device: 'Anwesenheit', reading: 'state', label: L('Zuhause', 'Home'), icon: 'none', btnDisplay: 'toggle', x: 21, y: 0, w: 2, h: 3,
          buttons: [{ cmd: 'presence present', icon: 'present', glow: true, iconColor: '#43d17a' }, { cmd: 'presence absent', icon: 'absent', glow: false, iconColor: '#ff5d5d' }] },
        { id: id(), ...value('WZ_Klima', 'temperature', L('Innen', 'Indoor'), '°C', 'thermo', '#ff9f3b'), x: 0, y: 3, w: 4, h: 3 },
        { id: id(), ...thermo('WZ_Thermostat'), label: L('Heizung', 'Heating'), x: 13, y: 3, w: 4, h: 6 },
        { id: id(), ...cover('WZ_Rollladen'), label: L('Rollladen', 'Shutter'), x: 17, y: 3, w: 3, h: 6 },
        { id: id(), ...value('Stromzaehler', 'power', L('Strom', 'Power'), 'W', 'energy', '#ffd25d'), x: 20, y: 3, w: 3, h: 3 },
        { id: id(), ...value('WZ_Klima', 'humidity', L('Feuchte', 'Humidity'), '%', 'humidity', '#54a0ff'), x: 20, y: 6, w: 3, h: 3 },
        { id: id(), type: 'group', label: L('Wohnzimmer', 'Living room'), icon: 'sofa', iconColor: '', x: 0, y: 6, w: 13, h: 8, children: [
          { id: id(), type: 'light', device: 'WZ_Deckenlicht', reading: 'state', label: L('Deckenlicht', 'Ceiling light'), icon: 'ceiling',
            colorcmd: 'rgb', ctcmd: 'ct', useRgb: true, useCt: true, ctMin: 2000, ctMax: 6500, useDim: true, dimcmd: 'pct', dimReading: 'pct', x: 0, y: 0, w: 4, h: 6 },
          { id: id(), type: 'switch', device: 'WZ_Stehlampe', reading: 'state', label: L('Stehlampe', 'Floor lamp'), icon: 'lamp', x: 4, y: 0, w: 4, h: 3 },
          { id: id(), type: 'switch', device: 'WZ_TV', reading: 'state', label: L('Fernseher', 'TV'), icon: 'tv', x: 4, y: 3, w: 4, h: 3 },
          { id: id(), type: 'button', device: 'WZ_Szene', reading: 'state', label: L('Szene', 'Scene'), icon: 'none', btnDisplay: 'text', x: 8, y: 0, w: 4, h: 6,
            buttons: [{ cmd: 'scene Hell', label: L('Hell', 'Bright'), glow: true }, { cmd: 'scene Film', label: L('Film', 'Movie'), glow: true },
                      { cmd: 'scene Nacht', label: L('Nacht', 'Night'), glow: true }] },
        ] },
        { id: id(), type: 'chart', device: '', chLog: 'FileLog_Aussen', chSpec: '4:Aussen.temperature:0:', chHours: 24, chSmooth: true, chLabels: true,
          label: L('Außentemperatur', 'Outdoor temperature'), unit: '°C', icon: '', reading: 'state', x: 13, y: 9, w: 10, h: 5 },
      ] },
      { id: 2, name: L('Schlafzimmer', 'Bedroom'), layout: [
        { id: id(), type: 'light', device: 'SZ_Licht', reading: 'state', label: L('Licht', 'Light'), icon: 'lamp',
          useRgb: false, useCt: false, useDim: true, dimcmd: 'pct', dimReading: 'pct', x: 0, y: 0, w: 5, h: 4 },
        { id: id(), ...thermo('SZ_Thermostat'), label: L('Heizung', 'Heating'), x: 5, y: 0, w: 4, h: 6 },
        { id: id(), ...cover('SZ_Rollladen'), label: L('Rollladen', 'Shutter'), x: 9, y: 0, w: 4, h: 6 },
        { ...status('SZ_Fenster', L('Fenster', 'Window'), 'window'), x: 13, y: 0, w: 3, h: 3 },
        { id: id(), ...value('SZ_Klima', 'humidity', L('Feuchte', 'Humidity'), '%', 'humidity', '#54a0ff'), x: 13, y: 3, w: 3, h: 3 },
        { id: id(), type: 'note', noteMode: 'text', label: L('Notiz', 'Note'), icon: '', x: 0, y: 4, w: 5, h: 4,
          text: L('Fenster ist offen und die Batterie im Thermostat schwach – siehst du beides an den Kacheln?',
                  'The window is open and the thermostat battery is low – can you spot both on the tiles?') },
      ] },
      { id: 3, name: L('Garten', 'Garden'), layout: [
        { id: id(), type: 'switch', device: 'Garten_Pumpe', reading: 'state', label: L('Gießen', 'Watering'), icon: 'droplet', iconColor: '#54a0ff', x: 0, y: 0, w: 4, h: 3 },
        { id: id(), type: 'switch', device: 'Garten_Licht', reading: 'state', label: L('Gartenlicht', 'Garden light'), icon: 'light', x: 4, y: 0, w: 4, h: 3 },
        { id: id(), ...value('Garten_Boden', 'moisture', L('Bodenfeuchte', 'Soil moisture'), '%', 'plant', '#43d17a'), x: 8, y: 0, w: 4, h: 3 },
        { id: id(), type: 'chart', device: '', chLog: 'FileLog_Aussen', chSpec: '4:Aussen.humidity:0:', chHours: 48, chSmooth: true, chLabels: true,
          label: L('Luftfeuchte draußen', 'Outdoor humidity'), unit: '%', icon: '', reading: 'state', x: 0, y: 3, w: 12, h: 6 },
        { id: id(), type: 'note', noteMode: 'check', label: L('Gartenarbeit', 'Garden chores'), icon: 'plant', x: 12, y: 0, w: 6, h: 6,
          items: [{ text: L('Rasen mähen', 'Mow the lawn'), done: true }, { text: L('Tomaten gießen', 'Water the tomatoes'), done: false },
                  { text: L('Hecke schneiden', 'Trim the hedge'), done: false }] },
      ] },
    ];
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.dashboards)) db = { dashboards: seed() };
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* private mode: session only */ } };
  const clone = x => JSON.parse(JSON.stringify(x));
  const dash = id => db.dashboards.find(d => d.id === +id);
  const later = x => new Promise(r => setTimeout(() => r(x), 40));     // feel like a network call

  // ---- the API, simulated -----------------------------------------------------
  Object.assign(API, {
    health:      () => later({ ok: true, demo: true }),
    devices(names) {
      const list = (names ? String(names).split(',') : Object.keys(devs)).filter(n => devs[n]).map(n => clone(devs[n]));
      return later({ devices: list, count: list.length });
    },
    deviceList: () => later({ devices: Object.values(devs).map(d => ({
      name: d.name, type: d.type, room: d.room, alias: d.alias, readings: Object.keys(d.readings), sets: d.sets,
      onoff: d.sets.includes('on') ? 'state' : null })) }),
    cmd(device, args) { runCmd(device, args); return later({ ok: true, result: '' }); },
    rawCmd(cmd) {
      const m = /^jsonlist2\s+(\S+)/.exec(cmd || '');
      const re = m && LOG_REGEXP[m[1]];
      return later({ ok: true, result: re ? JSON.stringify({ Results: [{ Name: m[1], Internals: { REGEXP: re } }] }) : '' });
    },
    readingsGroup: () => later({ rows: [
      { cells: [L('Thermostat Schlafzimmer', 'Bedroom thermostat'), '12 %'] }, { cells: [L('Fenster Wohnzimmer', 'Living window'), 'ok'] } ] }),
    chart: (log, spec, hours) => later({ points: history(spec, hours || 24) }),

    settings:     () => later({ fhemUrl: 'demo', default: 'demo', gridGen: 2, fhemUser: '', hasPass: false, insecure: true }),
    saveSettings: () => later({ ok: true, reachable: true, fhemUrl: L('Demo (simuliert)', 'Demo (simulated)'), saved: false }),
    setGridGen:   gen => later({ ok: true, gridGen: gen }),
    exportLayout: () => later({ version: 1, dashboards: db.dashboards.map(d => ({ name: d.name, layout: clone(d.layout) })) }),
    importLayout(data) {
      db.dashboards = (data.dashboards || []).map((d, i) => ({ id: i + 1, name: d.name || 'Import', layout: d.layout || [] }));
      persist(); return later({ ok: true, count: db.dashboards.length });
    },

    dashboards: () => later({ dashboards: db.dashboards.map(d => ({ id: d.id, name: d.name })) }),
    dashboard(id) {
      const d = dash(id);
      return d ? later(clone(d)) : Promise.reject(new Error('not found'));
    },
    createDashboard(name) {
      const nid = Math.max(0, ...db.dashboards.map(d => d.id)) + 1;
      db.dashboards.push({ id: nid, name: name || L('Neu', 'New'), layout: [] });
      persist(); return later({ id: nid });
    },
    reorderDashboards(ids) {
      db.dashboards.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      persist(); return later({ ok: true });
    },
    saveDashboard(id, name, layout) {
      const d = dash(id); if (!d) return Promise.reject(new Error('not found'));
      if (name != null) d.name = name;
      d.layout = clone(layout || []);
      persist(); return later({ ok: true });
    },
    deleteDashboard(id) {
      db.dashboards = db.dashboards.filter(d => d.id !== +id);
      persist(); return later({ ok: true });
    },
  });

  // ---- demo banner -------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = `<b>Demo</b><span>${L('Simulierte Geräte – nichts wird an ein echtes FHEM gesendet.', 'Simulated devices – nothing is sent to a real FHEM.')}</span>` +
      `<button type="button" class="demo-reset">${L('Zurücksetzen', 'Reset')}</button>` +
      `<a href="../">${L('← Projektseite', '← Project page')}</a>`;
    b.querySelector('.demo-reset').addEventListener('click', () => {
      try { localStorage.removeItem(STORE); localStorage.removeItem('snap'); } catch (e) { /* ignore */ }
      location.reload();
    });
    const css = document.createElement('style');
    css.textContent = `.demo-banner{position:fixed;left:12px;bottom:12px;z-index:50;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      max-width:calc(100vw - 24px);padding:8px 12px;border-radius:14px;font-size:13px;color:var(--text);background:var(--panel);
      border:1px solid var(--stroke);box-shadow:0 12px 30px -12px #000}
      .demo-banner b{color:var(--accent-fg);background:var(--accent);padding:2px 8px;border-radius:8px}
      .demo-banner span{color:var(--muted)}
      .demo-banner a,.demo-banner button{color:var(--accent);font:inherit;font-weight:600;background:none;border:0;padding:0;cursor:pointer;text-decoration:none}`;
    document.head.appendChild(css);
    document.body.appendChild(b);
  });
})();

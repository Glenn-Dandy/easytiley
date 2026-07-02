// Tile rendering + interaction binding. Compact "card" style (icon chip + name + state).
const Tiles = (() => {

  // Inline SVG icons (stroke = currentColor, so they follow the chip's theme colour
  // and render pixel-identically on every device — unlike emoji, which vary per OS).
  const svg = (inner, fill) =>
    `<svg viewBox="0 0 24 24" fill="${fill || 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICONS = {
    value:        svg('<path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/>'),               // thermometer
    switch:       svg('<path d="M12 4v8"/><path d="M7 7.5a7 7 0 1 0 10 0"/>'),                     // power
    dimmer:       svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/>'), // brightness
    color:        svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),             // droplet
    light:        svg('<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2 1 2.1h5c.1-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'), // bulb
    readingsgroup:svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),       // list
    group:        svg('<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'), // folder
    button:       svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'), // 2x2 action grid
    label:        svg('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/>'), // tag
    clock:        svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),                 // clock
    note:         svg('<path d="M4 4h16v11l-5 5H4z"/><path d="M20 14h-6v6"/><path d="M8 9h8M8 13h5"/>'), // note
    weather:      svg('<circle cx="9" cy="8.5" r="3"/><path d="M9 2.5v1.3M3.5 8.5H2.2M13.8 3.7l-.9.9M5 12.5l-.9.9M4.1 3.7l.9.9"/><path d="M17.5 20a3 3 0 0 0 0-6 4.2 4.2 0 0 0-8-1.1"/><path d="M7 20h10.5"/>'), // sun+cloud
    thermostat:   svg('<circle cx="12" cy="12" r="9"/><path d="M12 12l3-3"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'), // dial
    status:       svg('<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>'),                 // check in circle
  };
  const ICON_DEFAULT = svg('<rect x="4" y="4" width="16" height="16" rx="3"/>');

  // Pickable icon library (manual per-tile / per-button choice). Each entry:
  // [key, label, inner-svg]. Stroke = currentColor like the type icons above.
  const _icons = [
    ['light',     'Licht',          '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2 1 2.1h5c.1-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'],
    ['lamp',      'Lampe',          '<path d="M8 3h8l2 7H6z"/><path d="M12 10v8"/><path d="M8 21h8"/>'],
    ['ceiling',   'Deckenlampe',    '<path d="M12 3v3"/><path d="M7 13a5 5 0 0 1 10 0z"/><path d="M9 17h6M10 20h4"/>'],
    ['plug',      'Steckdose',      '<path d="M9 2v6M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v6"/>'],
    ['power',     'Schalter',       '<path d="M12 4v8"/><path d="M7 7.5a7 7 0 1 0 10 0"/>'],
    ['thermo',    'Thermometer',    '<path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/>'],
    ['humidity',  'Luftfeuchte',    '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>'],
    ['energy',    'Energie',        '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'],
    ['door',      'Tür',            '<path d="M6 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none"/>'],
    ['door-open', 'Tür offen',      '<path d="M3 21h18"/><path d="M6 6l8-2v17H6z"/><path d="M14 4h4v17"/><circle cx="8.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>'],
    ['garage',    'Garagentor',     '<path d="M3 21V10l9-5 9 5v11"/><path d="M6 21v-7h12v7"/><path d="M6 17h12"/>'],
    ['window-closed', 'Fenster zu',     '<rect x="4" y="3" width="16" height="18" rx="1.5"/><rect x="7.5" y="6.5" width="9" height="11" rx="1"/>'],
    ['window-open',   'Fenster offen',  '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 5l8 2v10l-8 2z"/>'],
    ['window-tilt',   'Fenster gekippt','<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 12l16-4v2.6L4 14.6z"/>'],
    ['lock',      'Schloss zu',     '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
    ['lockopen',  'Schloss auf',    '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'],
    ['shutter',   'Rollladen',      '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 8h16M4 12h16M4 16h16"/>'],
    ['blinds',    'Jalousie',       '<path d="M4 4h16M5 4v13M19 4v13M5 17h14"/><path d="M5 9h14M5 13h14"/>'],
    ['curtain',   'Vorhang',        '<path d="M3 3h18"/><path d="M5 3c0 8-1 12-2 18M9 3c0 8 0 14 0 18M15 3c0 8 0 14 0 18M19 3c1 8 2 12 2 18"/>'],
    ['fan',       'Ventilator',     '<circle cx="12" cy="12" r="1.6"/><path d="M12 11c-1-3 0-6-1-8-3 1-3 5-1 8M13 12c3-1 6 0 8-1-1-3-5-3-8-1M12 13c1 3 0 6 1 8 3-1 3-5 1-8M11 12c-3 1-6 0-8 1 1 3 5 3 8 1"/>'],
    ['heating',   'Heizung',        '<path d="M4 8h16M4 17h16"/><path d="M7 8v9M11 8v9M15 8v9M19 8v9"/>'],
    ['thermostat','Thermostat',     '<circle cx="12" cy="12" r="9"/><path d="M12 12l3-3"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'],
    ['ac',        'Klima',          '<rect x="3" y="5" width="18" height="8" rx="2"/><path d="M6 9h12"/><path d="M7 16c0 1.5 1 2 2 1M12 16c0 1.5 1 2 2 1M17 16c0 1.5-1 2-2 3"/>'],
    ['boiler',    'Warmwasser',     '<rect x="7" y="3" width="10" height="18" rx="3"/><circle cx="12" cy="14" r="2.5"/><path d="M10 7h4"/>'],
    ['tv',        'TV',             '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'],
    ['speaker',   'Lautsprecher',   '<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="6.5" r="1" fill="currentColor" stroke="none"/>'],
    ['music',     'Musik',          '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'],
    ['radio',     'Radio',          '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M7 8l10-4"/><circle cx="8" cy="13.5" r="2.5"/><path d="M15 12h3M15 15h3"/>'],
    ['camera',    'Kamera',         '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>'],
    ['motion',    'Bewegung',       '<circle cx="13" cy="4" r="2"/><path d="M9 9l4-1 3 2M13 8v6l-3 6M13 14l3 5"/>'],
    ['smoke',     'Rauchmelder',    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'],
    ['leak',      'Wasser-Leck',    '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M12 9v4M12 16h.01"/>'],
    ['droplet',   'Tropfen',        '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'],
    ['flame',     'Flamme',         '<path d="M12 3c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-5-1-8z"/>'],
    ['sun',       'Sonne',          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>'],
    ['moon',      'Mond',           '<path d="M21 12.8A8 8 0 1 1 11.2 3 6 6 0 0 0 21 12.8z"/>'],
    ['cloud',     'Wolke',          '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 18 18z"/>'],
    ['rain',      'Regen',          '<path d="M7 14a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 14"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>'],
    ['snow',      'Schnee',         '<path d="M12 2v20M4.5 7l15 10M19.5 7l-15 10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>'],
    ['wind',      'Wind',           '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h9a2.5 2.5 0 1 1-2.5 2.5"/>'],
    ['coffee',    'Kaffee',         '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M8 2v2M12 2v2"/>'],
    ['bed',       'Bett',           '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 14h18M3 18v2M21 18v2"/><path d="M7 10V8h4v2"/>'],
    ['sofa',      'Sofa',           '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 13a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v5H3z"/><path d="M6 20v1M18 20v1"/>'],
    ['stove',     'Herd / Küche',   '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/><circle cx="8.5" cy="15" r="1.5"/><circle cx="15.5" cy="15" r="1.5"/>'],
    ['shower',    'Bad / Dusche',   '<path d="M4 12V6a2 2 0 0 1 4 0"/><path d="M2 12h12"/><path d="M6 16v.5M9 16v.5M12 16v.5M5 19v.5M8 19v.5M11 19v.5"/>'],
    ['car',       'Auto',           '<path d="M5 16l1.5-5a2 2 0 0 1 2-1.4h7a2 2 0 0 1 2 1.4L20 16"/><path d="M3 16h18v3h-2v-1H5v1H3z"/><circle cx="7.5" cy="16.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="16.5" cy="16.5" r="1.3" fill="currentColor" stroke="none"/>'],
    ['charger',   'Ladestation',    '<rect x="5" y="4" width="9" height="16" rx="2"/><path d="M11 8l-2 4h3l-2 4"/><path d="M14 9h3a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9"/>'],
    ['battery',   'Batterie',       '<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 11v2"/><path d="M6 11v2"/>'],
    ['solar',     'Solar',          '<path d="M4 16l2-9h12l2 9z"/><path d="M3 16h18M8 7l-1 9M16 7l1 9M5.5 11.5h13"/><path d="M12 4V2"/>'],
    ['wifi',      'WLAN',           '<path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'],
    ['clock',     'Uhr',            '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'],
    ['calendar',  'Kalender',       '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>'],
    ['bell',      'Glocke',         '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>'],
    ['armed',     'Alarm scharf',   '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'],
    ['disarmed',  'Alarm unscharf', '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'],
    ['present',   'Anwesend',       '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'],
    ['absent',    'Abwesend',       '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M3 3l18 18"/>'],
    ['home',      'Haus',           '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>'],
    ['gear',      'Zahnrad',        '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'],
    ['plant',     'Pflanze',        '<path d="M12 21V11"/><path d="M12 11c0-4 3-7 8-7 0 5-3 8-8 8z"/><path d="M12 14c0-3-2-5-6-5 0 4 2 6 6 6z"/>'],
    ['vacuum',    'Saugroboter',    '<circle cx="12" cy="12" r="9"/><path d="M3 9h18"/><circle cx="9" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none"/>'],
    ['key',       'Schlüssel',      '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M17 17l2-2M15 19l2-2"/>'],
    ['trash',     'Mülleimer',      '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>'],
    ['gauge',     'Luftdruck',      '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l4-3"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/>'],
  ];
  const ICON_LIB = {};
  const ICON_LIST = _icons.map(([key, label, inner]) => { ICON_LIB[key] = svg(inner); return { key, label, svg: ICON_LIB[key] }; });
  ICON_LIB.window = ICON_LIB['window-closed'];   // legacy alias (hidden from picker), keeps old tiles working
  // Resolve a tile's chip icon: 'none' -> nothing, manual choice -> type default -> box.
  function iconFor(tile) {
    if (tile.icon === 'none') return '';
    if (tile.icon && ICON_LIB[tile.icon]) return ICON_LIB[tile.icon];
    return ICONS[tile.type] || ICON_DEFAULT;
  }
  const iconHtml = key => key === 'none' ? '' : ((key && ICON_LIB[key]) || ICON_DEFAULT);
  const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : ''; // only #rrggbb into inline styles

  // #rrggbb -> "H,S,V" for `set x hsv`.
  function hexToHsv(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h = Math.round(h * 60); if (h < 0) h += 360;
    }
    return `${h},${Math.round((mx ? d / mx : 0) * 100)},${Math.round(mx * 100)}`;
  }
  function colorArg(tile, hex) {
    const cmd = tile.colorcmd || 'rgb';
    return cmd === 'hsv' ? 'hsv ' + hexToHsv(hex) : cmd + ' ' + hex.slice(1).toUpperCase();
  }
  function hsvToHex(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    const hx = n => ('0' + Math.round((n + m) * 255).toString(16)).slice(-2);
    return '#' + hx(r) + hx(g) + hx(b);
  }
  const PRESETS = ['#ffffff', '#ffd6a5', '#ff5d5d', '#ffd25d', '#7bed9f', '#5dd2ff', '#6a5dff', '#ff5dce'];

  // Modern colour control: live-preview swatch + rainbow hue + preset popover.
  function buildColorControl(tile, onAction) {
    const wrap = document.createElement('div');
    wrap.className = 'colorctl';
    wrap.innerHTML =
      `<div class="cc-top">
         <label class="cc-swatch"><input type="color" class="lcolor" value="#ffffff"><span class="cc-preview"></span></label>
         <input type="range" class="cc-hue" min="0" max="360" value="0">
       </div>
       <div class="cc-presets">${PRESETS.map(c => `<span class="cc-dot" style="background:${c}" data-c="${c}"></span>`).join('')}</div>`;
    const input = wrap.querySelector('.lcolor'), prev = wrap.querySelector('.cc-preview'), hue = wrap.querySelector('.cc-hue');
    const paint = hex => { input.value = hex; prev.style.background = hex; };
    const send = hex => { paint(hex); onAction(tile, colorArg(tile, hex)); };
    paint(input.value);
    input.addEventListener('input', () => prev.style.background = input.value);
    input.addEventListener('change', () => send(input.value));
    hue.addEventListener('input', () => paint(hsvToHex(+hue.value, 100, 100)));
    hue.addEventListener('change', () => send(input.value));
    wrap.querySelectorAll('.cc-dot').forEach(d => d.addEventListener('click', () => send(d.dataset.c)));
    return wrap;
  }

  // A labelled mini range control (brightness / colour temperature).
  function miniSlider(kind, min, max, step, onChange, unit) {
    const w = document.createElement('div');
    w.className = 'mslider';
    w.innerHTML = `<input type="range" class="${kind}" min="${min}" max="${max}" step="${step}" value="${min}"><span class="mval"></span>`;
    const r = w.querySelector('input'), v = w.querySelector('.mval');
    const show = () => v.textContent = r.value + (unit || '');
    r.addEventListener('input', show);
    r.addEventListener('change', () => onChange(r.value));
    show();
    return w;
  }

  function devReading(dev, name) {
    if (!dev) return null;
    if (dev.readings && dev.readings[name] != null) return dev.readings[name].value;
    if (name === 'state') return dev.state;
    return null;
  }
  function readingValue(tile, dev) {
    return devReading(dev, tile.reading || 'state');
  }
  // Derive which reading/value lights a button up. "cmd arg" -> reading=cmd, value=arg
  // (e.g. "mode schlafen" -> reading "mode" == "schlafen"); "cmd" alone -> the tile's
  // reading (default state) == cmd (e.g. "present" -> state == "present").
  function btnMatch(tile, b) {
    const toks = String(b.cmd || '').trim().split(/\s+/);
    if (toks.length >= 2) return { rd: toks[0], val: toks.slice(1).join(' ') };
    return { rd: tile.reading || 'state', val: toks[0] || '' };
  }
  const isOn = v => ['on', '1', 'true', 'open', 'yes', 'ja'].includes(String(v ?? '').toLowerCase());
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Map a German weather-condition text (PROPLANTA "weather"/"fcN_weatherDay") to
  // one of our SVG icons — device-consistent, no external images.
  function wxIcon(txt) {
    const s = String(txt || '').toLowerCase();
    if (/(schnee|flocke|graupel)/.test(s)) return 'snow';
    if (/(gewitter|blitz)/.test(s))        return 'rain';   // no thunder glyph
    if (/(regen|schauer|niesel|nass)/.test(s)) return 'rain';
    if (/(nebel|dunst)/.test(s))           return 'cloud';
    if (/(bedeckt|bewölkt|bewoelkt|wolk|trüb|trueb)/.test(s)) return 'cloud';
    if (/(heiter|sonnig|klar|wolkenlos)/.test(s)) return 'sun';
    return 'cloud';
  }
  // "01.07.2026" -> "Di"
  function wxWeekday(d) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(d || ''));
    if (!m) return '';
    return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(+m[3], +m[2] - 1, +m[1]).getDay()];
  }

  function chipClass(tile) {
    const u = tile.unit || '';
    if (u === '°C') return ' c-temp';
    if (u === '%')  return ' c-hum';
    if (/W|kWh|A|V/.test(u)) return ' c-pow';
    return '';
  }
  function header(tile, ctrl) {
    const icon = iconFor(tile);
    const col  = safeColor(tile.iconColor);
    const chip = icon ? `<div class="chip${chipClass(tile)}"${col ? ` style="color:${col}"` : ''}>${icon}</div>` : '';
    const name = esc(tile.label || tile.device || '');
    return `<div class="row">
        ${chip}
        <div class="tx"><div class="t-name">${name}</div><div class="t-state"></div></div>
        ${ctrl || ''}</div>`;
  }

  // In edit mode the whole card is the drag handle (see app.js / CSS); these are
  // just the per-tile action badges layered on top.
  const EDIT = `<div class="tile-del" title="Entfernen">✕</div>
                <div class="tile-edit" title="Bearbeiten">✎</div>
                <div class="tile-link" title="Mit Nachbar verbinden">🔗</div>`;

  function build(tile, onAction) {
    const el = document.createElement('div');
    el.className = 'grid-stack-item-content tile tile-' + tile.type + (tile.hideHeader ? ' no-head' : '');
    el.dataset.tileId = tile.id;
    // Loading skeleton: pulse until the first poll delivers data (apply() clears it).
    if (tile.device && tile.type !== 'readingsgroup' && tile.type !== 'group') el.classList.add('tile-wait');

    switch (tile.type) {
      case 'switch': {
        el.innerHTML = EDIT + header(tile, '<span class="toggle"></span>');
        el.querySelector('.row').addEventListener('click', () => onAction(tile, el.classList.contains('on') ? 'off' : 'on'));
        break;
      }
      case 'light': {
        el.classList.add('tile-rich');
        el.innerHTML = EDIT + header(tile, '<span class="toggle"></span>') + '<div class="ctrls"></div>';
        el.querySelector('.toggle').addEventListener('click', e => { e.stopPropagation(); onAction(tile, el.classList.contains('on') ? 'off' : 'on'); });
        const ctrls = el.querySelector('.ctrls');
        if (tile.useRgb !== false) ctrls.appendChild(buildColorControl(tile, onAction));
        if (tile.useDim) ctrls.appendChild(miniSlider('ldim', 0, 100, 1, v => onAction(tile, (tile.dimcmd || 'pct') + ' ' + v), '%'));
        if (tile.useCt)  ctrls.appendChild(miniSlider('lct', tile.ctMin || 2000, tile.ctMax || 6500, 50, v => onAction(tile, (tile.ctcmd || 'ct') + ' ' + v), 'K'));
        break;
      }
      case 'dimmer': {
        el.classList.add('tile-rich');
        el.innerHTML = EDIT + header(tile);
        el.appendChild(miniSlider('ldim', 0, 100, 1, v => onAction(tile, (tile.setcmd || 'pct') + ' ' + v), '%'));
        break;
      }
      case 'color': {
        el.classList.add('tile-rich');
        el.innerHTML = EDIT + header(tile);
        el.appendChild(buildColorControl(tile, onAction));
        break;
      }
      case 'button': {
        el.classList.add('tile-rich');
        const list = (tile.buttons && tile.buttons.length) ? tile.buttons
                   : (tile.cmds && tile.cmds.length) ? tile.cmds.map(c => ({ cmd: c }))
                   : (tile.cmd ? [{ cmd: tile.cmd }] : [{ cmd: 'on' }]);
        const mode = tile.btnDisplay || 'text';     // 'text' | 'icons' | 'toggle'
        el.innerHTML = EDIT + header(tile) + `<div class="scenes scenes-${mode}"></div>`;
        const sc = el.querySelector('.scenes');
        if (mode === 'toggle') {
          // One button cycling through all commands; shows the active state's icon.
          const states = list.map(b => Object.assign(btnMatch(tile, b), { cmd: b.cmd, icon: b.icon, glow: b.glow !== false, iconColor: safeColor(b.iconColor) }));
          const x = document.createElement('button');
          x.className = 'scene scene-icon toggle-btn';
          x.dataset.states = JSON.stringify(states);
          x.dataset.cur = '0';
          x.title = 'Umschalten';
          x.innerHTML = iconHtml(states[0] && states[0].icon);
          x.style.color = (states[0] && states[0].iconColor) || '';
          x.addEventListener('click', () => {
            const st = JSON.parse(x.dataset.states);
            const next = (parseInt(x.dataset.cur || '0', 10) + 1) % st.length;
            onAction(tile, st[next].cmd);
            x.dataset.cur = String(next);            // optimistic until next poll confirms
            x.innerHTML = iconHtml(st[next].icon);
            x.style.color = st[next].iconColor || '';
          });
          sc.appendChild(x);
        } else {
          for (const b of list) {
            const x = document.createElement('button');
            // In icon mode a button without a (real) icon falls back to its text,
            // rendered in the exact same button box -> mixed rows stay aligned.
            const showIcon = mode === 'icons' && b.icon && b.icon !== 'none' && ICON_LIB[b.icon];
            x.className = 'scene' + (showIcon ? ' scene-icon' : '');
            if (showIcon) { x.innerHTML = iconHtml(b.icon); const c = safeColor(b.iconColor); if (c) x.style.color = c; }
            else x.textContent = b.label || b.cmd;
            const m = btnMatch(tile, b);
            x.dataset.rd = m.rd; x.dataset.val = m.val;
            x.dataset.glow = b.glow === false ? '0' : '1';
            x.addEventListener('click', () => {
              onAction(tile, b.cmd);
              // optimistic: light the clicked button now (if it glows), clear siblings on the same reading
              sc.querySelectorAll('.scene').forEach(o => { if (o.dataset.rd === x.dataset.rd) o.classList.toggle('active', o === x && x.dataset.glow !== '0'); });
            });
            sc.appendChild(x);
          }
        }
        break;
      }
      case 'readingsgroup': {
        el.classList.add('tile-rich');
        el.innerHTML = EDIT + header(tile) + '<div class="rg-wrap"><div class="rg-content rg-loading">lädt…</div></div>';
        break;
      }
      case 'group': {
        el.classList.add('tile-group', 'tile-rich');
        el.innerHTML = EDIT + header(tile).replace('class="row"', 'class="row ghead"') + '<div class="grid-stack grid-stack-nested"></div>';
        break;
      }
      case 'merge': {
        // Seamless single card holding N child tiles in a flex row/column.
        // Children render with their normal tile markup (interactions intact),
        // but the merge styling strips their individual card chrome.
        el.classList.add('tile-rich', 'tile-merge', 'merge-' + (tile.dir || 'row'));
        el.innerHTML = `<div class="merge-split" title="Auflösen (dann einzeln löschbar)">⧉</div>
                        <div class="merge-link" title="Weitere Kachel anbinden">🔗</div>`;
        const horiz = (tile.dir || 'row') === 'row';
        (tile.children || []).forEach(c => {
          const cell = document.createElement('div');
          cell.className = 'merge-cell';
          // Keep each child's original relative size: weight the flex grow by the
          // child's extent along the merge axis (width for rows, height for cols).
          cell.style.flexGrow = String(Math.max(1, (horiz ? c.w : c.h) || 1));
          cell.appendChild(build(c, onAction));      // recursive: child tile content
          el.appendChild(cell);
        });
        break;
      }
      case 'clock': {     // local date/time, no FHEM; filled by the app's ticker.
        // Centered + size-responsive (font scales with the tile via cqmin units).
        el.classList.add('tile-rich', 'tile-clock');
        el.innerHTML = EDIT + `<div class="clk-wrap">
            <div class="clk-time">--:--</div>
            <div class="clk-date">–</div>
          </div>`;
        break;
      }
      case 'note': {     // local note, no FHEM; text or checklist, stored in the layout
        el.classList.add('tile-rich', 'tile-note');
        if ((tile.noteMode || 'text') === 'check') {
          el.classList.add('tile-check');
          const items = tile.items || [];
          el.innerHTML = EDIT + header(tile) + '<div class="note-body check-list">' +
            items.map((it, i) => `<label class="chk-item${it.done ? ' done' : ''}"><input type="checkbox" data-i="${i}"${it.done ? ' checked' : ''}><span></span></label>`).join('') +
            '</div>';
          el.querySelectorAll('.chk-item > span').forEach((s, i) => { s.textContent = items[i].text; }); // textContent: XSS-safe
        } else {
          el.innerHTML = EDIT + header(tile) + '<div class="note-body"></div>';
          el.querySelector('.note-body').textContent = tile.text || '';   // textContent: safe + keeps newlines
        }
        break;
      }
      case 'weather': {   // PROPLANTA/Weather device: current + stats + N-day forecast
        el.classList.add('tile-rich', 'tile-weather');
        el.innerHTML = EDIT + header(tile) +
          '<div class="wx-top">' +
            '<div class="wx-cur"><div class="wx-ico"></div>' +
              '<div class="wx-info"><div class="wx-temp">–</div><div class="wx-cond"></div></div></div>' +
            '<div class="wx-stats"></div>' +
          '</div>' +
          '<div class="wx-fc"></div>';
        break;
      }
      case 'thermostat': {   // universal heating thermostat: big Ist, Soll with −/+, modes, valve+battery
        el.classList.add('tile-rich', 'tile-thermo');
        const step   = parseFloat(tile.tstep) || 0.5;
        const setcmd = tile.tsetCmd || tile.tdReading || 'desired-temp';
        const modeCmd = tile.tmodeCmd || tile.tmReading || 'controlMode';
        // Value is the loose match token for glow ("manu" matches "manual" and back).
        const modes  = [['Auto', 'auto', 'auto'], ['Manuell', 'manual', 'manu'], ['Boost', 'boost', 'boost']];
        el.innerHTML = EDIT + header(tile) +
          '<div class="th-actual"><b class="th-av">–</b><span class="th-u">°</span></div>' +
          '<div class="th-setrow">' +
            '<button type="button" class="th-step th-dn" title="kühler">−</button>' +
            '<div class="th-desired" data-val=""><b class="th-dv">–</b><span class="th-u">°</span></div>' +
            '<button type="button" class="th-step th-up" title="wärmer">+</button>' +
          '</div>' +
          '<div class="th-modes">' + modes.map(([lbl, arg, val]) =>
              `<button type="button" class="th-mode" data-arg="${arg}" data-val="${val}">${lbl}</button>`).join('') + '</div>' +
          '<div class="th-foot"></div>';
        const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
        const desired = el.querySelector('.th-desired'), dvEl = el.querySelector('.th-dv');
        const bump = dir => {
          let cur = parseFloat(desired.dataset.val); if (isNaN(cur)) cur = 20;
          let nv = Math.round((cur + dir * step) / step) * step;      // snap to the step grid
          nv = Math.min(30, Math.max(5, Math.round(nv * 10) / 10));   // sane bounds, kill fp noise
          onAction(tile, setcmd + ' ' + nv);
          desired.dataset.val = nv; dvEl.textContent = fmt(nv);       // optimistic until the reading confirms
          desired.dataset.pending = nv;                               // hold it; ignore stale reads until FHEM catches up
          desired.dataset.pendingTs = Date.now();
        };
        el.querySelector('.th-dn').addEventListener('click', e => { e.stopPropagation(); bump(-1); });
        el.querySelector('.th-up').addEventListener('click', e => { e.stopPropagation(); bump(1); });
        el.querySelectorAll('.th-mode').forEach(m => m.addEventListener('click', e => {
          e.stopPropagation();
          onAction(tile, modeCmd + ' ' + m.dataset.arg);
          el.querySelectorAll('.th-mode').forEach(o => o.classList.toggle('active', o === m)); // optimistic
          el.dataset.modePending = m.dataset.val; el.dataset.modePendingTs = Date.now();
        }));
        break;
      }
      case 'status': {   // reading value -> big centered icon + label (read-only status)
        el.classList.add('tile-rich', 'tile-status');
        el.innerHTML = EDIT + header(tile) +
          '<div class="st-body"><div class="st-ico"></div><div class="st-lbl"></div></div>';
        break;
      }
      case 'label': {   // standalone bold text label (no device); icon optional
        el.classList.add('tile-label');
        const g   = (tile.icon && tile.icon !== 'none') ? iconHtml(tile.icon) : '';
        const col = safeColor(tile.iconColor);
        const chip = g ? `<div class="chip"${col ? ` style="color:${col}"` : ''}>${g}</div>` : '';
        el.innerHTML = EDIT + `<div class="row">${chip}<div class="lbl-text">${esc(tile.label || '')}</div></div>`;
        break;
      }
      case 'value': {   // big value centered, small label (chip + name) at the bottom
        el.classList.add('tile-rich');
        // Title on -> header top + value below; title off -> value fully centered.
        el.innerHTML = EDIT + (tile.hideHeader ? '' : header(tile)) +
          '<div class="va-body"><span class="va-val">–</span><span class="va-unit"></span></div>';
        break;
      }
      default: // sensor / unknown -> plain header card
        el.innerHTML = EDIT + header(tile);
    }
    return el;
  }

  function paintColor(el, val) {
    const m = String(val ?? '').match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return;
    const hex = '#' + m[1];
    const inp = el.querySelector('.lcolor');
    if (inp && document.activeElement !== inp) inp.value = hex;
    const pv = el.querySelector('.cc-preview'); if (pv) pv.style.background = hex;
  }
  function setSlider(el, sel, raw) {
    const r = el.querySelector(sel); if (!r || document.activeElement === r) return;
    const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
    if (!isNaN(n)) { r.value = n; const v = r.parentElement.querySelector('.mval'); if (v) v.textContent = n + (sel === '.lct' ? 'K' : '%'); }
  }

  function apply(el, tile, dev, map) {
    if (dev) el.classList.remove('tile-wait');   // first data arrived -> stop the loading pulse
    const v = readingValue(tile, dev);
    const state = el.querySelector('.t-state');
    switch (tile.type) {
      case 'switch': {
        const on = isOn(v);
        el.classList.toggle('on', on);
        if (state) state.textContent = on ? 'An' : 'Aus';
        break;
      }
      case 'light': {
        const on = isOn(v);
        el.classList.toggle('on', on);
        if (state) state.textContent = on ? 'An' : 'Aus';
        const rgb = dev && dev.readings && dev.readings.rgb ? dev.readings.rgb.value : null;
        if (rgb != null) paintColor(el, rgb);
        const dimr = dev && dev.readings && (dev.readings[tile.dimReading] || dev.readings.pct || dev.readings.bright);
        if (dimr) setSlider(el, '.ldim', dimr.value);
        const ctr = dev && dev.readings && (dev.readings.ct || dev.readings.colortemperature);
        if (ctr) setSlider(el, '.lct', ctr.value);
        break;
      }
      case 'dimmer': setSlider(el, '.ldim', v); break;
      case 'color':  if (v != null) paintColor(el, v); break;
      case 'value': {
        const valEl = el.querySelector('.va-val'), unitEl = el.querySelector('.va-unit');
        if (valEl)  valEl.textContent  = v != null ? v : '–';
        if (unitEl) unitEl.textContent = (v != null && tile.unit) ? tile.unit : '';
        break;
      }
      case 'status': {
        const rv = String(v ?? '');
        const norm = s => String(s ?? '').trim().toLowerCase();
        const rules = tile.statusMap || [];
        let rule = rules.find(r => r.val && norm(r.val) === norm(rv));  // exact value match
        if (!rule) rule = rules.find(r => !r.val);                      // "Standard/sonst" catch-all row
        const icoEl = el.querySelector('.st-ico'), lblEl = el.querySelector('.st-lbl');
        if (rule) {                                                    // matched: honour an empty label (icon-only)
          if (icoEl) { icoEl.innerHTML = rule.icon ? iconHtml(rule.icon) : iconFor(tile); icoEl.style.color = safeColor(rule.iconColor) || ''; }
          if (lblEl) lblEl.textContent = rule.label || '';
        } else {                                                       // no configured rule for this value: raw value + tile icon
          if (icoEl) { icoEl.innerHTML = iconFor(tile); icoEl.style.color = safeColor(tile.iconColor) || ''; }
          if (lblEl) lblEl.textContent = rv || '–';
        }
        break;
      }
      case 'button': {
        // Loose glow-match: equal, or one is a prefix of the other with length diff <= 2.
        // So an imperative command lights up on its participle reading: lock->locked,
        // unlock->unlocked, open->opened, close->closed — but not on->online (diff 4).
        const eq = (a, b) => {
          if (a == null) return false;
          const x = String(a).trim().toLowerCase(), y = String(b).trim().toLowerCase();
          if (x === y) return true;
          const [s, l] = x.length <= y.length ? [x, y] : [y, x];
          return s.length >= 2 && l.startsWith(s) && (l.length - s.length) <= 2;
        };
        const tog = el.querySelector('.toggle-btn');
        if (tog) {
          // Show the icon of whichever state currently matches; glow when matched.
          const st = JSON.parse(tog.dataset.states || '[]');
          let idx = st.findIndex(s => eq(devReading(dev, s.rd), s.val));
          const matched = idx >= 0;
          if (!matched) idx = 0;
          tog.dataset.cur = String(idx);
          tog.innerHTML = iconHtml(st[idx] && st[idx].icon);
          tog.style.color = (st[idx] && st[idx].iconColor) || '';
          tog.classList.toggle('active', matched && st[idx] && st[idx].glow !== false);
        } else {
          // Light each button whose target reading matches — unless glow is off for it.
          el.querySelectorAll('.scenes .scene').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.glow !== '0' && eq(devReading(dev, btn.dataset.rd), btn.dataset.val));
          });
        }
        break;
      }
      case 'weather': {
        const R = (dev && dev.readings) || {};
        const rv = k => (R[k] != null ? R[k].value : null);          // PROPLANTA reading
        const num = x => (x == null || x === '' || isNaN(parseFloat(x))) ? null : Math.round(parseFloat(x));
        const set = (sel, html, isText) => { const n = el.querySelector(sel); if (n) n[isText ? 'textContent' : 'innerHTML'] = html; };
        // A current value: from a configured foreign device+reading, else PROPLANTA.
        const src = (metric, propKey) => {
          const s = tile.sources && tile.sources[metric];
          if (s && s.device && s.reading && map && map[s.device] && map[s.device].readings && map[s.device].readings[s.reading] != null)
            return map[s.device].readings[s.reading].value;
          return rv(propKey);
        };
        const cond = rv('weather'), temp = src('temperature', 'temperature');
        set('.wx-ico', iconHtml(wxIcon(cond)));
        set('.wx-temp', temp != null ? (temp + '°') : '–', true);
        set('.wx-cond', cond || '', true);
        // stats block: two fixed columns — Feuchte/Druck/Wind and Regen/Sonne/UV
        const col1 = [
          ['droplet', src('humidity', 'humidity'), '%',    'Feuchte'],
          ['gauge',   src('pressure', 'pressure'), ' hPa', 'Druck'],
          ['wind',    rv('wind'),                  ' km/h','Wind'],
        ];
        const col2 = [
          ['rain',    rv('fc0_chOfRainDay'),       '%',    'Regen'],
          ['sun',     rv('fc0_sun'),               '%',    'Sonne'],
          ['sun',     rv('fc0_uv'),                '',     'UV'],
        ];
        const colHtml = list => '<div class="wx-col">' + list.filter(s => s[1] != null && s[1] !== '')
          .map(([ic, val, unit, lbl]) => '<div class="wx-stat">' + iconHtml(ic) +
            '<span class="wv"><b>' + val + unit + '</b><span class="wl">' + lbl + '</span></span></div>').join('') + '</div>';
        set('.wx-stats', colHtml(col1) + colHtml(col2));
        let fc = '';
        for (let i = 0; i < (tile.fcDays || 7); i++) {
          const date = rv('fc' + i + '_date'); if (date == null) continue;
          const hi = num(rv('fc' + i + '_tempMax')), lo = num(rv('fc' + i + '_tempMin'));
          const pop = num(rv('fc' + i + '_chOfRainDay'));       // PROPLANTA: Regenwahrscheinlichkeit in %
          fc += '<div class="wx-day"><div class="d">' + wxWeekday(date) + '</div>' + iconHtml(wxIcon(rv('fc' + i + '_weatherDay'))) +
                '<div class="hl"><b>' + (hi != null ? hi + '°' : '–') + '</b> <span class="lo">' + (lo != null ? lo + '°' : '') + '</span></div>' +
                (pop != null ? '<div class="pop">' + iconHtml('droplet') + pop + '%</div>' : '') + '</div>';
        }
        set('.wx-fc', fc);
        break;
      }
      case 'thermostat': {
        const num = x => (x == null || x === '' || isNaN(parseFloat(x))) ? null : parseFloat(x);
        const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
        const rd  = k => devReading(dev, k);
        const a = num(rd(tile.taReading || 'measured-temp'));
        const av = el.querySelector('.th-av'); if (av) av.textContent = a != null ? fmt(Math.round(a * 10) / 10) : '–';
        const d = num(rd(tile.tdReading || 'desired-temp'));
        const desired = el.querySelector('.th-desired'), dv = el.querySelector('.th-dv');
        if (d != null && desired) {
          const pend = parseFloat(desired.dataset.pending);         // a just-sent value we're waiting on
          const waiting = !isNaN(pend) && desired.dataset.pendingTs &&
                          (Date.now() - +desired.dataset.pendingTs < 20000) && Math.abs(d - pend) > 0.01;
          if (!waiting) {                                           // reading confirmed (or timed out): trust it
            if (!isNaN(pend)) { delete desired.dataset.pending; delete desired.dataset.pendingTs; }
            desired.dataset.val = d; if (dv) dv.textContent = fmt(d);
          }
        }
        if (tile.tmReading) {                                       // glow the active mode
          const mv = String(rd(tile.tmReading) ?? '').toLowerCase();
          const mp = el.dataset.modePending;
          const mWait = mp && el.dataset.modePendingTs && (Date.now() - +el.dataset.modePendingTs < 20000) &&
                        !(mv && (mv === mp || mv.startsWith(mp.slice(0, 4))));
          if (!mWait) {
            if (mp) { delete el.dataset.modePending; delete el.dataset.modePendingTs; }
            el.querySelectorAll('.th-mode').forEach(m => {
              const t = m.dataset.val;
              m.classList.toggle('active', !!mv && (mv === t || mv.startsWith(t.slice(0, 4))));
            });
          }
        }
        const foot = el.querySelector('.th-foot');
        if (foot) {                                                 // dezent: valve % + battery, only if present
          const parts = [];
          const vv = tile.tvReading ? num(rd(tile.tvReading)) : null;
          if (vv != null) parts.push('<span class="th-fi th-valve" title="Ventil">' + iconHtml('heating') + Math.round(vv) + '%</span>');
          const bRaw = tile.tbReading ? rd(tile.tbReading) : null;
          if (bRaw != null && bRaw !== '') {
            const bn = num(bRaw);
            const low = /^(low|nok|err|critical|empty)$/i.test(String(bRaw)) || (bn != null && bn <= 15);
            parts.push('<span class="th-fi th-bat' + (low ? ' th-low' : '') + '" title="Batterie">' + iconHtml('battery') +
                       esc(bRaw) + (bn != null ? '%' : '') + '</span>');
          }
          foot.innerHTML = parts.join('');
        }
        break;
      }
      // group / readingsgroup / label: no device state line
    }
  }

  return { build, apply, iconList: () => ICON_LIST, iconSvg: iconHtml };
})();

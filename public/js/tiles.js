// Tile rendering + interaction binding. Compact "card" style (icon chip + name + state).
const Tiles = (() => {

  const ICONS = { value: '🌡', switch: '💡', dimmer: '🔆', color: '🎨', light: '💡',
                  readingsgroup: '📋', group: '🗂', button: '▶', label: '🏷' };

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

  function readingValue(tile, dev) {
    if (!dev) return null;
    const r = tile.reading || 'state';
    if (dev.readings && dev.readings[r] != null) return dev.readings[r].value;
    if (r === 'state') return dev.state;
    return null;
  }
  const isOn = v => ['on', '1', 'true', 'open', 'yes', 'ja'].includes(String(v ?? '').toLowerCase());
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function chipClass(tile) {
    const u = tile.unit || '';
    if (u === '°C') return ' c-temp';
    if (u === '%')  return ' c-hum';
    if (/W|kWh|A|V/.test(u)) return ' c-pow';
    return '';
  }
  function header(tile, ctrl) {
    const icon = ICONS[tile.type] || '⬚';
    const name = esc(tile.label || tile.device || '');
    return `<div class="row">
        <div class="chip${chipClass(tile)}">${icon}</div>
        <div class="tx"><div class="t-name">${name}</div><div class="t-state"></div></div>
        ${ctrl || ''}</div>`;
  }

  // In edit mode the whole card is the drag handle (see app.js / CSS); these are
  // just the per-tile action badges layered on top.
  const EDIT = `<div class="tile-del" title="Entfernen">✕</div>
                <div class="tile-edit" title="Bearbeiten">✎</div>`;

  function build(tile, onAction) {
    const el = document.createElement('div');
    el.className = 'grid-stack-item-content tile tile-' + tile.type + (tile.hideHeader ? ' no-head' : '');
    el.dataset.tileId = tile.id;

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
        el.innerHTML = EDIT + header(tile) + '<div class="scenes"></div>';
        const sc = el.querySelector('.scenes');
        for (const b of list) {
          const x = document.createElement('button'); x.className = 'scene'; x.textContent = b.label || b.cmd;
          x.addEventListener('click', () => onAction(tile, b.cmd)); sc.appendChild(x);
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
      case 'label':
        el.innerHTML = EDIT + header(tile);
        break;
      default: // value / sensor
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

  function apply(el, tile, dev) {
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
      case 'value':  if (state) state.textContent = v != null ? (v + (tile.unit ? ' ' + tile.unit : '')) : '–'; break;
      // button / group / readingsgroup / label: no device state line
    }
  }

  return { build, apply };
})();

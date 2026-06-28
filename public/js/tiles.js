// Tile rendering + interaction binding.
const Tiles = (() => {

  const ICONS = { value: '🌡', switch: '💡', dimmer: '🔆', color: '🎨', light: '💡',
                  readingsgroup: '📋', group: '🗂', button: '▶', label: '🏷' };

  // #rrggbb -> "H,S,V" (H 0-360, S/V 0-100) for devices that take `set x hsv`.
  function hexToHsv(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60); if (h < 0) h += 360;
    }
    return `${h},${Math.round((mx ? d / mx : 0) * 100)},${Math.round(mx * 100)}`;
  }

  // Build the "set" argument for a colour change, honouring what the device supports.
  function colorArg(tile, hex) {
    const cmd = tile.colorcmd || 'rgb';
    if (cmd === 'hsv') return 'hsv ' + hexToHsv(hex);
    return cmd + ' ' + hex.slice(1).toUpperCase(); // rgb/color -> RRGGBB
  }

  // HSV -> #rrggbb (h 0-360, s/v 0-100) for the hue slider.
  function hsvToHex(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r, g, b;
    if (h < 60)       [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else              [r, g, b] = [c, 0, x];
    const hx = n => ('0' + Math.round((n + m) * 255).toString(16)).slice(-2);
    return '#' + hx(r) + hx(g) + hx(b);
  }

  const PRESETS = ['#ffffff', '#ffd6a5', '#ff5d5d', '#ffd25d', '#7bed9f', '#5dd2ff', '#6a5dff', '#ff5dce'];

  // Modern colour control: live-preview swatch (opens native picker) + rainbow hue slider + presets.
  function buildColorControl(tile, onAction) {
    const wrap = document.createElement('div');
    wrap.className = 'colorctl';
    wrap.innerHTML =
      `<div class="cc-top">
         <label class="cc-swatch"><input type="color" class="lcolor" value="#ffffff"><span class="cc-preview"></span></label>
         <input type="range" class="cc-hue" min="0" max="360" value="0">
       </div>
       <div class="cc-presets">${PRESETS.map(c => `<span class="cc-dot" style="background:${c}" data-c="${c}"></span>`).join('')}</div>`;
    const input = wrap.querySelector('.lcolor');
    const prev  = wrap.querySelector('.cc-preview');
    const hue   = wrap.querySelector('.cc-hue');
    const paint = hex => { input.value = hex; prev.style.background = hex; };
    const send  = hex => { paint(hex); onAction(tile, colorArg(tile, hex)); };
    paint(input.value);
    input.addEventListener('input',  () => prev.style.background = input.value);
    input.addEventListener('change', () => send(input.value));
    hue.addEventListener('input',  () => paint(hsvToHex(+hue.value, 100, 100)));
    hue.addEventListener('change', () => send(input.value));
    wrap.querySelectorAll('.cc-dot').forEach(d => d.addEventListener('click', () => send(d.dataset.c)));
    return wrap;
  }

  function readingValue(tile, dev) {
    if (!dev) return null;
    const r = tile.reading || 'state';
    if (dev.readings && dev.readings[r] != null) return dev.readings[r].value;
    if (r === 'state') return dev.state;
    return null;
  }
  function readingTime(tile, dev) {
    const r = tile.reading || 'state';
    return dev && dev.readings && dev.readings[r] ? dev.readings[r].time : '';
  }
  const isOn = v => ['on', '1', 'true', 'open', 'yes', 'ja'].includes(String(v ?? '').toLowerCase());

  // Build the inner content element of a grid item (called once).
  function build(tile, onAction) {
    const el = document.createElement('div');
    el.className = 'grid-stack-item-content tile';
    el.dataset.tileId = tile.id;

    const label = tile.label || tile.device || '';
    const head = tile.hideHeader ? '' :
      `<div class="tile-head"><span class="tile-icon">${ICONS[tile.type] || '⬚'}</span>
       <span class="tile-label">${escapeHtml(label)}</span></div>`;
    el.innerHTML =
      `<div class="tile-del" title="Entfernen">✕</div>
       <div class="tile-edit" title="Bearbeiten">✎</div>
       ${head}
       <div class="tile-body"></div>`;

    const body = el.querySelector('.tile-body');

    switch (tile.type) {
      case 'switch': {
        const sw = document.createElement('div');
        sw.className = 'switch';
        sw.innerHTML = '<span class="knob"></span>';
        sw.addEventListener('click', () => {
          const turnOn = !sw.classList.contains('on');
          onAction(tile, turnOn ? 'on' : 'off');
        });
        body.appendChild(sw);
        break;
      }
      case 'dimmer': {
        body.innerHTML =
          `<div class="dimmer">
             <div class="pct">–</div>
             <input type="range" min="0" max="100" step="1" value="0">
           </div>`;
        const range = body.querySelector('input');
        const pct   = body.querySelector('.pct');
        range.addEventListener('input', () => { pct.textContent = range.value + '%'; });
        range.addEventListener('change', () => onAction(tile, (tile.setcmd || 'pct') + ' ' + range.value));
        break;
      }
      case 'button': {
        const list = (tile.buttons && tile.buttons.length) ? tile.buttons
                   : (tile.cmds && tile.cmds.length) ? tile.cmds.map(c => ({ cmd: c }))
                   : (tile.cmd ? [{ cmd: tile.cmd }] : [{ cmd: 'on' }]);
        body.classList.add('tile-buttons');
        for (const b of list) {
          const btn = document.createElement('button');
          btn.className = 'tile-btn';
          btn.textContent = b.label || b.cmd;
          btn.addEventListener('click', () => onAction(tile, b.cmd));
          body.appendChild(btn);
        }
        break;
      }
      case 'color':
        body.className = 'tile-body tile-color';
        body.appendChild(buildColorControl(tile, onAction));
        break;
      case 'light': {
        body.classList.add('tile-light-body');
        const ctMin = tile.ctMin || 2000, ctMax = tile.ctMax || 6500;
        const useRgb = tile.useRgb !== false, useCt = tile.useCt !== false, useDim = !!tile.useDim;
        let html = `<div class="lrow"><span class="llbl">An / Aus</span><div class="switch"><span class="knob"></span></div></div>`;
        if (useDim) html += `<div class="lrow"><span class="llbl">Helligkeit <small class="dimval"></small></span><input type="range" class="ldim" min="0" max="100" step="1" value="0"></div>`;
        if (useCt)  html += `<div class="lrow"><span class="llbl">Weiß <small class="ctval"></small></span><input type="range" class="lct" min="${ctMin}" max="${ctMax}" step="50" value="${ctMin}"></div>`;
        body.innerHTML = html;

        const sw = body.querySelector('.switch');
        sw.addEventListener('click', () => onAction(tile, sw.classList.contains('on') ? 'off' : 'on'));
        if (useRgb) body.querySelector('.lrow').after(buildColorControl(tile, onAction)); // after on/off row

        const dim = body.querySelector('.ldim');
        if (dim) {
          const dv = body.querySelector('.dimval'); const showd = () => dv.textContent = dim.value + '%';
          dim.addEventListener('input', showd);
          dim.addEventListener('change', () => onAction(tile, (tile.dimcmd || 'pct') + ' ' + dim.value));
          showd();
        }
        const ct = body.querySelector('.lct');
        if (ct) {
          const ctval = body.querySelector('.ctval'); const showct = () => ctval.textContent = ct.value + 'K';
          ct.addEventListener('input', showct);
          ct.addEventListener('change', () => onAction(tile, (tile.ctcmd || 'ct') + ' ' + ct.value));
          showct();
        }
        break;
      }
      case 'readingsgroup':
        body.innerHTML = `<div class="rg-wrap"><div class="rg-content rg-loading">lädt…</div></div>`;
        break;
      case 'group':
        el.classList.add('tile-group');
        body.className = 'tile-body tile-group-body';
        body.innerHTML = `<div class="grid-stack grid-stack-nested"></div>`; // sub-grid, initialised by app.js
        break;
      case 'label':
        body.innerHTML = `<div class="tile-value">${escapeHtml(tile.label || '')}</div>`;
        break;
      default: // value
        body.innerHTML = `<div><span class="tile-value">–</span><span class="tile-unit">${escapeHtml(tile.unit || '')}</span></div>
                          <div class="tile-time"></div>`;
    }
    return el;
  }

  // Update an existing tile element with fresh device data.
  function apply(el, tile, dev) {
    const v = readingValue(tile, dev);
    switch (tile.type) {
      case 'switch': {
        const on = isOn(v);
        el.querySelector('.switch')?.classList.toggle('on', on);
        el.classList.toggle('lit', on);   // light up the whole card when on
        break;
      }
      case 'dimmer': {
        const range = el.querySelector('input');
        const pct   = el.querySelector('.pct');
        if (range && document.activeElement !== range) {
          const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
          if (!isNaN(n)) { range.value = n; pct.textContent = n + '%'; }
        }
        break;
      }
      case 'color': {
        paintColor(el, v);
        break;
      }
      case 'light': {
        const on = isOn(v);                          // tile.reading = power
        el.querySelector('.switch')?.classList.toggle('on', on);
        el.classList.toggle('lit', on);
        const rgb = dev && dev.readings && dev.readings.rgb ? dev.readings.rgb.value : null;
        if (rgb != null) paintColor(el, rgb);
        const dimr = dev && dev.readings && (dev.readings[tile.dimReading] || dev.readings.pct || dev.readings.bright);
        const de = el.querySelector('.ldim');
        if (de && dimr && document.activeElement !== de) {
          const n = parseInt(String(dimr.value).replace(/[^\d]/g, ''), 10);
          if (!isNaN(n)) { de.value = n; const dv = el.querySelector('.dimval'); if (dv) dv.textContent = n + '%'; }
        }
        const ctr = dev && dev.readings && (dev.readings.ct || dev.readings.colortemperature);
        const ce = el.querySelector('.lct');
        if (ce && ctr && document.activeElement !== ce) {
          const n = parseInt(String(ctr.value).replace(/[^\d]/g, ''), 10);
          if (!isNaN(n)) { ce.value = n; const cv = el.querySelector('.ctval'); if (cv) cv.textContent = n + 'K'; }
        }
        break;
      }
      case 'value': {
        const valEl = el.querySelector('.tile-value');
        if (valEl) valEl.textContent = v != null ? v : '–';
        const t = el.querySelector('.tile-time');
        if (t) t.textContent = readingTime(tile, dev) || '';
        break;
      }
    }
  }

  // Set a colour control's swatch/preview from a "#rrggbb" reading value.
  function paintColor(el, val) {
    const m = String(val ?? '').match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return;
    const hex = '#' + m[1];
    const inp = el.querySelector('.lcolor');
    if (inp && document.activeElement !== inp) inp.value = hex;
    const pv = el.querySelector('.cc-preview');
    if (pv) pv.style.background = hex;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  return { build, apply };
})();

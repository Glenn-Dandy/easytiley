// Tile rendering + interaction binding. FTUI-style look.
const Tiles = (() => {

  const ICONS = { value: '🌡', switch: '💡', dimmer: '🔆', color: '🎨',
                  readingsgroup: '📋', button: '▶', label: '🏷' };

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
    el.innerHTML =
      `<div class="tile-del" title="Entfernen">✕</div>
       <div class="tile-edit" title="Bearbeiten">✎</div>
       <div class="tile-head"><span class="tile-icon">${ICONS[tile.type] || '⬚'}</span>
       <span class="tile-label">${escapeHtml(label)}</span></div>
       <div class="tile-body"></div>`;

    const body = el.querySelector('.tile-body');

    switch (tile.type) {
      case 'switch': {
        const sw = document.createElement('div');
        sw.className = 'switch';
        sw.textContent = '⏻';
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
        const b = document.createElement('button');
        b.className = 'tile-btn';
        b.textContent = tile.label || 'Senden';
        b.addEventListener('click', () => onAction(tile, tile.cmd || 'on'));
        body.appendChild(b);
        break;
      }
      case 'color': {
        body.className = 'tile-body tile-color';
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.value = '#ffffff';
        inp.addEventListener('change', () => onAction(tile, colorArg(tile, inp.value)));
        body.appendChild(inp);
        break;
      }
      case 'readingsgroup':
        body.innerHTML = `<div class="rg-wrap"><div class="rg-content rg-loading">lädt…</div></div>`;
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
      case 'switch':
        el.querySelector('.switch')?.classList.toggle('on', isOn(v));
        break;
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
        const inp = el.querySelector('input[type=color]');
        const m = String(v ?? '').match(/^#?([0-9a-fA-F]{6})$/);
        if (inp && m && document.activeElement !== inp) inp.value = '#' + m[1];
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  return { build, apply };
})();

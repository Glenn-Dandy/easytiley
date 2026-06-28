// Tile rendering + interaction binding. FTUI-style look.
const Tiles = (() => {

  const ICONS = { value: '🌡', switch: '💡', dimmer: '🔆', button: '▶', label: '🏷' };

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

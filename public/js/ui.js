// Shared UI helpers: esc, autocomplete dropdown, icon picker, color picker.
// Classic scripts share top-level scope - app.js/dialogs.js use these directly.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
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


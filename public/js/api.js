// Thin wrapper around the PHP backend.
const API = {
  async _get(path) {
    const r = await fetch('/api/' + path);
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    return r.json();
  },
  async _send(path, method, body) {
    const r = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    return r.json();
  },

  health()              { return this._get('health'); },
  devices(names)        { return this._get('devices' + (names ? '?names=' + encodeURIComponent(names) : '')); },
  deviceList()          { return this._get('devicelist'); },
  cmd(device, args)     { return this._send('cmd', 'POST', { device, args }); },
  rawCmd(cmd)           { return this._send('cmd', 'POST', { cmd }); },

  dashboards()          { return this._get('dashboards'); },
  dashboard(id)         { return this._get('dashboard?id=' + id); },
  createDashboard(name) { return this._send('dashboards', 'POST', { name }); },
  saveDashboard(id, name, layout) { return this._send('dashboard', 'POST', { id, name, layout }); },
  deleteDashboard(id)   { return this._send('dashboard?id=' + id, 'DELETE'); },
};

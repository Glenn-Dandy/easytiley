// Live data: FHEM push via Server-Sent-Events (longpoll proxied by the backend).
// Falls back to periodic polling if SSE isn't available or the stream errors.
const Live = (() => {
  let es = null, poll = null;
  let getNames = () => [], onData = () => {}, onStatus = null;
  let map = {}, pending = false;

  // Coalesce a burst of updates into one repaint (next frame).
  function coalesce() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; onData(map); });
  }

  // Full current state (longpoll only sends *changes*, so we need a snapshot).
  async function snapshot() {
    const names = getNames();
    if (!names.length) { onStatus && onStatus('ok'); return; }
    try {
      const res = await API.devices(names.join(','));
      map = {};
      for (const d of res.devices) map[d.name] = d;
      onData(map);
      onStatus && onStatus('ok');
    } catch (e) { onStatus && onStatus('err', e.message); }
  }

  function connect() {
    const names = getNames();
    if (!names.length) { onStatus && onStatus('ok'); return; }
    snapshot();                                   // seed current values
    if (typeof EventSource === 'undefined') { startPoll(); return; }
    try {
      es = new EventSource('/api/stream?names=' + encodeURIComponent(names.join(',')));
    } catch (e) { startPoll(); return; }
    es.onopen = () => { stopPoll(); onStatus && onStatus('ok'); };
    es.onmessage = ev => {
      let u; try { u = JSON.parse(ev.data); } catch { return; }
      const d = map[u.d] || (map[u.d] = { name: u.d, state: '', readings: {} });
      if (u.r === 'state') d.state = u.v;
      (d.readings || (d.readings = {}))[u.r] = { value: u.v };
      coalesce();
    };
    es.onerror = () => { startPoll(); };          // keep data flowing while SSE retries
  }

  function startPoll() { if (!poll) poll = setInterval(snapshot, 3000); }
  function stopPoll()  { if (poll) { clearInterval(poll); poll = null; } }

  function start(getDeviceNames, onDataCb, onStatusCb) {
    stop();
    getNames = getDeviceNames; onData = onDataCb; onStatus = onStatusCb;
    connect();
  }
  function reconnect() { if (es) { es.close(); es = null; } connect(); } // device set changed
  function stop() { if (es) { es.close(); es = null; } stopPoll(); }

  return { start, stop, reconnect };
})();

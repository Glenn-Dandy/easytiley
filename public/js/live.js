// Live data: FHEM push via Server-Sent-Events (longpoll proxied by the backend).
// Falls back to periodic polling if SSE isn't available or the stream errors.
const Live = (() => {
  let es = null, poll = null, dog = null, lastBeat = 0;
  let getNames = () => [], onData = () => {}, onStatus = null;
  let map = {}, pending = false, dirty = new Set();   // devices changed since last repaint

  // Coalesce a burst of updates into one repaint. rAF alone freezes on dimmed
  // kiosk displays (WebView pauses it) - the timeout fallback keeps painting.
  function coalesce() {
    if (pending) return;
    pending = true;
    const run = () => { if (!pending) return; pending = false; const d = dirty; dirty = new Set(); onData(map, d); };
    requestAnimationFrame(run);
    setTimeout(run, 250);
  }

  // Full current state (longpoll only sends *changes*, so we need a snapshot).
  async function snapshot() {
    const names = getNames();
    if (!names.length) { onStatus && onStatus('ok'); return; }
    try {
      const res = await API.devices(names.join(','));
      map = {};
      for (const d of res.devices) map[d.name] = d;
      onData(map, null);                        // null = alles neu zeichnen
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
    es.onopen = () => { lastBeat = Date.now(); stopPoll(); onStatus && onStatus('ok'); };
    es.addEventListener('ping', () => { lastBeat = Date.now(); });   // server heartbeat every ~15s
    es.onmessage = ev => {
      lastBeat = Date.now();
      let u; try { u = JSON.parse(ev.data); } catch { return; }
      dirty.add(u.d);
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
    // Watchdog: tablet wifi power-save kills the TCP silently - EventSource
    // never notices. No heartbeat/event for 45s means the stream is dead.
    if (!dog) dog = setInterval(() => {
      if (es && lastBeat && Date.now() - lastBeat > 45000) { lastBeat = Date.now(); reconnect(); }
    }, 10000);
    // Screen back on / tab visible again -> catch up immediately.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && lastBeat && Date.now() - lastBeat > 20000) reconnect();
    });
  }
  function reconnect() { if (es) { es.close(); es = null; } connect(); } // device set changed
  function stop() { if (es) { es.close(); es = null; } stopPoll(); }

  return { start, stop, reconnect };
})();

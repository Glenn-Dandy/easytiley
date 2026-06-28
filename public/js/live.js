// Live data: polls jsonlist2 for only the devices on the active dashboard.
// (Lightweight + robust. Can later be swapped for an SSE/longpoll stream.)
const Live = (() => {
  let timer = null, inFlight = false;

  function start(getDeviceNames, onData, onStatus, intervalMs = 3000) {
    stop();
    const tick = async () => {
      if (inFlight) return;                 // don't stack requests if one is slow
      const names = getDeviceNames();
      if (!names.length) { onStatus && onStatus('ok'); return; }
      inFlight = true;
      try {
        const res = await API.devices(names.join(','));
        const map = {};
        for (const d of res.devices) map[d.name] = d;
        onData(map);
        onStatus && onStatus('ok');
      } catch (e) {
        onStatus && onStatus('err', e.message);
      } finally {
        inFlight = false;
      }
    };
    tick();
    timer = setInterval(tick, intervalMs);
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { start, stop };
})();

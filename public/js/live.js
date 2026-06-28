// Live data: polls jsonlist2 for only the devices on the active dashboard.
// (Lightweight + robust. Can later be swapped for an SSE/longpoll stream.)
const Live = (() => {
  let timer = null;

  function start(getDeviceNames, onData, onStatus, intervalMs = 3000) {
    stop();
    const tick = async () => {
      const names = getDeviceNames();
      if (!names.length) { onStatus && onStatus('ok'); return; }
      try {
        const res = await API.devices(names.join(','));
        const map = {};
        for (const d of res.devices) map[d.name] = d;
        onData(map);
        onStatus && onStatus('ok');
      } catch (e) {
        onStatus && onStatus('err', e.message);
      }
    };
    tick();
    timer = setInterval(tick, intervalMs);
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { start, stop };
})();

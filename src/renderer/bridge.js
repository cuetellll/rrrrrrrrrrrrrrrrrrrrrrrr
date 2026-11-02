/* MAHYAR VPN — engine bridge.
 *
 * Inside the Electron build the preload script exposes `window.mahyar` (engineStart,
 * engineStop, engineState, onTraffic, minimize, toggleMaximize, hide). When it exists the
 * UI drives the real engine ("native" mode). In a normal browser there is no engine, so a
 * clearly-labelled simulation is used ("demo" mode) — nothing is actually tunnelled.
 */
'use strict';

(function () {
  const native = typeof window.mahyar === 'object' && window.mahyar && typeof window.mahyar.engineStart === 'function';
  const listeners = [];
  const emit = (t) => listeners.forEach((cb) => { try { cb(t); } catch (e) { /* ignore */ } });

  let sim = null; // demo traffic generator state
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function startSim(server) {
    stopSim();
    const base = 22 + Math.random() * 40;               // Mbps baseline
    const latencyPenalty = Math.max(.35, 1 - (server.latency || 50) / 400);
    sim = { down: 0, up: 0, t: 0, base: base * latencyPenalty };
    sim.timer = setInterval(() => {
      sim.t += 1;
      const wave = Math.sin(sim.t / 6) * .35 + Math.sin(sim.t / 2.3) * .15;
      const burst = Math.random() < .08 ? 1.8 + Math.random() : 1;
      const dMbps = Math.max(.4, sim.base * (1 + wave) * burst * (.75 + Math.random() * .5));
      const uMbps = Math.max(.1, dMbps * (.12 + Math.random() * .15));
      const dB = dMbps * 125000, uB = uMbps * 125000;   // Mbps -> bytes/s
      sim.down += dB; sim.up += uB;
      emit({ downSpeed: dB, upSpeed: uB, down: sim.down, up: sim.up });
    }, 1000);
  }
  function stopSim() { if (sim && sim.timer) clearInterval(sim.timer); sim = null; }

  function fakeIp(server) {
    // deterministic per server id so the same location always shows the same exit IP
    let h = 0; for (const c of server.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return [45 + (h % 140), (h >> 8) % 255, (h >> 16) % 255, 10 + (h >> 24) % 240].join('.');
  }

  const Bridge = {
    mode: native ? 'native' : 'demo',

    onTraffic(cb) { listeners.push(cb); },

    async connect(server /*, protocol */) {
      if (native) {
        const r = await window.mahyar.engineStart();
        if (r && r.error) throw new Error(r.error);
        return { ip: null };
      }
      await sleep(2600 + Math.random() * 900);
      if (server.status === 'offline') throw new Error('Server is offline');
      startSim(server);
      return { ip: fakeIp(server) };
    },

    async disconnect() {
      if (native) {
        const r = await window.mahyar.engineStop();
        if (r && r.error) throw new Error(r.error);
        return;
      }
      await sleep(1400);
      stopSim();
    },

    async publicIp() {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 5000);
        const res = await fetch('https://api.ipify.org?format=json', { signal: ctl.signal });
        clearTimeout(t);
        const j = await res.json();
        return j.ip || null;
      } catch (e) { return null; }
    },

    async ping(servers) {
      await sleep(900);
      return servers.map((s) => s.status === 'offline' ? null
        : Math.max(8, Math.round(s.latency * (.85 + Math.random() * .3))));
    },

    win: {
      minimize() { if (native) window.mahyar.minimize(); },
      maximize() {
        if (native) return window.mahyar.toggleMaximize();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen && document.exitFullscreen();
      },
      close() { if (native) window.mahyar.hide(); },
    },
  };

  if (native && typeof window.mahyar.onTraffic === 'function') window.mahyar.onTraffic(emit);

  window.MVBridge = Bridge;
})();

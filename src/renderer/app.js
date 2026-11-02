/* MAHYAR VPN — application controller.
 * State machine: idle → connecting → connected → disconnecting → idle
 * Persistence (this device only, localStorage):
 *   mahyar.settings.v1  — preferences
 *   mahyar.server.v1    — selected server id
 *   mahyar.favs.v1      — favourite server ids
 *   mahyar.history.v1   — connection sessions (max 100)
 */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const B = window.MVBridge;
  const SERVERS = window.MV_SERVERS.map((s) => ({ ...s }));
  const FLAG = window.MV_FLAG;

  // ---------- storage helpers (never clears existing keys) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota / private mode */ } },
  };
  const K = { settings: 'mahyar.settings.v1', server: 'mahyar.server.v1', favs: 'mahyar.favs.v1', history: 'mahyar.history.v1' };

  const DEFAULTS = {
    launchOnStartup: true, startMinimized: false, closeToTray: true,
    autoConnect: false, killSwitch: true, autoReconnect: true, protocol: 'Auto',
    glow: 'vivid', motion: 'full', grain: true, particles: true,
    notifications: true, sounds: false, units: 'Mbps',
  };
  const settings = Object.assign({}, DEFAULTS, store.get(K.settings, {}));
  let favs = store.get(K.favs, []);
  let history = store.get(K.history, []);

  const state = {
    phase: 'idle',             // idle | connecting | connected | disconnecting
    server: SERVERS.find((s) => s.id === store.get(K.server, 'auto')) || SERVERS[0],
    resolved: null,            // concrete server when "Smart Location" chosen
    since: 0,
    realIp: null, vpnIp: null,
    traffic: { downSpeed: 0, upSpeed: 0, down: 0, up: 0 },
    dlHist: [], ulHist: [],
    sort: 'recommended', query: '',
  };

  // ---------- formatting ----------
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2) + ' GB';
    if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return Math.round(b) + ' B';
  }
  function speed(bps) { // bytes/s -> [value, unit]
    return settings.units === 'MB/s' ? [(bps / 1048576).toFixed(2), 'MB/s'] : [(bps * 8 / 1e6).toFixed(1), 'Mbps'];
  }
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  }
  function human(ms) {
    const m = Math.round(ms / 60000);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = (s) => s.smart ? s.country : `${s.country} · ${s.city}`;

  // ---------- toast / sound ----------
  let toastT;
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
  }
  let actx;
  function tone(up) {
    if (!settings.sounds) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(up ? 520 : 660, actx.currentTime);
      o.frequency.exponentialRampToValueAtTime(up ? 880 : 330, actx.currentTime + .25);
      g.gain.setValueAtTime(.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.08, actx.currentTime + .03);
      g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .4);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .42);
    } catch (e) { /* audio unavailable */ }
  }

  // ---------- navigation ----------
  function go(name) {
    document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.screen === name));
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    if (name === 'stats') requestAnimationFrame(renderStats);
    if (name === 'servers') renderServers();
  }
  document.querySelectorAll('.rail-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.screen)));

  // ---------- connection ----------
  function pickSmart() {
    return SERVERS.filter((s) => !s.smart && s.status === 'online')
      .sort((a, b) => (a.latency + a.load * .8) - (b.latency + b.load * .8))[0];
  }

  async function connect() {
    if (state.phase !== 'idle') return;
    const target = state.server.smart ? pickSmart() : state.server;
    if (!target || target.status === 'offline') { toast('This server is offline — choose another location', 'err'); return; }
    state.resolved = target;
    setPhase('connecting');
    try {
      const r = await B.connect(target, settings.protocol);
      if (state.phase !== 'connecting') return;
      state.vpnIp = r.ip || null;
      state.since = Date.now();
      state.traffic = { downSpeed: 0, upSpeed: 0, down: 0, up: 0 };
      state.dlHist = []; state.ulHist = [];
      setPhase('connected');
      tone(true);
      if (settings.notifications) toast(`Connected to ${label(target)}`, 'ok');
      if (B.mode === 'native') B.publicIp().then((ip) => { state.vpnIp = ip; renderHome(); });
    } catch (e) {
      setPhase('idle');
      toast('Connection failed: ' + e.message, 'err');
    }
  }

  async function disconnect() {
    if (state.phase !== 'connected') return;
    const session = {
      id: Date.now(), server: state.resolved.id, start: state.since, end: Date.now(),
      down: state.traffic.down, up: state.traffic.up, protocol: settings.protocol,
    };
    setPhase('disconnecting');
    try { await B.disconnect(); } catch (e) { toast(e.message, 'err'); }
    history.unshift(session); history = history.slice(0, 100); store.set(K.history, history);
    state.vpnIp = null;
    state.traffic = { downSpeed: 0, upSpeed: 0, down: 0, up: 0 };
    setPhase('idle');
    tone(false);
    if (settings.notifications) toast('Disconnected · session saved');
  }

  function setPhase(p) {
    state.phase = p;
    document.body.classList.toggle('is-connected', p === 'connected');
    $('orb-stage').dataset.state = p === 'idle' ? 'idle' : p;
    renderHome();
  }

  $('orb').addEventListener('click', () => {
    if (state.phase === 'idle') connect();
    else if (state.phase === 'connected') disconnect();
  });

  B.onTraffic((t) => {
    if (state.phase !== 'connected') return;
    state.traffic = t;
    state.dlHist.push(t.downSpeed); state.ulHist.push(t.upSpeed);
    if (state.dlHist.length > 90) { state.dlHist.shift(); state.ulHist.shift(); }
    renderLive();
  });

  // ---------- HOME render ----------
  function renderHome() {
    const p = state.phase, s = state.server, r = state.resolved;
    const shown = (p === 'idle' || !r) ? s : r;
    const orbText = { idle: 'CONNECT', connecting: 'CONNECTING…', connected: 'CONNECTED', disconnecting: 'DISCONNECTING…' }[p];
    const orbSub = { idle: 'Tap to secure', connecting: 'Establishing tunnel', connected: 'Tap to disconnect', disconnecting: 'Closing tunnel' }[p];
    $('orb-label').textContent = orbText;
    $('orb-sub').textContent = orbSub;
    $('orb').setAttribute('aria-label', orbText);
    $('orb').setAttribute('aria-busy', String(p === 'connecting' || p === 'disconnecting'));

    const dot = $('st-dot');
    dot.className = 'dot' + (p === 'connected' ? ' ok' : p === 'idle' ? '' : ' busy');
    $('st-text').textContent = { idle: 'Not protected', connecting: 'Connecting…', connected: 'Protected', disconnecting: 'Disconnecting…' }[p];
    $('st-foot').textContent = p === 'connected'
      ? (settings.killSwitch ? 'Encrypted · Kill Switch armed' : 'Encrypted tunnel active')
      : p === 'idle' ? 'Your traffic is unencrypted' : 'Negotiating secure handshake';

    $('srv-flag').src = FLAG(shown.cc);
    $('srv-name').textContent = shown.smart ? 'Smart Location' : shown.country;
    $('srv-foot').textContent = shown.smart ? 'Fastest server picked automatically'
      : `${shown.city} · ${shown.latency} ms` + (s.smart && p !== 'idle' ? ' · smart' : '');

    if (p === 'connected') {
      $('ip-value').textContent = state.vpnIp || 'Resolving…';
      $('ip-foot').textContent = 'Virtual location · ' + (r ? r.country : '');
    } else {
      $('ip-value').textContent = state.realIp || '—';
      $('ip-foot').textContent = state.realIp ? 'Your real IP is visible' : 'Unable to detect';
    }

    $('session-server').textContent = p === 'connected' || p === 'disconnecting' ? label(r) : (p === 'connecting' ? 'Routing to ' + r.country : '—');
    $('session-proto').textContent = settings.protocol;
    renderLive();
  }

  function renderLive() {
    const on = state.phase === 'connected';
    const t = on ? state.traffic : { downSpeed: 0, upSpeed: 0, down: 0, up: 0 };
    const [dv, du] = speed(t.downSpeed), [uv, uu] = speed(t.upSpeed);
    $('dl-value').textContent = dv; $('dl-unit').textContent = du;
    $('ul-value').textContent = uv; $('ul-unit').textContent = uu;
    $('data-total').textContent = fmtBytes(t.down + t.up);
    $('data-down').textContent = '↓ ' + fmtBytes(t.down);
    $('data-up').textContent = '↑ ' + fmtBytes(t.up);
    $('dur-value').textContent = on ? clock(Date.now() - state.since) : '00:00:00';
    window.MVCharts.line($('spark-dl'), [{ data: on ? state.dlHist : [], color: '255,69,0' }], { points: 40 });
    window.MVCharts.line($('spark-ul'), [{ data: on ? state.ulHist : [], color: '255,224,224', glow: 4 }], { points: 40 });
    if ($('screen-stats').classList.contains('active')) renderLiveChart();
  }
  setInterval(() => { if (state.phase === 'connected') $('dur-value').textContent = clock(Date.now() - state.since); }, 1000);

  $('info-server').addEventListener('click', () => go('servers'));
  $('info-server').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('servers'); } });

  // ---------- SERVERS ----------
  function renderServers() {
    const q = state.query.trim().toLowerCase();
    let list = SERVERS.filter((s) => !q || (s.country + ' ' + s.city).toLowerCase().includes(q));
    const rank = { online: 0, busy: 1, offline: 2 };
    const cmp = {
      recommended: (a, b) => (b.smart - a.smart) || (favs.includes(b.id) - favs.includes(a.id)) || (rank[a.status] - rank[b.status]) || ((a.latency + a.load) - (b.latency + b.load)),
      latency: (a, b) => (rank[a.status] === 2) - (rank[b.status] === 2) || a.latency - b.latency,
      name: (a, b) => (b.smart - a.smart) || a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
      load: (a, b) => (rank[a.status] === 2) - (rank[b.status] === 2) || a.load - b.load,
    }[state.sort];
    list = list.slice().sort(cmp);
    $('srv-count').textContent = SERVERS.length - 1;

    if (!list.length) { $('srv-list').innerHTML = '<div class="srv-empty">No locations match “' + esc(state.query) + '”.</div>'; return; }
    $('srv-list').innerHTML = list.map((s, i) => {
      const latCls = s.status === 'offline' ? 'bad' : s.latency < 70 ? 'good' : s.latency < 150 ? 'mid' : 'bad';
      const availTxt = { online: 'Available', busy: 'High load', offline: 'Offline' }[s.status];
      const availCls = { online: 'on', busy: 'busy', offline: 'off' }[s.status];
      const sel = s.id === state.server.id;
      const isFav = favs.includes(s.id);
      return `<div class="srv-row${sel ? ' selected' : ''}${s.status === 'offline' ? ' offline' : ''}" role="option" aria-selected="${sel}" tabindex="0" data-id="${s.id}" style="animation-delay:${Math.min(i, 14) * 25}ms">
        <div class="srv-loc"><img class="flag" src="${FLAG(s.cc)}" alt="" loading="lazy"><div><b>${esc(s.country)}</b><small>${esc(s.city)}</small></div></div>
        <div class="srv-load">${s.smart ? '<span>Auto-balanced</span>' : `<div class="bar"><i style="width:${s.load}%"></i></div><span>${s.status === 'offline' ? '—' : s.load + '%'}</span>`}</div>
        <div class="lat ${s.smart ? 'good' : latCls}"><span class="sig"><i></i><i></i><i></i></span>${s.smart ? 'Best' : s.status === 'offline' ? '—' : s.latency + ' ms'}</div>
        <span class="avail ${availCls}">${availTxt}</span>
        ${s.smart ? '<span></span>' : `<button class="fav${isFav ? ' on' : ''}" data-fav="${s.id}" aria-label="${isFav ? 'Remove from' : 'Add to'} favourites"><svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z" stroke-linejoin="round"/></svg></button>`}
      </div>`;
    }).join('');
  }

  function chooseServer(id) {
    const s = SERVERS.find((x) => x.id === id);
    if (!s) return;
    if (s.status === 'offline') { toast(`${label(s)} is offline right now`, 'err'); return; }
    const changed = s.id !== state.server.id;
    state.server = s; store.set(K.server, s.id);
    renderServers(); renderHome();
    if (changed && state.phase === 'connected') {
      toast('Switching to ' + label(s) + '…');
      disconnect().then(() => setTimeout(connect, 300));
    } else if (changed) toast('Selected ' + label(s));
    setTimeout(() => go('home'), 260);
  }

  $('srv-list').addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.stopPropagation();
      const id = fav.dataset.fav;
      favs = favs.includes(id) ? favs.filter((x) => x !== id) : favs.concat(id);
      store.set(K.favs, favs); renderServers(); return;
    }
    const row = e.target.closest('.srv-row');
    if (row) chooseServer(row.dataset.id);
  });
  $('srv-list').addEventListener('keydown', (e) => {
    const row = e.target.closest('.srv-row');
    if (row && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-fav]')) { e.preventDefault(); chooseServer(row.dataset.id); }
  });
  $('srv-search').addEventListener('input', (e) => { state.query = e.target.value; renderServers(); });
  $('srv-sort').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.sort = b.dataset.sort;
    $('srv-sort').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    renderServers();
  });
  $('srv-ping').addEventListener('click', async () => {
    const btn = $('srv-ping'); btn.disabled = true; btn.style.opacity = .6;
    const res = await B.ping(SERVERS.filter((s) => !s.smart));
    SERVERS.filter((s) => !s.smart).forEach((s, i) => { if (res[i] != null) s.latency = res[i]; });
    btn.disabled = false; btn.style.opacity = '';
    renderServers(); renderHome(); toast('Latency refreshed');
  });

  // ---------- STATS ----------
  function renderLiveChart() {
    const on = state.phase === 'connected';
    const toUnit = (v) => settings.units === 'MB/s' ? v / 1048576 : v * 8 / 1e6;
    window.MVCharts.line($('chart-live'), [
      { data: on ? state.ulHist.map(toUnit) : [], color: '255,224,224', glow: 4, width: 1.4 },
      { data: on ? state.dlHist.map(toUnit) : [], color: '255,69,0' },
    ], { grid: true, points: 60, fmt: (v) => v.toFixed(v < 10 ? 1 : 0) + (settings.units === 'MB/s' ? '' : '') });
  }

  function renderStats() {
    const all = history.concat(state.phase === 'connected'
      ? [{ start: state.since, end: Date.now(), down: state.traffic.down, up: state.traffic.up }] : []);
    const sum = (k) => all.reduce((a, s) => a + (s[k] || 0), 0);
    $('k-down').textContent = fmtBytes(sum('down'));
    $('k-up').textContent = fmtBytes(sum('up'));
    $('k-sessions').textContent = history.length;
    $('k-time').textContent = human(all.reduce((a, s) => a + (s.end - s.start), 0));

    // last 7 days
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push({ t: d.getTime(), label: d.toLocaleDateString('en-US', { weekday: 'short' }), a: 0, b: 0, today: i === 0 });
    }
    all.forEach((s) => {
      const d = new Date(s.start); d.setHours(0, 0, 0, 0);
      const slot = days.find((x) => x.t === d.getTime());
      if (slot) { slot.a += s.down || 0; slot.b += s.up || 0; }
    });
    $('week-total').textContent = fmtBytes(days.reduce((a, d) => a + d.a + d.b, 0)) + ' total';
    window.MVCharts.bars($('chart-week'), days, (v) => {
      if (v >= 1024 ** 3) return (v / 1024 ** 3).toFixed(1) + 'G';
      if (v >= 1024 ** 2) return Math.round(v / 1024 ** 2) + 'M';
      return Math.round(v / 1024) + 'K';
    });
    renderLiveChart();

    $('hist').innerHTML = history.length ? history.slice(0, 50).map((h) => {
      const s = SERVERS.find((x) => x.id === h.server) || { cc: 'un', country: h.server, city: '' };
      const d = new Date(h.start);
      return `<div class="hist-row"><img class="flag" src="${FLAG(s.cc)}" alt="">
        <b>${esc(s.country)}${s.city ? ' · ' + esc(s.city) : ''}</b>
        <span>${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        <span>${clock(h.end - h.start)}</span><span>↓ ${fmtBytes(h.down)}</span><span>↑ ${fmtBytes(h.up)}</span></div>`;
    }).join('') : '<div class="hist-empty">No sessions yet. Connect once and your history will appear here.</div>';
  }
  $('hist-clear').addEventListener('click', () => {
    if (!history.length) return;
    if (!window.confirm('Delete all connection history on this device?')) return;
    history = []; store.set(K.history, history); renderStats(); toast('History cleared');
  });
  setInterval(() => { if ($('screen-stats').classList.contains('active') && state.phase === 'connected') renderStats(); }, 5000);

  // ---------- SETTINGS ----------
  function applySettings() {
    document.body.dataset.glow = settings.glow;
    document.body.dataset.motion = settings.motion;
    document.body.dataset.grain = settings.grain ? 'on' : 'off';
    window.MVFx.setParticles(settings.particles && settings.motion !== 'off');
    document.querySelectorAll('[data-set]').forEach((i) => { i.checked = !!settings[i.dataset.set]; });
    document.querySelectorAll('[data-seg]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.val === settings[seg.dataset.seg]));
    });
  }
  function saveSettings() { store.set(K.settings, settings); applySettings(); renderHome(); }
  document.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', () => {
    settings[i.dataset.set] = i.checked; saveSettings();
    if (i.dataset.set === 'sounds' && i.checked) tone(true);
  }));
  document.querySelectorAll('[data-seg]').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    settings[seg.dataset.seg] = b.dataset.val; saveSettings();
    if (seg.dataset.seg === 'protocol' && state.phase === 'connected') toast('Protocol will apply on next connection');
  }));
  $('set-reset').addEventListener('click', () => { Object.assign(settings, DEFAULTS); saveSettings(); toast('Defaults restored'); });

  // ---------- window chrome & keyboard ----------
  $('win-min').addEventListener('click', B.win.minimize);
  $('win-max').addEventListener('click', B.win.maximize);
  $('win-close').addEventListener('click', B.win.close);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && /^[1-5]$/.test(e.key)) {
      e.preventDefault(); go(['home', 'servers', 'stats', 'settings', 'about'][+e.key - 1]);
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); go('servers'); setTimeout(() => $('srv-search').focus(), 300); }
  });
  window.addEventListener('resize', () => { renderLive(); if ($('screen-stats').classList.contains('active')) renderStats(); });

  // ---------- boot ----------
  const chip = $('mode-chip');
  if (B.mode === 'native') { chip.textContent = 'ENGINE READY'; chip.classList.add('native'); $('about-engine').textContent = 'Xray-core (native)'; }
  else chip.title = 'Browser preview: connections are simulated, no traffic is tunnelled.';

  applySettings();
  renderHome();
  renderServers();
  B.publicIp().then((ip) => { state.realIp = ip; renderHome(); });
  if (settings.autoConnect) setTimeout(connect, 900);

  // test hook for automated previews: ?state=connected|connecting  &screen=servers
  const qs = new URLSearchParams(location.search);
  const T = window.MV_TEST || {};
  const wantScreen = qs.get('screen') || T.screen, wantState = qs.get('state') || T.state;
  if (wantScreen) go(wantScreen);
  if (wantState === 'connecting') { state.resolved = pickSmart(); setPhase('connecting'); }
  if (wantState === 'connected') connect();
})();

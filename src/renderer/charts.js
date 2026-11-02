/* MAHYAR VPN — tiny dependency-free canvas charts tuned to the neon palette. */
'use strict';

(function () {
  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function path(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) return ctx.moveTo(p[0], p[1]);
      const prev = pts[i - 1], mx = (prev[0] + p[0]) / 2;
      ctx.bezierCurveTo(mx, prev[1], mx, p[1], p[0], p[1]);
    });
  }

  /** Area sparkline. series: [{data:[], color:'r,g,b', fill:true}] */
  function line(canvas, series, opts) {
    opts = opts || {};
    if (!canvas || !canvas.offsetParent) return;
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = opts.grid ? { l: 44, r: 8, t: 10, b: 20 } : { l: 0, r: 0, t: 3, b: 2 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    let max = opts.max || 0;
    series.forEach((s) => s.data.forEach((v) => { if (v > max) max = v; }));
    max = max <= 0 ? 1 : max * 1.15;

    if (opts.grid) {
      ctx.font = '10px Manrope, sans-serif'; ctx.fillStyle = '#6a6a6a'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + ih - (ih * i) / 4;
        ctx.strokeStyle = 'rgba(255,224,224,0.05)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l, y + .5); ctx.lineTo(w - pad.r, y + .5); ctx.stroke();
        ctx.fillText(opts.fmt ? opts.fmt((max * i) / 4) : Math.round((max * i) / 4), pad.l - 8, y);
      }
    }

    series.forEach((s) => {
      const n = Math.max(2, opts.points || s.data.length);
      const data = s.data.slice(-n);
      const off = n - data.length;
      const pts = data.map((v, i) => [pad.l + ((i + off) / (n - 1)) * iw, pad.t + ih - (v / max) * ih]);
      if (pts.length < 2) return;
      if (s.fill !== false) {
        path(ctx, pts);
        ctx.lineTo(pts[pts.length - 1][0], pad.t + ih); ctx.lineTo(pts[0][0], pad.t + ih); ctx.closePath();
        const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
        g.addColorStop(0, `rgba(${s.color},0.32)`); g.addColorStop(1, `rgba(${s.color},0)`);
        ctx.fillStyle = g; ctx.fill();
      }
      path(ctx, pts);
      ctx.strokeStyle = `rgba(${s.color},1)`; ctx.lineWidth = s.width || 1.8;
      ctx.shadowColor = `rgba(${s.color},0.8)`; ctx.shadowBlur = s.glow == null ? 8 : s.glow;
      ctx.stroke(); ctx.shadowBlur = 0;
      const last = pts[pts.length - 1];
      ctx.fillStyle = `rgba(${s.color},1)`; ctx.beginPath(); ctx.arc(last[0], last[1], 2.4, 0, Math.PI * 2); ctx.fill();
    });
  }

  /** Stacked bars. bars: [{label, a, b}] (a = download, b = upload) */
  function bars(canvas, items, fmt) {
    if (!canvas || !canvas.offsetParent) return;
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 44, r: 8, t: 10, b: 22 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    let max = 0; items.forEach((d) => { max = Math.max(max, d.a + d.b); });
    max = max <= 0 ? 1 : max * 1.15;
    ctx.font = '10px Manrope, sans-serif'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih - (ih * i) / 4;
      ctx.strokeStyle = 'rgba(255,224,224,0.05)';
      ctx.beginPath(); ctx.moveTo(pad.l, y + .5); ctx.lineTo(w - pad.r, y + .5); ctx.stroke();
      ctx.fillStyle = '#6a6a6a'; ctx.textAlign = 'right'; ctx.fillText(fmt((max * i) / 4), pad.l - 8, y);
    }
    const slot = iw / items.length, bw = Math.min(28, slot * .5);
    items.forEach((d, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const ha = (d.a / max) * ih, hb = (d.b / max) * ih;
      const ya = pad.t + ih - ha;
      const g = ctx.createLinearGradient(0, ya, 0, pad.t + ih);
      g.addColorStop(0, '#FF6A2B'); g.addColorStop(1, '#C81E00');
      ctx.fillStyle = g; ctx.shadowColor = 'rgba(255,69,0,.6)'; ctx.shadowBlur = d.today ? 14 : 6;
      round(ctx, x, ya, bw, Math.max(ha, 0), 4); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,224,224,.55)';
      round(ctx, x, ya - hb - (hb > 0 ? 2 : 0), bw, hb, 3); ctx.fill();
      ctx.fillStyle = d.today ? '#FFE0E0' : '#6a6a6a'; ctx.textAlign = 'center';
      ctx.fillText(d.label, x + bw / 2, h - 9);
    });
  }

  function round(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    if (h <= 0) return;
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h); ctx.closePath();
  }

  window.MVCharts = { line, bars };
})();

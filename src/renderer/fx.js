/* MAHYAR VPN — atmospheric effects: drifting embers + occasional brand light flashes. */
'use strict';

(function () {
  const canvas = document.getElementById('embers');
  const ctx = canvas.getContext('2d');
  let parts = [], w = 0, h = 0, running = true, raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(60, (w * h) / 26000));
    parts = Array.from({ length: count }, () => spawn(true));
  }
  function spawn(anywhere) {
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: .5 + Math.random() * 1.6,
      vy: .12 + Math.random() * .38,
      vx: (Math.random() - .5) * .15,
      a: .15 + Math.random() * .55,
      ph: Math.random() * Math.PI * 2,
    };
  }
  function tick() {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.y -= p.vy; p.ph += .02; p.x += p.vx + Math.sin(p.ph) * .15;
      if (p.y < -10) Object.assign(p, spawn(false));
      const fade = Math.min(1, p.y / (h * .5));
      const alpha = p.a * fade * (.7 + Math.sin(p.ph * 2) * .3);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, ${70 + Math.round(p.r * 20)}, 20, ${alpha})`;
      ctx.shadowColor = 'rgba(255,60,0,.9)'; ctx.shadowBlur = 6;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (running) raf = requestAnimationFrame(tick);
  }

  window.MVFx = {
    setParticles(on) {
      running = !!on;
      cancelAnimationFrame(raf);
      if (running) { canvas.style.display = ''; raf = requestAnimationFrame(tick); }
      else { canvas.style.display = 'none'; ctx.clearRect(0, 0, w, h); }
    },
  };

  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(tick);

  // occasional controlled electric flash on the brand (every 12-24s)
  const brand = document.getElementById('brand');
  function scheduleFlash() {
    setTimeout(() => {
      if (document.body.dataset.motion === 'full' && !document.hidden) {
        brand.classList.add('flash');
        setTimeout(() => brand.classList.remove('flash'), 90);
        setTimeout(() => { brand.classList.add('flash'); setTimeout(() => brand.classList.remove('flash'), 60); }, 180);
      }
      scheduleFlash();
    }, 12000 + Math.random() * 12000);
  }
  scheduleFlash();
})();

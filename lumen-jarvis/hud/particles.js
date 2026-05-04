/**
 * Lightweight “data ion” particle field — constellation links + drift.
 * Pauses when document.hidden or prefers-reduced-motion.
 */
(function () {
  const canvas = document.getElementById("particle-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let raf = 0;
  let particles = [];
  let w = 0;
  let h = 0;
  function densityParams() {
    const desktop = document.body.classList.contains("ui-mode-desktop");
    return {
      count: desktop ? 38 : 72,
      linkDist: desktop ? 78 : 110,
    };
  }

  let LINK_DIST = 110;
  let LINK_DIST_SQ = LINK_DIST * LINK_DIST;

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resize() {
    w = canvas.width = window.innerWidth * devicePixelRatio;
    h = canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function spawn() {
    const { count, linkDist } = densityParams();
    LINK_DIST = linkDist;
    LINK_DIST_SQ = LINK_DIST * LINK_DIST;
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 0.4,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  function step() {
    if (document.hidden || reducedMotion()) {
      raf = requestAnimationFrame(step);
      return;
    }

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    ctx.clearRect(0, 0, cw, ch);

    const desktop = document.body.classList.contains("ui-mode-desktop");
    ctx.globalAlpha = desktop ? 0.45 : 0.85;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.02;
      if (p.x < -20) p.x = cw + 20;
      if (p.x > cw + 20) p.x = -20;
      if (p.y < -20) p.y = ch + 20;
      if (p.y > ch + 20) p.y = -20;
    }

    // Links
    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST_SQ) {
          const alpha = (1 - d2 / LINK_DIST_SQ) * 0.35;
          ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Dots
    for (const p of particles) {
      const glow = 0.35 + Math.sin(p.pulse) * 0.2;
      ctx.fillStyle = `rgba(180, 250, 255, ${glow})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(step);
  }

  function start() {
    cancelAnimationFrame(raf);
    resize();
    spawn();
    if (!reducedMotion()) raf = requestAnimationFrame(step);
  }

  window.addEventListener("resize", () => {
    resize();
    spawn();
  });

  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", start);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !reducedMotion()) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    }
  });

  window.addEventListener("jarvis-layout", () => {
    resize();
    spawn();
  });

  start();
})();

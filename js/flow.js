/* ===========================================================================
 * flow.js — the home page's living background ("flow field"), a direct port
 * of src/app/shared/components/flow-field.ts to plain Canvas 2D.
 *
 * Brand-blue / cyan glow blobs drifting like fluid, twinkling particles, slow
 * ribbon waves, periodic brand-gradient blooms and a rare Tunisian-red spark.
 * Light mode paints the same choreography as a pastel whisper; all motion
 * scales to zero under prefers-reduced-motion (a single static frame is
 * painted). Called once by main.js when the home page is present.
 * =========================================================================== */

const BLUE = [100, 120, 255];
const CYAN = [34, 211, 238];
const VIOLET = [96, 70, 230];
const RED = [231, 0, 19];
const BLOOM_PERIOD = 7000;
const BLOOM_LIFE = 2600;

export function initFlowField() {
  const host = document.querySelector('app-flow-field');
  if (!host) return;
  const canvas = host.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let raf = 0;
  let intervalId = null;
  let framesDrawn = 0;
  let lastT = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let disposed = false;

  let blobs = [];
  let particles = [];
  let ribbons = [];
  let blooms = [];
  let lastBloom = 0;

  const motionScale = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  let dark = true;
  let resizeObserver = null;
  let themeObserver = null;
  let onVisibility = null;

  function readTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') dark = attr === 'dark';
    else dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function resize() {
    const box = host.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Populate the scene, denser on big screens. */
  function seed(staticScene) {
    const area = (width * height) / (1440 * 900);
    const blobCount = Math.max(5, Math.round(8 * Math.min(area, 1.5)));
    const particleCount = Math.max(26, Math.round(52 * Math.min(area, 1.5)));

    const blobColors = [BLUE, BLUE, CYAN, CYAN, VIOLET, BLUE, RED];
    blobs = Array.from({ length: blobCount }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 90 + Math.random() * 140,
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.5) * 16,
      color: blobColors[i % blobColors.length],
      alpha: i === blobColors.length - 1 ? 0.3 : 0.16 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
      wander: 0.2 + Math.random() * 0.3,
    }));

    particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.8 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 26,
      vy: (Math.random() - 0.5) * 18,
      color: Math.random() < 0.75 ? BLUE : CYAN,
      baseAlpha: 0.25 + Math.random() * 0.5,
      freq: 0.4 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
    }));

    ribbons = [
      { yBase: 0.28, amp: 26, wavelength: 520, speed: 0.12, phase: 0, color: BLUE, alpha: 0.1 },
      { yBase: 0.55, amp: 34, wavelength: 680, speed: 0.09, phase: 2.1, color: CYAN, alpha: 0.08 },
      { yBase: 0.78, amp: 22, wavelength: 440, speed: 0.15, phase: 4.4, color: VIOLET, alpha: 0.07 },
    ];

    if (staticScene) {
      blooms = [
        { x: width * 0.3, y: height * 0.35, startedAt: 0, color: BLUE },
        { x: width * 0.72, y: height * 0.62, startedAt: -900, color: CYAN },
      ];
    }
  }

  function wrap(item, margin) {
    if (item.x < -margin) item.x = width + margin;
    if (item.x > width + margin) item.x = -margin;
    if (item.y < -margin) item.y = height + margin;
    if (item.y > height + margin) item.y = -margin;
  }

  function step(dt, t) {
    const s = motionScale;
    for (const b of blobs) {
      b.phase += dt * b.wander * s;
      b.x += (b.vx + Math.cos(b.phase) * 12) * dt * s;
      b.y += (b.vy + Math.sin(b.phase * 1.3) * 10) * dt * s;
      wrap(b, b.r);
    }
    for (const p of particles) {
      p.x += p.vx * dt * s;
      p.y += (p.vy + Math.sin((t / 900) + p.phase) * 4) * dt * s;
      wrap(p, 4);
    }
    for (const rb of ribbons) rb.phase += dt * rb.speed * s;

    blooms = blooms.filter((bl) => t - bl.startedAt < BLOOM_LIFE);
    if (t - lastBloom > BLOOM_PERIOD && blobs.length) {
      lastBloom = t;
      const hostBlob = blobs[Math.floor(Math.random() * blobs.length)];
      const color = Math.random() < 0.12 ? RED : Math.random() < 0.5 ? BLUE : CYAN;
      blooms.push({ x: hostBlob.x, y: hostBlob.y, startedAt: t, color });
    }
  }

  function drawFrame(t) {
    framesDrawn++;
    ctx.clearRect(0, 0, width, height);

    // Compositing: additive glow on the dark scene, plain translucency on light.
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

    // Glow blobs.
    for (const b of blobs) {
      const [r, g, bl] = b.color;
      const alpha = dark ? b.alpha : b.alpha * 0.35;
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')');
      grad.addColorStop(0.55, 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha * 0.45 + ')');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + bl + ',0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ribbon waves.
    for (const rb of ribbons) {
      const [r, g, bl] = rb.color;
      const y0 = rb.yBase * height;
      ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + (dark ? rb.alpha : rb.alpha * 0.8) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const stepX = Math.max(24, width / 40);
      for (let x = -stepX; x <= width + stepX; x += stepX) {
        const y =
          y0 +
          Math.sin((x + rb.phase * 900) / (rb.wavelength / (Math.PI * 2))) * rb.amp +
          Math.sin((x + rb.phase * 500) / (rb.wavelength / (Math.PI * 4))) * rb.amp * 0.4;
        if (x <= 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Twinkling particles.
    for (const p of particles) {
      const [r, g, bl] = p.color;
      const tw = 0.55 + 0.45 * Math.sin((t / 1000) * p.freq * Math.PI * 2 + p.phase);
      const alpha = p.baseAlpha * tw * (dark ? 1 : 0.5);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blooms: expanding flashes riding an existing blob's position.
    for (const bl of blooms) {
      const age = (t - bl.startedAt) / BLOOM_LIFE;
      if (age < 0 || age > 1) continue;
      const eased = 1 - Math.pow(1 - age, 2);
      const radius = 40 + eased * Math.min(width, height) * 0.55;
      const alpha = (1 - age) * (dark ? 0.22 : 0.1);
      const [r, g, b2] = bl.color;
      const grad = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, radius);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b2 + ',' + alpha + ')');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b2 + ',0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function loop(t) {
    if (disposed) return;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    step(dt, t);
    drawFrame(t);
    raf = requestAnimationFrame(loop);
  }

  /** Suspended webviews never fire rAF — fall back to a timer loop. */
  function startIntervalFallback() {
    if (intervalId !== null || disposed) return;
    intervalId = setInterval(() => {
      if (disposed) return;
      const t = performance.now();
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;
      step(dt, t);
      drawFrame(t);
    }, 33);
  }

  readTheme();
  resize();
  const reduced = motionScale === 0;
  seed(reduced);

  if (reduced) {
    drawFrame(0); // one static, representative frame
  } else {
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
    setTimeout(() => {
      if (!disposed && framesDrawn === 0) startIntervalFallback();
    }, 1200);
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      resize();
      if (motionScale === 0) drawFrame(0);
    });
    resizeObserver.observe(host);
  }

  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => readTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
  }

  onVisibility = () => {
    if (!document.hidden && motionScale === 1) lastT = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);
}

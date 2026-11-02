/* ===========================================================================
 * hero3d.js — "The Flow Engine", the full-hero WebGL scene: a direct port of
 * src/app/shared/components/fluid-visual/fluid-visual.ts to plain JS.
 *
 * A turbulent, chaotic particle storm on the left gets pulled through a
 * pulsing gradient gate into calm laminar streams that converge into a
 * rotating crystalline core on the right.
 *
 * Loaded on demand by main.js once the hero nears the viewport; on success
 * the CSS fallback orbs are removed (onStarted).
 * =========================================================================== */
import * as THREE from './vendor/three.module.js';

export function initHero3d(stage, options) {
  const opts = options || {};
  const density = opts.density || 'high';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    return; // caller keeps the CSS fallback orbs
  }

  const width0 = stage.clientWidth || 1;
  const height0 = stage.clientHeight || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width0, height0);
  stage.appendChild(renderer.domElement);
  if (typeof opts.onStarted === 'function') opts.onStarted();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width0 / height0, 0.1, 100);
  camera.position.set(-1.5, 0, 14);
  camera.lookAt(0, 0, 0);

  // --- Scene scale ---------------------------------------------------------
  const isLow = density === 'low';
  const chaosCount = isLow ? 420 : 900;
  const streamCount = isLow ? 4 : 6;
  const perStream = isLow ? 70 : 120;
  const ribbonCount = isLow ? 0 : 4;
  const shardCount = isLow ? 14 : 24;
  const sparkCount = isLow ? 26 : 60;

  const accent = new THREE.Color('#667eea');
  const teal = new THREE.Color('#00c9a7');
  const pink = new THREE.Color('#e879f9');

  const disposables = [];

  // Soft radial glow texture, generated once and shared by halo + sparks.
  const makeGlowTexture = () => {
    const size = 128;
    const cnv = document.createElement('canvas');
    cnv.width = size;
    cnv.height = size;
    const c = cnv.getContext('2d');
    const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.28)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cnv);
  };

  // ---------------------------------------------------------------------------
  // 1. Chaos field — turbulence-driven particle storm on the left
  // ---------------------------------------------------------------------------
  const chaosPositions = new Float32Array(chaosCount * 3);
  const chaosSeeds = new Float32Array(chaosCount * 4); // x, y, z, phase
  const chaosColors = new Float32Array(chaosCount * 3);
  for (let i = 0; i < chaosCount; i++) {
    const sx = -11 - Math.random() * 4.5;
    const sy = (Math.random() - 0.5) * 11;
    const sz = (Math.random() - 0.5) * 7;
    const ph = Math.random() * Math.PI * 2;
    chaosSeeds[i * 4] = sx;
    chaosSeeds[i * 4 + 1] = sy;
    chaosSeeds[i * 4 + 2] = sz;
    chaosSeeds[i * 4 + 3] = ph;

    // Static tint: hot pink near the gate, cold indigo deep in the storm.
    const heat = Math.min(Math.abs(sx + 4) / 6, 1);
    chaosColors[i * 3] = pink.r + (accent.r - pink.r) * heat;
    chaosColors[i * 3 + 1] = pink.g + (accent.g - pink.g) * heat;
    chaosColors[i * 3 + 2] = pink.b + (accent.b - pink.b) * heat;
  }
  const chaosGeometry = new THREE.BufferGeometry();
  chaosGeometry.setAttribute('position', new THREE.BufferAttribute(chaosPositions, 3));
  chaosGeometry.setAttribute('color', new THREE.BufferAttribute(chaosColors, 3));
  const chaosMaterial = new THREE.PointsMaterial({
    size: isLow ? 0.06 : 0.075,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(chaosGeometry, chaosMaterial));
  disposables.push(chaosGeometry, chaosMaterial);

  // ---------------------------------------------------------------------------
  // 2. The Gate — pulsing gradient ring at x = -4
  // ---------------------------------------------------------------------------
  const gateGroup = new THREE.Group();
  gateGroup.position.x = -4;
  gateGroup.rotation.y = Math.PI / 2;
  scene.add(gateGroup);

  const gateRings = [];
  const gateRadii = [3.1, 2.7, 2.3];
  for (let i = 0; i < gateRadii.length; i++) {
    const geometry = new THREE.TorusGeometry(gateRadii[i], 0.016 + 0.006 * i, 8, 96);
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? accent : teal,
      transparent: true,
      opacity: 0.55 - i * 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    gateGroup.add(ring);
    gateRings.push(ring);
    disposables.push(geometry, material);
  }

  const gateGlowGeometry = new THREE.RingGeometry(2.0, 3.3, 48);
  const gateGlowMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const gateGlow = new THREE.Mesh(gateGlowGeometry, gateGlowMaterial);
  gateGroup.add(gateGlow);
  disposables.push(gateGlowGeometry, gateGlowMaterial);

  // ---------------------------------------------------------------------------
  // 3. Laminar streams — calm ribbons of particles converging toward the core
  // ---------------------------------------------------------------------------
  const streamAttributes = [];
  const streamSeeds = [];
  for (let s = 0; s < streamCount; s++) {
    const positions = new Float32Array(perStream * 3);
    const offsets = new Float32Array(perStream);
    for (let i = 0; i < perStream; i++) offsets[i] = i / perStream;

    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', attribute);

    const mix = s / Math.max(streamCount - 1, 1);
    const material = new THREE.PointsMaterial({
      size: isLow ? 0.05 : 0.065,
      color: accent.clone().lerp(teal, mix),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    scene.add(new THREE.Points(geometry, material));
    streamAttributes.push(attribute);
    streamSeeds.push({
      offsets,
      yOff: (Math.random() - 0.5) * 4.5,
      zOff: (Math.random() - 0.5) * 2.5,
      phase: (s / streamCount) * Math.PI * 2,
      speed: 0.055 + Math.random() * 0.05,
    });
    disposables.push(geometry, material);
  }

  // ---------------------------------------------------------------------------
  // 4. The Core — rotating crystalline structure on the right
  // ---------------------------------------------------------------------------
  const coreGroup = new THREE.Group();
  coreGroup.position.set(6.2, 0, 0);
  scene.add(coreGroup);

  const coreKernelGeometry = new THREE.IcosahedronGeometry(1.05, 0);
  const coreKernelMaterial = new THREE.MeshBasicMaterial({
    color: teal,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreKernel = new THREE.Mesh(coreKernelGeometry, coreKernelMaterial);
  coreGroup.add(coreKernel);
  disposables.push(coreKernelGeometry, coreKernelMaterial);

  const coreShellGeometry = new THREE.IcosahedronGeometry(1.9, isLow ? 0 : 1);
  const coreShellMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.32,
    wireframe: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreShell = new THREE.Mesh(coreShellGeometry, coreShellMaterial);
  coreGroup.add(coreShell);
  disposables.push(coreShellGeometry, coreShellMaterial);

  const haloTexture = makeGlowTexture();
  const coreHaloMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    color: teal,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreHalo = new THREE.Sprite(coreHaloMaterial);
  coreHalo.scale.set(8, 8, 1);
  coreGroup.add(coreHalo);
  disposables.push(haloTexture, coreHaloMaterial);

  // ---------------------------------------------------------------------------
  // 5. Glass shards orbiting the core
  // ---------------------------------------------------------------------------
  const shards = [];
  const blue = new THREE.Color('#8b9bf1');
  for (let i = 0; i < shardCount; i++) {
    const size = 0.12 + Math.random() * 0.2;
    const geometry = new THREE.TetrahedronGeometry(size);
    const material = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? teal : i % 3 === 1 ? accent : blue,
      transparent: true,
      opacity: 0.5 + Math.random() * 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    coreGroup.add(mesh);
    shards.push({
      mesh,
      radius: 2.4 + Math.random() * 2.4,
      speed: 0.15 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 1.6,
      spin: 0.4 + Math.random() * 0.8,
    });
    disposables.push(geometry, material);
  }

  // ---------------------------------------------------------------------------
  // 6. Ribbon lines threading from gate toward core
  // ---------------------------------------------------------------------------
  const ribbonLines = [];
  const ribbonSeeds = [];
  for (let r = 0; r < ribbonCount; r++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const material = new THREE.LineBasicMaterial({
      color: r % 2 === 0 ? 0x7c8cf0 : 0x2ed3b7,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    ribbonLines.push(line);
    ribbonSeeds.push({
      yAmp: 0.8 + Math.random() * 2.2,
      zAmp: 0.6 + Math.random() * 1.4,
      phase: (r / ribbonCount) * Math.PI * 2,
      freq: 2 + Math.random() * 2,
    });
    disposables.push(geometry, material);
  }

  // ---------------------------------------------------------------------------
  // 7. Spark sprites that ignite at the gate and ride the streams
  // ---------------------------------------------------------------------------
  const sparkTexture = makeGlowTexture();
  disposables.push(sparkTexture);
  const sparks = [];
  for (let i = 0; i < sparkCount; i++) {
    const material = new THREE.SpriteMaterial({
      map: sparkTexture,
      color: i % 2 === 0 ? 0x8b9bf1 : 0x2ed3b7,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const scale = 0.25 + Math.random() * 0.35;
    sprite.scale.set(scale, scale, 1);
    scene.add(sprite);
    sparks.push({ sprite, offset: Math.random(), lane: Math.random(), speed: 0.08 + Math.random() * 0.1 });
    disposables.push(material);
  }

  // --- Pointer parallax ------------------------------------------------------
  let pointerX = 0;
  let pointerY = 0;
  const onPointerMove = (event) => {
    const rect = stage.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // --- Pause when off-screen -------------------------------------------------
  let visible = true;
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    },
    { threshold: 0 },
  );
  visibilityObserver.observe(stage);

  // --- Resize ----------------------------------------------------------------
  const onResize = () => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // --- Render loop -----------------------------------------------------------
  let rafId = 0;
  let running = true;
  const clock = new THREE.Clock();

  const tick = () => {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    if (!visible) return;

    const time = clock.getElapsedTime();

    // 1. Chaos storm: turbulent jitter around each seed position.
    const cAttr = chaosGeometry.getAttribute('position');
    const cArr = cAttr.array;
    for (let i = 0; i < chaosCount; i++) {
      const i4 = i * 4;
      const i3 = i * 3;
      const ph = chaosSeeds[i4 + 3];
      cArr[i3] = chaosSeeds[i4] + Math.sin(time * (0.6 + (ph % 1)) + ph * 3.1) * 0.9;
      cArr[i3 + 1] = chaosSeeds[i4 + 1] + Math.cos(time * (0.5 + (ph % 0.7)) + ph * 2.3) * 0.9;
      cArr[i3 + 2] = chaosSeeds[i4 + 2] + Math.sin(time * 0.8 + ph * 4.7) * 0.6;
    }
    cAttr.needsUpdate = true;

    // 2. Gate: rings pulse and rotate at slightly different rates.
    for (let i = 0; i < gateRings.length; i++) {
      gateRings[i].rotation.z = time * (0.1 + i * 0.06) * (i % 2 === 0 ? 1 : -1);
      gateRings[i].material.opacity = (0.55 - i * 0.12) * (0.75 + 0.25 * Math.sin(time * 1.2 + i * 2.1));
    }
    gateGlow.rotation.z = time * 0.05;
    gateGlow.material.opacity = 0.05 + 0.025 * Math.sin(time * 0.9);

    // 3. Laminar streams: particles glide from gate to core on smooth curves.
    for (let s = 0; s < streamAttributes.length; s++) {
      const seedData = streamSeeds[s];
      const array = streamAttributes[s].array;
      for (let i = 0; i < seedData.offsets.length; i++) {
        const u = (seedData.offsets[i] + time * seedData.speed) % 1;
        const i3 = i * 3;
        array[i3] = -4 + u * 10.2; // gate x=-4 → core x=6.2
        array[i3 + 1] =
          seedData.yOff * (1 - u) +
          Math.sin(u * Math.PI * 2 + time * 0.7 + seedData.phase) * 0.5 * (1 - u) +
          Math.sin(u * Math.PI) * 0.3;
        array[i3 + 2] =
          seedData.zOff * (1 - u) +
          Math.cos(u * Math.PI * 1.5 + time * 0.5 + seedData.phase) * 0.4 * (1 - u);
      }
      streamAttributes[s].needsUpdate = true;
    }

    // 4. Core: kernel breathes, shell counter-rotates.
    coreKernel.rotation.y = time * 0.4;
    coreKernel.rotation.x = time * 0.23;
    coreKernel.scale.setScalar(1 + 0.06 * Math.sin(time * 2.1));
    coreShell.rotation.y = -time * 0.15;
    coreShell.rotation.z = time * 0.09;
    coreShell.scale.setScalar(1 + 0.03 * Math.sin(time * 1.3));

    // 5. Shards orbit on tilted ellipses while tumbling.
    for (const shard of shards) {
      const a = time * shard.speed + shard.phase;
      shard.mesh.position.set(
        Math.cos(a) * shard.radius,
        Math.sin(a * 0.9 + shard.tilt) * shard.radius * 0.55,
        Math.sin(a) * shard.radius * 0.4,
      );
      shard.mesh.rotation.x = time * shard.spin;
      shard.mesh.rotation.y = time * shard.spin * 0.7;
    }

    // 6. Ribbon lines flow from gate toward core.
    for (let r = 0; r < ribbonLines.length; r++) {
      const seedData = ribbonSeeds[r];
      const attr = ribbonLines[r].geometry.getAttribute('position');
      const arr = attr.array;
      const count = arr.length / 3;
      for (let i = 0; i < count; i++) {
        const u = i / (count - 1);
        const i3 = i * 3;
        arr[i3] = -4 + u * 10.2;
        arr[i3 + 1] =
          Math.sin(u * Math.PI * seedData.freq + time * 0.35 + seedData.phase) * seedData.yAmp * (1 - u * 0.5) +
          Math.sin(u * Math.PI) * 0.4;
        arr[i3 + 2] =
          Math.cos(u * Math.PI * seedData.freq * 0.5 + time * 0.3 + seedData.phase) * seedData.zAmp * (1 - u * 0.5);
      }
      attr.needsUpdate = true;
    }

    // 7. Sparks ignite at the gate, brighten, then fade into the core.
    for (const spark of sparks) {
      const u = (spark.offset + time * spark.speed) % 1;
      spark.sprite.position.set(
        -4 + u * 10.2,
        Math.sin(u * Math.PI * 2 + spark.lane * Math.PI * 2) * 0.9 * (1 - u),
        Math.cos(u * Math.PI + spark.lane * 5) * 0.8 * (1 - u),
      );
      spark.sprite.material.opacity = Math.sin(u * Math.PI) * 0.9;
    }

    // Camera: gentle breathing drift + pointer parallax.
    camera.position.x += (-1.5 + pointerX * 0.5 + Math.sin(time * 0.05) * 0.4 - camera.position.x) * 0.02;
    camera.position.y += (-pointerY * 0.35 + Math.cos(time * 0.04) * 0.25 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  tick();

  // No teardown needed: the scene lives for the page's lifetime (single-page
  // document), but free GPU resources if the tab goes away long-term.
  window.addEventListener('pagehide', () => {
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    visibilityObserver.disconnect();
    for (const disposable of disposables) disposable.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }, { once: true });
}

// ui/HuntingScreen.js
// Canvas hunting UI (60fps). Accessible & mobile-friendly.
// Controls:
//  - Click / tap to shoot (uses 1 bullet per shot; 200ms cooldown).
//  - Mouse/touch moves reticle. Keyboard: Arrow keys / WASD to move, Space/Enter to shoot.
// Ends when timer hits 0 or bullets run out; shows summary and updates game state.

import { createHuntSession, getAnimals } from '../systems/hunting.js';
import { getImage, getMeta } from '../systems/assets.js';

export async function mountHuntingScreen(root, { game, onExit }) {
  const animals = await getAnimals();

  // Layout
  const wrap = document.createElement('section');
  wrap.className = 'card hunt-wrap';
  wrap.setAttribute('aria-labelledby', 'hunt-title');
  wrap.innerHTML = `
    <h2 id="hunt-title" style="margin-bottom:0.25rem">Hunting</h2>
    <p class="muted" style="margin-top:0">
      30 seconds. Click/tap/Space to shoot. Arrow keys/WASD move the reticle.
      Carry cap: 100 lb/day. Bullets are precious.
    </p>

    <div class="hunt-hud" aria-live="polite">
      <div><strong>Time:</strong> <span id="hud-time">30.0</span>s</div>
      <div><strong>Bullets:</strong> <span id="hud-bullets">0</span></div>
      <div><strong>Meat:</strong> <span id="hud-meat">0</span> lb</div>
      <div><button class="btn btn-outline" id="btn-end">End Hunt</button></div>
    </div>

    <div class="hunt-canvas-wrap">
      <canvas id="hunt-canvas" width="640" height="360" role="img" aria-label="Hunting field"></canvas>
    </div>

    <div class="muted" style="font-size:0.95em">
      Tip: rabbits are quick but light; bison are heavy but rare; deer are the sweet spot.
    </div>
  `;
  root.appendChild(wrap);

  const canvas = wrap.querySelector('#hunt-canvas');
  const hudTime = wrap.querySelector('#hud-time');
  const hudBullets = wrap.querySelector('#hud-bullets');
  const hudMeat = wrap.querySelector('#hud-meat');
  const btnEnd = wrap.querySelector('#btn-end');

  const ctx = canvas.getContext('2d', { alpha: false });

  // DPR scaling
  let DPR = Math.max(1, Math.min(3, Math.floor(window.devicePixelRatio || 1)));
  function fitCanvas() {
    // Canvas should fit container width while preserving 16:9
    const parent = canvas.parentElement.getBoundingClientRect();
    const cssW = Math.max(320, Math.floor(parent.width));
    const cssH = Math.floor(cssW * 9 / 16);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // Engine
  const { state, update, shoot, end } = await createHuntSession(game, {
    width: canvas.clientWidth || 640,
    height: canvas.clientHeight || 360
  });

  // HUD init
  hudBullets.textContent = String(game.data.inventory.bullets || 0);
  hudMeat.textContent = '0';

  // Input
  const reticleSpeed = 280; // px/s for keyboard moves

  function canvasPos(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(state.W, (ev.clientX - r.left) * (canvas.width / DPR / r.width))),
      y: Math.max(0, Math.min(state.H, (ev.clientY - r.top) * (canvas.height / DPR / r.height)))
    };
  }

  function attemptShoot() {
    const now = performance.now();
    const hit = shoot(game, state.reticle.x, state.reticle.y, now);
    hudBullets.textContent = String(game.data.inventory.bullets || 0);
    if (hit) {
      hudMeat.textContent = String(Math.round(state.meatTotal));
      // flash effect
      flash();
      // polite vibration if available
      try { navigator.vibrate?.(20); } catch {}
    }
  }

  let flashUntil = 0;
  function flash() { flashUntil = performance.now() + 60; }

  // Pointer/touch
  canvas.addEventListener('pointermove', (e) => {
    const p = canvasPos(e);
    state.reticle.x = p.x; state.reticle.y = p.y;
  });
  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasPos(e);
    state.reticle.x = p.x; state.reticle.y = p.y;
    attemptShoot();
  });

  // Keyboard
  const keys = new Set();
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      attemptShoot();
      return;
    }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) {
      keys.add(e.key);
      e.preventDefault();
    }
  }
  function onKeyUp(e) { keys.delete(e.key); }
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);

  btnEnd.addEventListener('click', () => { finish('Ended early.'); });

  // Loop
  let last = performance.now();
  let raf = 0;
  function tick() {
    const now = performance.now();
    let dt = (now - last) / 1000;
    if (dt > 0.1) dt = 0.1;
    last = now;

    // keyboard reticle move
    const vx = (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) ? 1 :
               (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) ? -1 : 0;
    const vy = (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) ? 1 :
               (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) ? -1 : 0;
    if (vx || vy) {
      state.reticle.x = clamp(state.reticle.x + vx * reticleSpeed * dt, 0, state.W);
      state.reticle.y = clamp(state.reticle.y + vy * reticleSpeed * dt, 0, state.H);
    }

    update(game, dt);
    draw();

    // HUD update
    hudTime.textContent = state.timeLeft.toFixed(1);
    hudBullets.textContent = String(game.data.inventory.bullets || 0);
    hudMeat.textContent = String(Math.round(state.meatTotal));

    // End conditions
    if (state.timeLeft <= 0 || Number(game.data.inventory.bullets || 0) <= 0) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function draw() {
    // background
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, canvas.width / DPR, canvas.height / DPR);

    // simple parallax lanes
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 4; i++) {
      const y = (i + 1) * (state.H / 5);
      ctx.fillStyle = i % 2 ? '#2a3a4a' : '#1e2a37';
      ctx.fillRect(0, y, state.W, 4);
    }
    ctx.globalAlpha = 1;

    // draw animals
    for (const m of state.animals) {
      const key = spriteKey(m.species.id);
      const meta = getMeta(key);
      const img = getImage(key);
      if (img && meta) {
        ctx.drawImage(img, Math.round(m.x), Math.round(m.y), m.w, m.h);
      } else {
        // fallback box
        ctx.fillStyle = '#67b7ff';
        ctx.fillRect(Math.round(m.x), Math.round(m.y), m.w, m.h);
      }
    }

    // reticle
    const r = 10;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd54d';
    ctx.beginPath();
    ctx.arc(Math.round(state.reticle.x), Math.round(state.reticle.y), r, 0, Math.PI * 2);
    ctx.moveTo(state.reticle.x - r - 6, state.reticle.y);
    ctx.lineTo(state.reticle.x - r + 2, state.reticle.y);
    ctx.moveTo(state.reticle.x + r - 2, state.reticle.y);
    ctx.lineTo(state.reticle.x + r + 6, state.reticle.y);
    ctx.moveTo(state.reticle.x, state.reticle.y - r - 6);
    ctx.lineTo(state.reticle.x, state.reticle.y - r + 2);
    ctx.moveTo(state.reticle.x, state.reticle.y + r - 2);
    ctx.lineTo(state.reticle.x, state.reticle.y + r + 6);
    ctx.stroke();

    // shot flash
    if (performance.now() < flashUntil) {
      ctx.fillStyle = 'rgba(255,255,200,0.25)';
      ctx.fillRect(0, 0, state.W, state.H);
    }
  }

  function finish(reason) {
    cancelAnimationFrame(raf);
    state.timeLeft = 0;
    const summary = end();
    // Apply carry/ spoilage now
    const before = Number(game.data.inventory.food || 0);
    game.data.inventory.food = Math.max(0, before + summary.meatTaken);
    game.data.flags.lastHuntDay = Number(game.data.day || 1);
    // Log
    const parts = [];
    for (const [id, n] of Object.entries(summary.killsById)) {
      if (n > 0) parts.push(`${n}× ${labelAnimal(id)}`);
    }
    const line =
      `Hunt: ${parts.join(', ') || 'no hits'}. Meat: ${summary.meatTaken} lb (spoiled ${summary.spoiled} lb). Bullets used: ${summary.bulletsUsed}.`;
    game.data.log.push(line);
    game.save();

    // Summary UI
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <h3 style="margin-top:0">Hunt Summary</h3>
      <p class="mono">Brought back <strong>${summary.meatTaken} lb</strong> of food (spoiled ${summary.spoiled} lb).</p>
      <p class="mono">Bullets used: ${summary.bulletsUsed} · ${Object.keys(summary.killsById).map(id => `${summary.killsById[id]||0}× ${labelAnimal(id)}`).join(', ')}</p>
      ${reason ? `<p class="muted">${reason}</p>` : ''}
      <div class="btn-row"><button class="btn" id="btn-return">Return to Trail</button></div>
    `;
    wrap.appendChild(div);
    div.querySelector('#btn-return').addEventListener('click', () => {
      cleanup();
      onExit?.(summary);
    });
  }

  function cleanup() {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('resize', fitCanvas);
    cancelAnimationFrame(raf);
    wrap.remove();
  }

  // Kick off
  queueMicrotask(() => canvas.focus());
  raf = requestAnimationFrame(tick);

  return () => { cleanup(); };
}

function spriteKey(id) {
  switch (id) {
    case 'rabbit': return 'sprites.rabbit';
    case 'deer':   return 'sprites.deer';
    case 'buffalo':return 'sprites.buffalo';
    default:       return 'sprites.deer';
  }
}
function labelAnimal(id) {
  switch (id) {
    case 'rabbit': return 'Rabbit';
    case 'deer':   return 'Deer';
    case 'buffalo':return 'Bison';
    default:       return id;
  }
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

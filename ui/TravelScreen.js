// ui/TravelScreen.js
// Phase 1 stub: demonstrates screen switching and placeholder rendering.

import { getImage, getMeta } from '../systems/assets.js';

export function mountTravelScreen(root, { game, onBackToTitle }) {
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('aria-labelledby', 'travel-heading');
  card.innerHTML = `
    <h2 id="travel-heading">Travel screen (coming soon)</h2>
    <p class="muted">Phase 2 will add the full travel loop. For now, this verifies screen switching, seeded RNG, and placeholders.</p>
    <div class="spacer"></div>
    <div id="scene-wrap" style="display:grid;place-items:center;border:1px dashed var(--border);border-radius:12px;overflow:hidden">
    </div>
    <div class="spacer"></div>
    <div class="btn-row">
      <button class="btn btn-outline" id="btn-back" aria-label="Back to title">Back to Title</button>
      <button class="btn" id="btn-roll" aria-label="Roll RNG">Roll RNG</button>
    </div>
    <p class="muted mono" id="rng-out" style="margin-top:0.5rem"></p>
  `;

  // Scene placeholder image
  const k = 'scene.bg_plains';
  const img = getImage(k);
  const meta = getMeta(k);
  const sceneWrap = card.querySelector('#scene-wrap');

  if (img && meta) {
    const sceneImg = document.createElement('img');
    sceneImg.alt = meta.placeholder ? 'Scenic plains (placeholder)' : 'Scenic plains';
    sceneImg.width = Math.min(meta.w, 960);
    sceneImg.height = Math.round(sceneImg.width * (meta.h / meta.w));
    sceneImg.src = img.src;
    sceneWrap.appendChild(sceneImg);
  } else {
    sceneWrap.textContent = 'Scene placeholder';
  }

  // Wire buttons
  card.querySelector('#btn-back').addEventListener('click', (e) => {
    e.preventDefault();
    onBackToTitle?.();
  });

  const rngOut = card.querySelector('#rng-out');
  card.querySelector('#btn-roll').addEventListener('click', () => {
    const v = game.rngNext();
    rngOut.textContent = `RNG roll → ${v.toFixed(6)} (seed ${game.data.rngSeed}, state ${game.data.rngState})`;
    // Also log to console for verification
    console.log('[RNG]', v, '(seed:', game.data.rngSeed, 'state:', game.data.rngState, ')');
  });

  root.appendChild(card);

  return () => card.remove();
}

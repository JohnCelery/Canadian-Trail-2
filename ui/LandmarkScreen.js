// ui/LandmarkScreen.js
// Shows landmark info and lets the player enter the shop (if available) or continue traveling.

import { servicesFor } from '../systems/landmarks.js';

export function mountLandmarkScreen(root, { game, landmark, onOpenShop, onContinue }) {
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('aria-labelledby', 'lm-title');

  const services = servicesFor(landmark);
  const canShop = services.has('shop');

  card.innerHTML = `
    <h2 id="lm-title" style="margin-bottom:0.25rem">${escapeHTML(landmark.name)}</h2>
    <p class="muted" style="margin-top:0">${escapeHTML(landmark.notes || '')}</p>

    <div class="chips" style="margin: 0.75rem 0 1rem">
      ${[...services].map(s => `<span class="chip">${escapeHTML(cap(s))}</span>`).join('')}
    </div>

    <div class="btn-row">
      ${canShop ? `<button class="btn" id="btn-shop" aria-label="Visit shop at ${escapeHTML(landmark.name)}">Visit Shop</button>` : ''}
      <button class="btn btn-outline" id="btn-continue" aria-label="Continue traveling">Continue on Trail</button>
    </div>

    <p class="muted mono" style="margin-top:0.75rem">Mile ${Number(landmark.mile || 0).toFixed(0)} · Money: $${Number(game.data.money || 0).toFixed(2)}</p>
  `;

  if (canShop) {
    card.querySelector('#btn-shop').addEventListener('click', (e) => {
      e.preventDefault();
      onOpenShop?.(landmark);
    });
  }
  card.querySelector('#btn-continue').addEventListener('click', (e) => {
    e.preventDefault();
    // Clear "currently at" flag and return to travel
    if (game.data.flags) {
      delete game.data.flags.atLandmarkId;
      game.save();
    }
    onContinue?.();
  });

  root.appendChild(card);
  queueMicrotask(() => card.querySelector(canShop ? '#btn-shop' : '#btn-continue')?.focus());

  return () => card.remove();
}

function cap(s) { return String(s).slice(0,1).toUpperCase() + String(s).slice(1); }
function escapeHTML(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

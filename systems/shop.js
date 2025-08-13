// systems/shop.js
// Builds a simple shop catalog with dynamic pricing based on progress along the trail.
// Prices rise up to +50% at the far end (frontier scarcity).

import { loadJSON } from './jsonLoader.js';
import { loadLandmarks, totalTrailMiles } from './landmarks.js';

export async function buildShopCatalog(game, landmark) {
  const items = await loadJSON('../data/items.json');
  const lms = await loadLandmarks();
  const total = totalTrailMiles(lms);
  const progress = Math.max(0, Math.min(1, (Number(game.data.miles || 0)) / (total || 1)));

  // Frontier pricing: up to +50% by the end of the route.
  const priceMul = 1 + 0.5 * progress;

  return items.map(it => ({
    id: it.id,
    name: it.name,
    priceBase: round2(Number(it.price || 0)),
    price: round2(Number(it.price || 0) * priceMul),
    stack: !!it.stack,
    iconKey: iconKeyFor(it.id)
  }));
}

function iconKeyFor(id) {
  switch (id) {
    case 'food':     return 'ui.icon_food';
    case 'bullets':  return 'ui.icon_bullets';
    case 'clothes':  return 'ui.icon_clothes';
    case 'medicine': return 'ui.icon_tools';
    case 'wheel':
    case 'axle':
    case 'tongue':   return 'ui.icon_tools';
    default:         return 'ui.icon_tools';
  }
}

function round2(n) { return Math.round(n * 100) / 100; }

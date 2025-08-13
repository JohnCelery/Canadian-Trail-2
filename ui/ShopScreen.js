// ui/ShopScreen.js
// A simple, accessible shop: choose quantities, see subtotal/remaining, and confirm purchase.

import { buildShopCatalog } from '../systems/shop.js';
import { getImage, getMeta } from '../systems/assets.js';

export async function mountShopScreen(root, { game, landmark, onExit }) {
  const catalog = await buildShopCatalog(game, landmark);
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('aria-labelledby', 'shop-title');
  card.innerHTML = `
    <h2 id="shop-title" style="margin-bottom:0.25rem">Shop — ${escapeHTML(landmark.name)}</h2>
    <p class="muted" style="margin-top:0">Frontier prices rise as you travel. Choose what you need, then confirm.</p>

    <div class="shop-grid" id="shop-grid"></div>

    <div class="shop-summary" aria-live="polite" id="shop-summary"></div>

    <div class="btn-row" style="margin-top: 0.5rem">
      <button class="btn" id="btn-buy" aria-label="Buy selected items">Buy</button>
      <button class="btn btn-outline" id="btn-leave" aria-label="Leave shop">Leave Shop</button>
    </div>
  `;

  const grid = card.querySelector('#shop-grid');
  const summary = card.querySelector('#shop-summary');
  const btnBuy = card.querySelector('#btn-buy');
  const btnLeave = card.querySelector('#btn-leave');

  const qty = Object.fromEntries(catalog.map(c => [c.id, 0]));

  for (const item of catalog) {
    grid.appendChild(rowFor(item, qty, game));
  }

  function update() {
    const sub = subtotal(catalog, qty);
    const money = Number(game.data.money || 0);
    const remain = money - sub;
    summary.innerHTML = `
      <div><strong>Subtotal:</strong> $${sub.toFixed(2)}</div>
      <div><strong>On hand:</strong> $${money.toFixed(2)} ${remain < 0 ? `<span class="pill pill-warn">Short $${Math.abs(remain).toFixed(2)}</span>` : ''}</div>
      <div><strong>After purchase:</strong> $${Math.max(0, remain).toFixed(2)}</div>
    `;
    btnBuy.disabled = sub <= 0 || remain < 0;
  }

  update();

  btnBuy.addEventListener('click', (e) => {
    e.preventDefault();
    const sub = subtotal(catalog, qty);
    const money = Number(game.data.money || 0);
    if (sub <= 0) return;
    if (sub > money + 1e-9) {
      alert('Not enough money.');
      return;
    }
    // Apply purchases
    for (const item of catalog) {
      const q = Number(qty[item.id] || 0);
      if (q > 0) {
        game.data.inventory[item.id] = Number(game.data.inventory[item.id] || 0) + q;
      }
    }
    game.data.money = Math.max(0, money - sub);
    game.data.log.push(`Bought supplies at ${landmark.name} for $${sub.toFixed(2)}.`);
    game.save();
    onExit?.(landmark);
  });

  btnLeave.addEventListener('click', (e) => {
    e.preventDefault();
    onExit?.(landmark);
  });

  root.appendChild(card);
  queueMicrotask(() => grid.querySelector('input.qty')?.focus());

  return () => card.remove();

  // ---- helpers ----
  function rowFor(item, qty, game) {
    const row = document.createElement('div');
    row.className = 'shop-row';

    const pic = document.createElement('div');
    pic.className = 'shop-pic';
    const meta = getMeta(item.iconKey);
    const img = getImage(item.iconKey);
    if (img && meta) {
      const tag = document.createElement('img');
      tag.alt = meta.placeholder ? `${item.name} (placeholder)` : item.name;
      tag.width = meta.w; tag.height = meta.h; tag.src = img.src;
      pic.appendChild(tag);
    } else {
      pic.textContent = '—';
    }

    const name = document.createElement('div');
    name.className = 'shop-name';
    name.innerHTML = `<strong>${escapeHTML(item.name)}</strong><div class="muted mono">Base: $${item.priceBase.toFixed(2)} · Now: $${item.price.toFixed(2)}</div>`;

    const have = document.createElement('div');
    have.className = 'shop-have mono';
    have.textContent = String(Number(game.data.inventory[item.id] || 0));

    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'shop-qty';
    qtyWrap.innerHTML = `
      <button class="qty-btn" aria-label="Decrease ${escapeHTML(item.name)}">−</button>
      <input class="qty" inputmode="numeric" pattern="[0-9]*" aria-label="Quantity ${escapeHTML(item.name)}" value="0">
      <button class="qty-btn" aria-label="Increase ${escapeHTML(item.name)}">+</button>
    `;
    const input = qtyWrap.querySelector('input.qty');
    const btnDec = qtyWrap.querySelectorAll('button.qty-btn')[0];
    const btnInc = qtyWrap.querySelectorAll('button.qty-btn')[1];

    btnDec.addEventListener('click', () => {
      qty[item.id] = Math.max(0, Number(qty[item.id] || 0) - 1);
      input.value = String(qty[item.id]);
      update();
    });
    btnInc.addEventListener('click', () => {
      qty[item.id] = Math.min(9999, Number(qty[item.id] || 0) + 1);
      input.value = String(qty[item.id]);
      update();
    });
    input.addEventListener('input', () => {
      const v = input.value.replace(/[^0-9]/g, '');
      input.value = v;
      qty[item.id] = Math.min(9999, Number(v || 0));
      update();
    });

    row.append(pic, name, have, qtyWrap);
    return row;
  }

  function subtotal(catalog, qty) {
    let s = 0;
    for (const item of catalog) {
      const q = Number(qty[item.id] || 0);
      if (q > 0) s += q * Number(item.price || 0);
    }
    return s;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

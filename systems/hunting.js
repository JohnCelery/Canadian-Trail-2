// systems/hunting.js
// Phase 6 — Hunting engine (deterministic):
// - All randomness uses game.rng (no Math.random).
// - Session lasts durationSec (default 30s) or until bullets run out.
// - Carry cap (default 100 lb) prevents overstocking: anything beyond cap "spoils" immediately.
// - One hunt per in-game day; UI sets game.data.flags.lastHuntDay = current day.
//
// Rendering is handled by ui/HuntingScreen.js; this file exposes state and pure logic.

import { loadJSON } from './jsonLoader.js';

export const DEFAULTS = {
  durationSec: 30,
  carryCapLb: 100,
  spawnEveryMin: 0.8, // seconds
  spawnEveryMax: 1.6,
  shotCooldownMs: 200
};

/**
 * Load animal defs from data/animals.json (cache once).
 * Each animal: { id, name, w, h, speed, yieldLb, spawnWeight }
 */
let ANIMALS = null;
export async function getAnimals() {
  if (!ANIMALS) {
    const raw = await loadJSON('../data/animals.json');
    ANIMALS = raw.map(a => ({
      id: a.id, name: a.name,
      w: Number(a.w || 48), h: Number(a.h || 32),
      speed: Number(a.speed || 100),
      yieldLb: Number(a.yieldLb || 40),
      spawnWeight: Number(a.spawnWeight || 1)
    }));
  }
  return ANIMALS;
}

/**
 * Create a hunting session (logic only).
 * @param {import('../state/GameState.js').GameState} game
 * @param {{width:number,height:number,durationSec?:number,carryCapLb?:number}} opts
 */
export async function createHuntSession(game, opts) {
  const animals = await getAnimals();

  const W = Math.max(320, Math.floor(opts.width));
  const H = Math.max(180, Math.floor(opts.height));
  const durationSec = Math.max(5, Math.floor(opts.durationSec ?? DEFAULTS.durationSec));
  const carryCapLb = Math.max(10, Math.floor(opts.carryCapLb ?? DEFAULTS.carryCapLb));

  // weighted spawn table
  const totalWeight = animals.reduce((s, a) => s + a.spawnWeight, 0);

  /** @type {HuntState} */
  const state = {
    W, H, durationSec, carryCapLb,
    animals: [],
    timeLeft: durationSec,
    bulletsStart: Number(game.data.inventory.bullets || 0),
    bulletsUsed: 0,
    meatTotal: 0,
    killsById: {},
    lastShotAt: 0,
    ended: false,
    // reticle starts centered
    reticle: { x: W/2, y: H/2 }
  };

  // schedule first spawn
  let spawnIn = nextSpawn(game);

  function nextSpawn(game) {
    const min = DEFAULTS.spawnEveryMin, max = DEFAULTS.spawnEveryMax;
    const r = min + (max - min) * game.rng.next();
    return r;
  }

  function spawnOne(game) {
    if (!animals.length) return;
    // pick species by weight
    let r = game.rng.next() * totalWeight;
    let chosen = animals[0];
    for (const a of animals) {
      r -= a.spawnWeight;
      if (r <= 1e-9) { chosen = a; break; }
    }
    // side and y
    const fromLeft = game.rng.next() < 0.5;
    const y = Math.round(20 + (H - 40) * game.rng.next());
    const x = fromLeft ? -chosen.w : W + chosen.w;
    const dir = fromLeft ? 1 : -1;
    const vx = dir * chosen.speed; // px/s
    state.animals.push({
      species: chosen,
      x, y, vx,
      w: chosen.w, h: chosen.h,
      // tiny vertical bob to keep motion lively but deterministic
      bobPhase: game.rng.next() * Math.PI * 2
    });
  }

  function update(game, dt) {
    if (state.ended) return;
    state.timeLeft = Math.max(0, state.timeLeft - dt);

    // spawn timer
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnOne(game);
      spawnIn += nextSpawn(game);
    }

    // move animals
    for (const m of state.animals) {
      m.x += m.vx * dt;
      // sine bob (very small)
      m.y += Math.sin(m.bobPhase + m.x * 0.01) * 0.1;
    }
    // cull offscreen
    state.animals = state.animals.filter(m => m.x > -m.w - 8 && m.x < W + m.w + 8);
  }

  /**
   * Attempt to shoot at point (client coords already mapped to canvas space).
   * Consumes 1 bullet if available and not in cooldown.
   * Returns true if a hit was registered.
   */
  function shoot(game, x, y, nowMs) {
    if (state.ended) return false;
    const haveBullets = Number(game.data.inventory.bullets || 0);
    if (haveBullets <= 0) return false;

    const since = nowMs - state.lastShotAt;
    if (since < DEFAULTS.shotCooldownMs) return false;

    // take a bullet immediately
    game.data.inventory.bullets = Math.max(0, haveBullets - 1);
    state.bulletsUsed += 1;
    state.lastShotAt = nowMs;

    // hitscan: smallest target first at the reticle point
    const p = { x, y };
    let targetIndex = -1;
    let targetArea = Infinity;
    for (let i = 0; i < state.animals.length; i++) {
      const m = state.animals[i];
      if (pointInRect(p, m)) {
        const area = m.w * m.h;
        if (area < targetArea) {
          targetArea = area;
          targetIndex = i;
        }
      }
    }
    if (targetIndex >= 0) {
      const m = state.animals[targetIndex];
      state.animals.splice(targetIndex, 1);
      const lb = Math.max(0, m.species.yieldLb);
      state.meatTotal += lb;
      state.killsById[m.species.id] = (state.killsById[m.species.id] || 0) + 1;
      // small chance to "waste" a pound or two on a messy shot (still deterministic)
      if (game.rng.next() < 0.15) state.meatTotal = Math.max(0, state.meatTotal - 2);
      return true;
    }
    return false;
  }

  function end() {
    state.ended = true;
    const carry = Math.min(state.meatTotal, carryCapLb);
    const spoiled = Math.max(0, state.meatTotal - carry);
    return {
      durationSec,
      carryCapLb,
      bulletsUsed: state.bulletsUsed,
      meatTotal: Math.round(state.meatTotal),
      meatTaken: Math.round(carry),
      spoiled: Math.round(spoiled),
      killsById: { ...state.killsById }
    };
  }

  return { state, update, shoot, end };
}

// ---------- helpers ----------
function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * @typedef {Object} HuntState
 * @property {number} W
 * @property {number} H
 * @property {number} durationSec
 * @property {number} carryCapLb
 * @property {{x:number,y:number}[]} animals
 * @property {number} timeLeft
 * @property {number} bulletsStart
 * @property {number} bulletsUsed
 * @property {number} meatTotal
 * @property {Record<string,number>} killsById
 * @property {number} lastShotAt
 * @property {boolean} ended
 * @property {{x:number,y:number}} reticle
 */

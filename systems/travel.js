// systems/travel.js
// Core travel math (Phase 2):
// - Deterministic day simulation using GameState.data (mutates in place).
// - Miles, food usage (by rations), health drift (by pace & starvation).
// - No advanced events here; Phase 3 will plug an event engine after day resolution.
//
// Design choices documented:
// - Health scale: 0..5 (nonlethal in Phase 2; we clamp but do not kill).
// - Rest day: consumes rations; grants +1 health baseline (net -1 if starvation).
// - All calculations are simple and transparent for tuning later.

const BASE_MPD = 15; // miles per day at steady

export const PACE = /** @type {const} */ ({
  steady: 'steady',
  strenuous: 'strenuous',
  grueling: 'grueling'
});

export const RATIONS = /** @type {const} */ ({
  meager: 'meager',
  normal: 'normal',
  generous: 'generous'
});

export const RATIONS_LB = {
  [RATIONS.meager]: 1.5,
  [RATIONS.normal]: 2.0,
  [RATIONS.generous]: 2.5
};

export function milesPerDay(pace) {
  switch (pace) {
    case PACE.steady:    return BASE_MPD;
    case PACE.strenuous: return BASE_MPD * 1.20; // +20%
    case PACE.grueling:  return BASE_MPD * 1.35; // +35%
    default: return BASE_MPD;
  }
}

export function healthPenaltyByPace(pace) {
  switch (pace) {
    case PACE.steady:    return 0;
    case PACE.strenuous: return -1;
    case PACE.grueling:  return -2;
    default: return 0;
  }
}

/**
 * Apply one day of travel. Mutates game.data.
 * @param {import('../state/GameState.js').GameState} game
 * @returns {{milesTraveled:number, foodConsumed:number, starvation:boolean, healthDelta:number}}
 */
export function applyTravelDay(game) {
  const d = game.data;
  const pace = d.settings?.pace || PACE.steady;
  const rations = d.settings?.rations || RATIONS.normal;

  const people = aliveCount(d.party);
  const perPerson = RATIONS_LB[rations] ?? RATIONS_LB[RATIONS.normal];
  const need = perPerson * people;

  const consumed = Math.min(d.inventory.food, need);
  d.inventory.food = clampNumber(d.inventory.food - consumed, 0, 1e9);

  const starvation = consumed + 1e-6 < need;

  const miles = milesPerDay(pace);
  d.miles = round1(d.miles + miles);

  // Health drift
  const drift = healthPenaltyByPace(pace) + (starvation ? -2 : 0);
  for (const m of d.party) {
    m.health = clampNumber((m.health ?? 5) + drift, 0, 5);
  }

  d.day = (d.day ?? 1) + 1;

  return {
    milesTraveled: miles,
    foodConsumed: consumed,
    starvation,
    healthDelta: drift
  };
}

/**
 * Apply one day of rest. Mutates game.data.
 * @param {import('../state/GameState.js').GameState} game
 * @returns {{milesTraveled:number, foodConsumed:number, starvation:boolean, healthDelta:number}}
 */
export function applyRestDay(game) {
  const d = game.data;
  const rations = d.settings?.rations || RATIONS.normal;

  const people = aliveCount(d.party);
  const perPerson = RATIONS_LB[rations] ?? RATIONS_LB[RATIONS.normal];
  const need = perPerson * people;

  const consumed = Math.min(d.inventory.food, need);
  d.inventory.food = clampNumber(d.inventory.food - consumed, 0, 1e9);

  const starvation = consumed + 1e-6 < need;

  const drift = (starvation ? -1 : +1); // Rest helps unless starving
  for (const m of d.party) {
    m.health = clampNumber((m.health ?? 5) + drift, 0, 5);
  }

  d.day = (d.day ?? 1) + 1;

  return {
    milesTraveled: 0,
    foodConsumed: consumed,
    starvation,
    healthDelta: drift
  };
}

// ---------- helpers ----------
function aliveCount(party) {
  return (party || []).filter(p => p.status !== 'dead').length || 0;
}
function clampNumber(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

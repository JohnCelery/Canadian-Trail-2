// systems/travel.js
// Travel & rest day logic with deterministic overlays from weather & status.
// Maintains original public API from the spec and adds no external deps.

import { rollForDay, getModifiersForToday } from './weather.js';
import { tickAndMaybeAcquire, getAggregatedModifiers, applyGroupHealthDelta } from './status.js';

// Pace and rations constants (exported)
export const PACE = {
STEADY: 'steady',
STRENUOUS: 'strenuous',
GRUELING: 'grueling'
};

export const RATIONS = {
MEAGER: 'meager',
NORMAL: 'normal',
GENEROUS: 'generous'
};

// Pounds of food per person per day
export const RATIONS_LB = {
[RATIONS.MEAGER]: 1.5,
[RATIONS.NORMAL]: 2.0,
[RATIONS.GENEROUS]: 2.5
};

// Base steady miles per day; other paces are multipliers
const BASE_MPD = 15;
function paceMultiplier(pace) {
switch (pace) {
case PACE.STRENUOUS: return 1.20;
case PACE.GRUELING: return 1.35;
default: return 1.00;
}
}
function paceHealthDelta(pace) {
switch (pace) {
case PACE.STRENUOUS: return -1;
case PACE.GRUELING: return -2;
default: return 0;
}
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function countAlive(game) {
return (game?.data?.party || []).filter(m => m.status !== 'dead').length;
}

function consumeFood(game, pounds) {
pounds = Math.max(0, Math.round(pounds));
const inv = game.data.inventory;
const before = inv.food | 0;
const consumed = Math.min(before, pounds);
inv.food = Math.max(0, before - consumed);
return { consumed, shortage: Math.max(0, pounds - consumed) };
}

function applyHealthToParty(game, delta) {
const party = game.data.party || [];
for (const m of party) {
if (m.status === 'dead') continue;
m.health = clamp((m.health | 0) + delta, 0, 5);
if (m.health === 0) m.status = 'dead';
}
}

// Derived helper (exported by spec)
export function milesPerDay(game) {
const pace = game.data.settings?.pace || PACE.STEADY;
return Math.round(BASE_MPD * paceMultiplier(pace));
}

/**

Core travel operation for one day.

Returns: { milesTraveled, foodConsumed, healthDelta, starvation:boolean }

Side effects:

increments day

mutates miles, food, health, logs

integrates daily weather & status overlays (deterministic)
*/
export async function applyTravelDay(game) {
// 1) Daily overlays (roll+tick) based on current day BEFORE increment
const today = game.data.day;
await rollForDay(game, today); // writes a weather log line
await tickAndMaybeAcquire(game); // may write acquire/recover logs

const w = getModifiersForToday(game);
const s = getAggregatedModifiers(game);

// 2) Compute base travel production
const alive = countAlive(game);
const pace = game.data.settings?.pace || PACE.STEADY;
const rations = game.data.settings?.rations || RATIONS.NORMAL;

const baseMiles = Math.round(BASE_MPD * paceMultiplier(pace));
// Overlay speed multiplier (weather × status)
const speedMult = Math.max(0, (w.speedMult || 1) * (s.speedMult || 1));
const milesTraveled = Math.max(0, Math.round(baseMiles * speedMult));

// Food consumption (overlay appetite multiplier applies)
const appetiteMult = Math.max(0, (w.hungerMult || 1) * (s.hungerMult || 1));
const perPersonLb = RATIONS_LB[rations] ?? RATIONS_LB[RATIONS.NORMAL];
const plannedFood = Math.round(alive * perPersonLb * appetiteMult);
const { consumed: foodConsumed, shortage } = consumeFood(game, plannedFood);

// Health: pace + starvation + overlay deltas
let healthDelta = paceHealthDelta(pace);
let starvation = false;
if (shortage > 0) {
healthDelta += -2; // starvation penalty
starvation = true;
}
healthDelta += (w.healthDelta | 0) + (s.healthDelta | 0);

// 3) Apply state
game.data.miles = Math.max(0, (game.data.miles | 0) + milesTraveled);
if (healthDelta !== 0) applyHealthToParty(game, healthDelta);
game.data.day = (game.data.day | 0) + 1;

// 4) Log concise summary
const paceLabel = {
[PACE.STEADY]: 'Steady',
[PACE.STRENUOUS]: 'Strenuous',
[PACE.GRUELING]: 'Grueling'
}[pace] || 'Steady';
const summary = `${paceLabel} pace: traveled ${milesTraveled} mi, ate ${foodConsumed} lb${starvation ? ' (shortage!)' : ''}${healthDelta ? `, health ${healthDelta > 0 ? '+' : ''}${healthDelta}` : ''}.`;
game.data.log.push(summary);

return { milesTraveled, foodConsumed, healthDelta, starvation };
}

/**

Rest day: consumes food and heals a bit. Weather & statuses can reduce or boost.

Returns same shape as travel.
*/
export async function applyRestDay(game) {
// Roll/tick for the current day
const today = game.data.day;
await rollForDay(game, today);
await tickAndMaybeAcquire(game);

const w = getModifiersForToday(game);
const s = getAggregatedModifiers(game);

const alive = countAlive(game);
const rations = game.data.settings?.rations || RATIONS.NORMAL;

// Food consumption on rest still uses appetite overlay
const appetiteMult = Math.max(0, (w.hungerMult || 1) * (s.hungerMult || 1));
const perPersonLb = RATIONS_LB[rations] ?? RATIONS_LB[RATIONS.NORMAL];
const plannedFood = Math.round(alive * perPersonLb * appetiteMult);
const { consumed: foodConsumed, shortage } = consumeFood(game, plannedFood);

// Base rest healing by rations (only if not starving)
let healthDelta = 0;
if (shortage > 0) {
healthDelta += -2;
} else {
if (rations === RATIONS.NORMAL || rations === RATIONS.GENEROUS) healthDelta += 1;
}

// Apply overlays
healthDelta += (w.healthDelta | 0) + (s.healthDelta | 0);

if (healthDelta !== 0) applyHealthToParty(game, healthDelta);
game.data.day = (game.data.day | 0) + 1;

const summary = `Rested: ate ${foodConsumed} lb${shortage ? ' (shortage!)' : ''}${healthDelta ? `, health ${healthDelta > 0 ? '+' : ''}${healthDelta}` : ''}.`;
game.data.log.push(summary);

return { milesTraveled: 0, foodConsumed, healthDelta, starvation: shortage > 0 };
}

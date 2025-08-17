// systems/status.js
// Light, humorous status conditions ("diseases") for Canadian Trail.
// Deterministic via game.rng; save-compatible; effects are aggregated each day.

import { loadJSON, showInitError } from './jsonLoader.js';

let _config = null;
let _loadPromise = null;

async function ensureLoaded() {
if (_config) return;
if (!_loadPromise) {
_loadPromise = loadJSON('../data/diseases.json').then(data => {
const maxConcurrent = Math.max(0, data?.maxConcurrent ?? 3);
const baseDailyAcquireChance = Math.min(1, Math.max(0, data?.baseDailyAcquireChance ?? 0.25));
const conditions = Array.isArray(data?.conditions) ? data.conditions : [];
_config = { maxConcurrent, baseDailyAcquireChance, conditions };
}).catch(err => {
console.warn('[status] load failed', err);
_config = {
maxConcurrent: 2,
baseDailyAcquireChance: 0.2,
conditions: [
{
id: 'fallback_hockey_blues', name: 'Hockey Blues', emoji: '🏒', kind: 'mood',
weight: 1, durationDays: [2, 3],
effects: { speedMult: 0.97, healthChancePerDay: 0.05, hungerMult: 1 },
trigger: { minDay: 1, cooldownDays: 5 },
blurb: 'Craving a game.'
}
]
};
showInitError?.(err);
});
}
await _loadPromise;
}

function ensureState(game) {
const g = game.data;
if (!g.status) {
g.status = { conditions: [], history: {} };
}
if (!Array.isArray(g.status.conditions)) g.status.conditions = [];
if (!g.status.history) g.status.history = {};
}

function weightedPick(rng, items, weightKey = 'weight') {
let total = 0;
for (const it of items) total += Math.max(0, it[weightKey] || 0);
if (total <= 0) return null;
const r = rng.next() * total;
let acc = 0;
for (const it of items) {
acc += Math.max(0, it[weightKey] || 0);
if (r <= acc) return it;
}
return items[items.length - 1] || null;
}

function randintIncl(rng, a, b) {
const low = Math.min(a, b) | 0;
const high = Math.max(a, b) | 0;
const r = rng.next() * (high - low + 1);
return low + Math.floor(r);
}

/**

Apply per-day lifecycle: expire existing, maybe acquire a new one.

Returns list of status changes for logging (already logged inside for UX).
*/
export async function tickAndMaybeAcquire(game) {
ensureState(game);
await ensureLoaded();
const today = game.data.day;

// Expire counters, collect recoveries
const after = [];
for (const cond of game.data.status.conditions) {
cond.daysRemaining = Math.max(0, (cond.daysRemaining ?? 0) - 1);
if (cond.daysRemaining <= 0) {
after.push({ type: 'recovered', cond });
}
}
if (after.length) {
    // Remove expired and write logs
    for (const a of after) {
    const { cond } = a;
    game.data.log.push(`${cond.emoji} Recovered from ${cond.name}.`);
    }
game.data.status.conditions = game.data.status.conditions.filter(c => c.daysRemaining > 0);
}

// Try to acquire a new condition (bounded)
if (game.data.status.conditions.length < _config.maxConcurrent) {
if (game.rng.next() < _config.baseDailyAcquireChance) {
const eligible = _config.conditions.filter(c => {
const trig = c.trigger || {};
const minDay = Math.max(0, trig.minDay || 0);
const cooldown = Math.max(0, trig.cooldownDays || 0);
const lastEnd = game.data.status.history[c.id]?.lastEndDay ?? -9999;
const cooled = (today - lastEnd) >= cooldown;
return today >= minDay && cooled && !game.data.status.conditions.find(ac => ac.id === c.id);
});
const pick = weightedPick(game.rng, eligible || []);
if (pick) {
const [dMin, dMax] = Array.isArray(pick.durationDays) ? pick.durationDays : [2, 3];
const dur = Math.max(1, randintIncl(game.rng, dMin, dMax));
const instance = {
id: pick.id,
name: pick.name,
emoji: pick.emoji || '',
kind: pick.kind || 'misc',
daysRemaining: dur,
effects: {
speedMult: typeof pick?.effects?.speedMult === 'number' ? pick.effects.speedMult : 1,
healthChancePerDay: Math.min(1, Math.max(0, pick?.effects?.healthChancePerDay ?? 0)),
hungerMult: typeof pick?.effects?.hungerMult === 'number' ? pick.effects.hungerMult : 1
},
blurb: pick.blurb || ''
};
      game.data.status.conditions.push(instance);
      game.data.log.push(`${instance.emoji} ${instance.name} — ${instance.blurb} (${dur} day${dur > 1 ? 's' : ''}).`);
}
}
}

// Update history (track last seen end day for cooldowns)
for (const c of game.data.status.conditions) {
// ensure presence in history map
game.data.status.history[c.id] = game.data.status.history[c.id] || {};
}
// When something ended, stamp lastEndDay
for (const a of after) {
const m = game.data.status.history[a.cond.id] = game.data.status.history[a.cond.id] || {};
m.lastEndDay = today;
}

return after;
}

/**

Aggregate modifiers from all active conditions.

Also returns a daily integer healthDelta based on per-condition healthChancePerDay rolls.
*/
export function getAggregatedModifiers(game) {
ensureState(game);
let speedMult = 1;
let hungerMult = 1;
let healthDelta = 0;

for (const c of game.data.status.conditions) {
const e = c.effects || {};
if (typeof e.speedMult === 'number') speedMult *= e.speedMult;
if (typeof e.hungerMult === 'number') hungerMult *= e.hungerMult;
const p = Math.min(1, Math.max(0, e.healthChancePerDay || 0));
if (p > 0 && game.rng.next() < p) {
healthDelta -= 1;
}
}
return { speedMult, hungerMult, healthDelta };
}

/**

Apply a group health delta (negative hurts, positive heals) to all alive members.

Clamps health to 0..5 and logs a concise summary.
*/
export function applyGroupHealthDelta(game, delta, reason = '') {
delta = (delta | 0);
if (!delta) return;
const party = game.data.party || [];
for (const m of party) {
if (m.status !== 'dead') {
m.health = Math.max(0, Math.min(5, (m.health | 0) + delta));
      if (m.health === 0) {
      m.status = 'dead';
      game.data.log.push(`${m.name} died${reason ? ` (${reason})` : ''}.`);
      }
}
}
  if (delta > 0) {
  game.data.log.push(`Party recovered ${delta} health each${reason ? ` (${reason})` : ''}.`);
  } else {
  game.data.log.push(`Party lost ${-delta} health each${reason ? ` (${reason})` : ''}.`);
  }
}

/** Small utility for UI to list active funny chips (optional for now) */
export function listActive(game) {
ensureState(game);
return game.data.status.conditions.map(c => ({
id: c.id, name: c.name, emoji: c.emoji, daysRemaining: c.daysRemaining, blurb: c.blurb
}));
}

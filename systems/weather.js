// systems/weather.js
// Deterministic daily weather overlay for Canadian Trail.
// Loads /data/weather.json and rolls one pattern per in-game day,
// storing it under game.data.weather.today. Effects are applied by travel.js.

import { loadJSON, showInitError } from './jsonLoader.js';

// Fallback patterns if JSON fails to load (keeps game playable)
const FALLBACK = [
{ id: 'nice_day', name: 'Bluebird Nice Day', emoji: '☀️', blurb: 'Clear skies.', weight: 4, mods: { speedMult: 1.1, healthDelta: 0, hungerMult: 1.0 } },
{ id: 'whiteout_eh', name: 'Whiteout, eh?', emoji: '❄️', blurb: 'Snow from all directions.', weight: 2, mods: { speedMult: 0.65, healthDelta: -1, hungerMult: 1.05 } },
{ id: 'geese_headwind', name: 'Geese Headwind', emoji: '🪿', blurb: 'Honks increase drag.', weight: 3, mods: { speedMult: 0.8, healthDelta: 0, hungerMult: 1.0 } }
];

let _patterns = null;
let _loadPromise = null;

async function ensureLoaded() {
if (_patterns) return;
if (!_loadPromise) {
_loadPromise = loadJSON('../data/weather.json').then(data => {
const arr = Array.isArray(data?.patterns) ? data.patterns : FALLBACK;
_patterns = arr.map(p => ({
id: p.id,
name: p.name,
emoji: p.emoji || '',
blurb: p.blurb || '',
weight: Math.max(1, p.weight | 0),
mods: {
speedMult: typeof p?.mods?.speedMult === 'number' ? p.mods.speedMult : 1,
healthDelta: typeof p?.mods?.healthDelta === 'number' ? (p.mods.healthDelta | 0) : 0,
hungerMult: typeof p?.mods?.hungerMult === 'number' ? p.mods.hungerMult : 1
}
}));
}).catch(err => {
console.warn('[weather] load failed, using fallback', err);
_patterns = FALLBACK;
showInitError?.(err);
});
}
await _loadPromise;
}

function ensureState(game) {
const g = game.data;
if (!g.weather) {
g.weather = { lastRolledDay: 0, today: null };
}
// migrate integers / invalid
if (typeof g.weather.lastRolledDay !== 'number') g.weather.lastRolledDay = 0;
}

function weightedPick(rng, items, weightKey = 'weight') {
let total = 0;
for (const it of items) total += it[weightKey] || 0;
const r = rng.next() * total;
let acc = 0;
for (const it of items) {
acc += it[weightKey] || 0;
if (r <= acc) return it;
}
return items[items.length - 1];
}

/**

Roll weather for the given in-game day if not already rolled.

Effects are not applied here; travel.js consumes the mods.
*/
export async function rollForDay(game, dayNumber) {
ensureState(game);
await ensureLoaded();
const gw = game.data.weather;
if (gw.lastRolledDay === dayNumber && gw.today) return gw.today;
const p = weightedPick(game.rng, _patterns);
gw.lastRolledDay = dayNumber;
gw.today = {
day: dayNumber,
id: p.id,
name: p.name,
emoji: p.emoji,
blurb: p.blurb,
mods: { ...p.mods }
};
// friendly log line
game.data.log.push(Weather — ${p.emoji} ${p.name}: ${p.blurb});
return gw.today;
}

export function getToday(game) {
ensureState(game);
return game.data.weather?.today || null;
}

export function getModifiersForToday(game) {
const t = getToday(game);
if (!t) return { speedMult: 1, healthDelta: 0, hungerMult: 1 };
const m = t.mods || {};
return {
speedMult: typeof m.speedMult === 'number' ? m.speedMult : 1,
healthDelta: typeof m.healthDelta === 'number' ? (m.healthDelta | 0) : 0,
hungerMult: typeof m.hungerMult === 'number' ? m.hungerMult : 1
};
}

export function describeToday(game) {
const t = getToday(game);
if (!t) return 'Weather — (unknown)';
const m = t.mods || {};
const spd = m.speedMult && m.speedMult !== 1 ? speed×${m.speedMult.toFixed(2)} : '';
const hp = m.healthDelta ? health ${m.healthDelta > 0 ? '+' : ''}${m.healthDelta} : '';
const eat = m.hungerMult && m.hungerMult !== 1 ? appetite×${m.hungerMult.toFixed(2)} : '';
const parts = [spd, hp, eat].filter(Boolean).join(', ');
return Weather — ${t.emoji} ${t.name}${parts ? (${parts}) : ''};
}

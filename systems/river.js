// systems/river.js
// Phase 5 — Unified crossing mechanic for rivers and other Canadian hazards.
// Mechanics parallel Oregon Trail (ford/caulk/ferry/wait/detour) but skinned per hazard.
// Deterministic: all randomness uses game.rng.
//
// Data model:
//  - Each landmark may include: landmark.hazard = { kind, ...params }
//  - Supported kinds: "river", "mud", "snow", "geese", "beaver"
//  - We persist per-landmark evolving severity in flags.hazardState[landmark.id]
//  - While blocked, flags.atLandmarkId === landmark.id (Travel reopens the modal on refresh)
//
// API:
//  - getHazardState(game, landmark) -> mutable live state
//  - listMethods(hazard, game) -> [{id,label,estHint}]
//  - tryMethod(game, landmark, methodId) -> { resolved:boolean, crossed:boolean, text:string }
//
// Notes:
//  - Waiting consumes full days via applyRestDay() so food/health drift is real.
//  - “Service” = ferry / tow / plow / warden / canoe; high success, costs money + days.
//  - We aim for humor but keep effects readable and fair.

import { applyRestDay } from './travel.js';

export const HAZARD_KINDS = /** @type {const} */ ({
  river: 'river',
  mud: 'mud',
  snow: 'snow',
  geese: 'geese',
  beaver: 'beaver'
});

/** Get or initialize mutable hazard state for this landmark */
export function getHazardState(game, landmark) {
  const flags = game.data.flags || (game.data.flags = {});
  const store = flags.hazardState || (flags.hazardState = {});
  const id = String(landmark.id);
  if (!store[id]) {
    // Shallow clone of author params so we can mutate (e.g., wait lowers severity)
    store[id] = JSON.parse(JSON.stringify(landmark.hazard || {}));
  }
  return store[id];
}

/** Return action choices with a rough "est." hint (Good/Fair/Poor) */
export function listMethods(hazard, game) {
  const kinds = {
    river: [
      { id: 'drive',   label: 'Drive through' },
      { id: 'prep',    label: 'Tarp the engine & creep' },
      { id: 'service', label: 'Pay the ferry' },
      { id: 'wait',    label: 'Wait a day' },
      { id: 'detour',  label: 'Detour via the American side' }
    ],
    mud: [
      { id: 'drive',   label: 'Gun it through the gumbo' },
      { id: 'prep',    label: 'Low gear & careful crawl' },
      { id: 'service', label: 'Flag a farmer’s tractor' },
      { id: 'wait',    label: 'Wait for sun/wind' },
      { id: 'detour',  label: 'Detour on gravel road' }
    ],
    snow: [
      { id: 'drive',   label: 'Punch through the drift' },
      { id: 'prep',    label: 'Shovel a path' },
      { id: 'service', label: 'Hire a plow escort' },
      { id: 'wait',    label: 'Wait for the wind to drop' },
      { id: 'detour',  label: 'Detour to cleared lanes' }
    ],
    geese: [
      { id: 'drive',   label: 'Honk & edge forward' },
      { id: 'prep',    label: 'Bribe with bread (use food)' },
      { id: 'service', label: 'Call the park warden' },
      { id: 'wait',    label: 'Wait out the flock' },
      { id: 'detour',  label: 'Detour around the lake' }
    ],
    beaver: [
      { id: 'drive',   label: 'Splash and bounce across' },
      { id: 'prep',    label: 'Rock‑hop & push' },
      { id: 'service', label: 'Hire a canoe/floater' },
      { id: 'wait',    label: 'Wait for fresh beaver dam' },
      { id: 'detour',  label: 'Detour on logging road' }
    ]
  }[hazard.kind] || [];

  return kinds.map(k => {
    const p = estimateSuccess(hazard, k.id);
    const est = p == null ? '' : ` (est. ${rate(p)})`;
    return { ...k, estHint: est };
  });
}

/**
 * Attempt a method; mutates game + hazard state.
 * @returns {{ resolved:boolean, crossed:boolean, text:string }}
 *   resolved=false means user should try again (e.g., after waiting or failed drive).
 */
export function tryMethod(game, landmark, methodId) {
  const hz = getHazardState(game, landmark);
  const kind = hz.kind;
  const out = { resolved: false, crossed: false, text: '' };

  // Set "parked" flag if not already set
  game.data.flags.atLandmarkId = landmark.id;

  switch (kind) {
    case HAZARD_KINDS.river:   return riverAttempt(game, landmark, hz, methodId);
    case HAZARD_KINDS.mud:     return mudAttempt(game, landmark, hz, methodId);
    case HAZARD_KINDS.snow:    return snowAttempt(game, landmark, hz, methodId);
    case HAZARD_KINDS.geese:   return geeseAttempt(game, landmark, hz, methodId);
    case HAZARD_KINDS.beaver:  return beaverAttempt(game, landmark, hz, methodId);
    default:
      out.text = 'This obstacle looks unusual. Best detour.';
      return out;
  }
}

// --------- River ---------
function riverAttempt(game, landmark, hz, method) {
  const log = game.data.log;
  const p = estimateSuccess(hz, method);
  switch (method) {
    case 'drive': {
      if (roll(game, p)) {
        clearBlock(game, landmark);
        log.push(`Crossed ${landmark.name} by driving through.`);
        return { resolved: true, crossed: true, text: flavor(`You ease in, water at the doors, but the engine holds. Onward.`) };
      } else {
        riverFail(game, hz, 'The car coughs and stalls mid‑flow.');
        return { resolved: false, crossed: false, text: flavor(`Stalled in the current — soaked and grumpy. You drag it back to the bank.`) };
      }
    }
    case 'prep': {
      if (roll(game, p)) {
        clearBlock(game, landmark);
        log.push(`Crossed ${landmark.name} after tarping & creeping.`);
        return { resolved: true, crossed: true, text: flavor(`Tarp on, crawl in low gear, a polite stream of victory.`) };
      } else {
        riverFail(game, hz, 'Water slips past the tarp.');
        return { resolved: false, crossed: false, text: flavor(`A slosh finds the air intake. Back to dry things out.`) };
      }
    }
    case 'service': {
      const { fee, days } = riverServiceCost(game, hz);
      spendMoney(game, fee);
      spendDays(game, days, `Ferry queue at ${landmark.name}`);
      if (!roll(game, 0.98)) maybeNickPart(game); // rare bump
      clearBlock(game, landmark);
      log.push(`Ferry across ${landmark.name} ($${fee.toFixed(2)}, ${days} day${days>1?'s':''}).`);
      return { resolved: true, crossed: true, text: flavor(`A flat‑deck ferry mutters across. Someone offers you a Timbits. Civilization!*`) };
    }
    case 'wait': {
      spendDays(game, 1, `Waiting at ${landmark.name}`);
      hz.depthFt = Math.max(0.5, Number(hz.depthFt || 2) - 0.5);
      if ((hz.current || 'moderate') === 'fast' && game.rng.next() < 0.4) hz.current = 'moderate';
      return { resolved: false, crossed: false, text: flavor(`You wait a day. The river drops a little.`) };
    }
    case 'detour': {
      const days = 2 + game.rng.nextInt(3); // 2–4
      const fee = 5 + game.rng.nextInt(11); // $5–$15 “gas & snacks”
      spendMoney(game, fee);
      spendDays(game, days, 'Scenic detour through America');
      clearBlock(game, landmark);
      log.push(`Detoured around ${landmark.name} ($${fee.toFixed(2)}, ${days} days).`);
      return { resolved: true, crossed: true, text: flavor(`A quick hello to the land of bottomless soda, then back into the pines.`) };
    }
  }
  return { resolved: false, crossed: false, text: 'Unsure what to do here.' };
}

function riverFail(game, hz, reason) {
  const log = game.data.log;
  // Lose a day drying out
  spendDays(game, 1, 'Drying out after river stall');
  // Soak penalties
  const foodLoss = 5 + game.rng.nextInt(11); // 5–15 lb
  game.data.inventory.food = Math.max(0, Number(game.data.inventory.food || 0) - foodLoss);
  if (roll(game, 0.4) && (game.data.inventory.clothes||0)>0) game.data.inventory.clothes -= 1;
  if (roll(game, 0.3) && (game.data.inventory.bullets||0)>0) game.data.inventory.bullets = Math.max(0, game.data.inventory.bullets - 3);
  // Chance of part damage
  maybeNickPart(game);
  // Small health ding to a random member
  dingHealth(game, -1);
  log.push(`${reason} Lost ${foodLoss} lb food. Everyone’s damp.`);
}

function riverServiceCost(game, hz) {
  const depth = Number(hz.depthFt || 2);
  const width = Number(hz.widthFt || 150);
  const fee = 6 + (width/100)*2 + depth*1.5 + game.rng.nextInt(4); // ~$10–$20 typical
  const days = 1 + game.rng.nextInt(3); // 1–3 day queue
  return { fee, days };
}

// --------- Mud ---------
function mudAttempt(game, landmark, hz, method) {
  const log = game.data.log;
  hz.badness = clamp(Number(hz.badness ?? 0.6), 0, 1); // 0 easy .. 1 awful
  const pDrive = clamp(0.2 + 0.6*(1 - hz.badness), 0.05, 0.9);
  const pPrep  = clamp(0.55 + 0.35*(1 - hz.badness), 0.2, 0.95);

  switch (method) {
    case 'drive': {
      if (roll(game, pDrive)) {
        clearBlock(game, landmark);
        log.push(`Powered through gumbo at ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`Mud flies. Somehow traction happens.`) };
      } else {
        spendDays(game, 1, 'Stuck in mud');
        maybeNickPart(game, 0.4);
        dingHealth(game, -1);
        return { resolved: false, crossed: false, text: flavor(`Wheels spin to clay saucers. You haul branches and swear softly.`) };
      }
    }
    case 'prep': {
      if (roll(game, pPrep)) {
        clearBlock(game, landmark);
        log.push(`Crawled through mud at ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`Low gear, patient steering, a humble victory.`) };
      } else {
        spendDays(game, 1, 'Creeping & digging');
        if (roll(game, 0.25)) maybeNickPart(game, 0.3);
        return { resolved: false, crossed: false, text: flavor(`Almost… then a rut swallows the wheel. More digging tomorrow?`) };
      }
    }
    case 'service': {
      const fee = 10 + game.rng.nextInt(15); // $10–$24
      spendMoney(game, fee);
      spendDays(game, 1, 'Waiting on a tractor');
      clearBlock(game, landmark);
      log.push(`Tractor pull at ${landmark.name} ($${fee.toFixed(2)}).`);
      return { resolved: true, crossed: true, text: flavor(`A farmer in coveralls smiles, hooks a chain, and your pride.`) };
    }
    case 'wait': {
      spendDays(game, 1, `Waiting for sun at ${landmark.name}`);
      hz.badness = clamp(hz.badness - 0.2, 0, 1);
      return { resolved: false, crossed: false, text: flavor(`The top crust dries. It might hold tomorrow.`) };
    }
    case 'detour': {
      const days = 1 + game.rng.nextInt(2); // 1–2
      spendDays(game, days, 'Gravel detour');
      clearBlock(game, landmark);
      return { resolved: true, crossed: true, text: flavor(`A scenic road past hay bales and one confused cow.`) };
    }
  }
  return { resolved: false, crossed: false, text: 'Unsure what to do here.' };
}

// --------- Snow ---------
function snowAttempt(game, landmark, hz, method) {
  const log = game.data.log;
  hz.driftFt = Math.max(0.5, Number(hz.driftFt || 2));
  const pDrive = clamp(hz.driftFt < 1.5 ? 0.45 : 0.25, 0.05, 0.7);
  const pPrep  = clamp(0.9 - 0.2*(hz.driftFt - 1), 0.3, 0.95);

  switch (method) {
    case 'drive': {
      if (roll(game, pDrive)) {
        clearBlock(game, landmark);
        log.push(`Punched through drift at ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`The car surfs a powdery wave. Everyone cheers, politely.`) };
      } else {
        spendDays(game, 1, 'Hung up on packed snow');
        if (roll(game, 0.35)) maybeNickPart(game, 0.5);
        dingHealth(game, -1);
        return { resolved: false, crossed: false, text: flavor(`You high‑center on icy ruts. Toes complain.`) };
      }
    }
    case 'prep': {
      const halfDay = 1; // model as a day for simplicity
      spendDays(game, halfDay, 'Shoveling a path');
      if (roll(game, pPrep)) {
        clearBlock(game, landmark);
        log.push(`Shoveled through drift at ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`Backs ache, but the lane holds.`) };
      } else {
        return { resolved: false, crossed: false, text: flavor(`The wind fills your work. Maybe try again.`) };
      }
    }
    case 'service': {
      const fee = 12 + game.rng.nextInt(20); // $12–$31
      spendMoney(game, fee);
      spendDays(game, 1, 'Waiting on plow escort');
      clearBlock(game, landmark);
      log.push(`Plow escort at ${landmark.name} ($${fee.toFixed(2)}).`);
      return { resolved: true, crossed: true, text: flavor(`A snowplow rumbles ahead like a metal moose.`) };
    }
    case 'wait': {
      spendDays(game, 1, `Waiting for wind to drop at ${landmark.name}`);
      hz.driftFt = Math.max(0.5, hz.driftFt - 0.5);
      return { resolved: false, crossed: false, text: flavor(`The drift slumps a little.`) };
    }
    case 'detour': {
      const days = 1 + game.rng.nextInt(3);
      spendDays(game, days, 'Detour to cleared lanes');
      clearBlock(game, landmark);
      return { resolved: true, crossed: true, text: flavor(`You shadow a convoy of salt trucks. Brine everywhere.`) };
    }
  }
  return { resolved: false, crossed: false, text: 'Unsure what to do here.' };
}

// --------- Geese ---------
function geeseAttempt(game, landmark, hz, method) {
  const log = game.data.log;
  hz.flock = Math.max(5, Number(hz.flock || 60));
  const pDrive = clamp(0.75 - (hz.flock/200), 0.2, 0.9);
  const pPrep  = clamp(0.92 - (hz.flock/400), 0.4, 0.97);

  switch (method) {
    case 'drive': {
      if (roll(game, pDrive)) {
        clearBlock(game, landmark);
        log.push(`Inched past the geese at ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`Hiss‑to‑politeness ratio drops. You slide by.`) };
      } else {
        spendDays(game, 1, 'Backing off angry geese');
        if (roll(game, 0.4)) dingHealth(game, -1);
        return { resolved: false, crossed: false, text: flavor(`A beaked diplomat pecks the bumper. Retreat.`) };
      }
    }
    case 'prep': {
      // Bread bribe: spend 2–5 lb food for higher chance; if low food, attempt with worse odds
      let foodSpend = Math.min(Number(game.data.inventory.food || 0), 2 + game.rng.nextInt(4)); // 2–5
      if (foodSpend >= 2) {
        game.data.inventory.food = Math.max(0, game.data.inventory.food - foodSpend);
      } else {
        // Not much food to spare — slight penalty
        hz.flock += 10;
      }
      if (roll(game, pPrep)) {
        clearBlock(game, landmark);
        log.push(`Bribed the geese at ${landmark.name} (−${foodSpend.toFixed(1)} lb food).`);
        return { resolved: true, crossed: true, text: flavor(`Bread diplomacy wins the day.`) };
      } else {
        return { resolved: false, crossed: false, text: flavor(`They demand more carbs. Stalemate.`) };
      }
    }
    case 'service': {
      const fee = 5 + game.rng.nextInt(8); // $5–$12
      spendMoney(game, fee);
      spendDays(game, 1, 'Waiting on a park warden');
      clearBlock(game, landmark);
      log.push(`Warden shooed geese at ${landmark.name} ($${fee.toFixed(2)}).`);
      return { resolved: true, crossed: true, text: flavor(`A whistle, a vest, authority. The flock yields.`) };
    }
    case 'wait': {
      spendDays(game, 1, `Waiting for geese to wander at ${landmark.name}`);
      // Flock disperses by ~40–60%
      hz.flock = Math.max(5, Math.round(hz.flock * (0.4 + game.rng.next()*0.2)));
      return { resolved: false, crossed: false, text: flavor(`Fewer geese now. Ground still suspicious.`) };
    }
    case 'detour': {
      const days = 1 + game.rng.nextInt(2);
      spendDays(game, days, 'Detour around the lake');
      clearBlock(game, landmark);
      return { resolved: true, crossed: true, text: flavor(`Boardwalk, reeds, and one heroic loon.`) };
    }
  }
  return { resolved: false, crossed: false, text: 'Unsure what to do here.' };
}

// --------- Beaver ---------
function beaverAttempt(game, landmark, hz, method) {
  const log = game.data.log;
  hz.gapFt = Math.max(2, Number(hz.gapFt || 8)); // missing planks / washout gap
  const pDrive = clamp(hz.gapFt < 6 ? 0.55 : 0.25, 0.1, 0.8);
  const pPrep  = clamp(0.75 - 0.05*(hz.gapFt - 6), 0.25, 0.9);

  switch (method) {
    case 'drive': {
      if (roll(game, pDrive)) {
        clearBlock(game, landmark);
        log.push(`Bounced through washout at ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`A splash, a rattle, and somehow four wheels remain.`) };
      } else {
        spendDays(game, 1, 'Backing out of flooded gap');
        maybeNickPart(game, 0.5);
        dingHealth(game, -1);
        return { resolved: false, crossed: false, text: flavor(`Something clonks. You rethink your life choices.`) };
      }
    }
    case 'prep': {
      if (roll(game, pPrep)) {
        clearBlock(game, landmark);
        log.push(`Rock‑hopped across ${landmark.name}.`);
        return { resolved: true, crossed: true, text: flavor(`People push, tires squirm, success tastes like river mist.`) };
      } else {
        spendDays(game, 1, 'Re‑stacking rocks');
        return { resolved: false, crossed: false, text: flavor(`The stack shifts. One more go?`) };
      }
    }
    case 'service': {
      const fee = 12 + game.rng.nextInt(14); // $12–$25
      spendMoney(game, fee);
      spendDays(game, 1, 'Hiring a canoe/floater');
      clearBlock(game, landmark);
      log.push(`Canoe assist at ${landmark.name} ($${fee.toFixed(2)}).`);
      return { resolved: true, crossed: true, text: flavor(`Locals nod, beavers stare, you cross.`) };
    }
    case 'wait': {
      spendDays(game, 1, `Waiting for beavers at ${landmark.name}`);
      hz.gapFt = Math.max(2, hz.gapFt - 2); // industrious creatures
      return { resolved: false, crossed: false, text: flavor(`New sticks appear. Nature’s contractor at work.`) };
    }
    case 'detour': {
      const days = 1 + game.rng.nextInt(3);
      spendDays(game, days, 'Logging road detour');
      clearBlock(game, landmark);
      return { resolved: true, crossed: true, text: flavor(`You bounce past spruce and dust. Good times.`) };
    }
  }
  return { resolved: false, crossed: false, text: 'Unsure what to do here.' };
}

// --------- Odds / helpers ---------
function estimateSuccess(hz, method) {
  if (hz.kind === 'river') {
    const depth = Number(hz.depthFt || 2);
    const width = Number(hz.widthFt || 150);
    const current = String(hz.current || 'moderate');
    const widthPenalty = width > 300 ? 0.08 : width > 200 ? 0.05 : 0;
    const flowPenalty = current === 'fast' ? 0.15 : current === 'slow' ? -0.05 : 0;
    if (method === 'drive') {
      let base = depth < 2 ? 0.70 : depth < 3 ? 0.40 : 0.15;
      return clamp(base - widthPenalty - Math.max(0, flowPenalty), 0.05, 0.9);
    }
    if (method === 'prep') {
      let base = 0.85;
      if (depth > 3) base -= 0.05 * (depth - 3);
      return clamp(base - widthPenalty - (flowPenalty > 0 ? flowPenalty * 0.6 : 0), 0.1, 0.95);
    }
    if (method === 'service') return 0.95;
    if (method === 'wait' || method === 'detour') return null; // not a success/fail roll
  }
  // Generic estimates for others
  if (hz.kind === 'mud') {
    const bad = clamp(Number(hz.badness ?? 0.6), 0, 1);
    if (method === 'drive') return clamp(0.2 + 0.6*(1 - bad), 0.05, 0.9);
    if (method === 'prep')  return clamp(0.55 + 0.35*(1 - bad), 0.2, 0.95);
    if (method === 'service') return 0.95;
    return null;
  }
  if (hz.kind === 'snow') {
    const h = Math.max(0.5, Number(hz.driftFt || 2));
    if (method === 'drive') return clamp(h < 1.5 ? 0.45 : 0.25, 0.05, 0.7);
    if (method === 'prep')  return clamp(0.9 - 0.2*(h - 1), 0.3, 0.95);
    if (method === 'service') return 0.98;
    return null;
  }
  if (hz.kind === 'geese') {
    const f = Math.max(5, Number(hz.flock || 60));
    if (method === 'drive') return clamp(0.75 - (f/200), 0.2, 0.9);
    if (method === 'prep')  return clamp(0.92 - (f/400), 0.4, 0.97);
    if (method === 'service') return 0.96;
    return null;
  }
  if (hz.kind === 'beaver') {
    const g = Math.max(2, Number(hz.gapFt || 8));
    if (method === 'drive') return clamp(g < 6 ? 0.55 : 0.25, 0.1, 0.8);
    if (method === 'prep')  return clamp(0.75 - 0.05*(g - 6), 0.25, 0.9);
    if (method === 'service') return 0.97;
    return null;
  }
  return null;
}

function rate(p) {
  if (p == null) return '';
  if (p >= 0.75) return 'Good';
  if (p >= 0.5)  return 'Fair';
  return 'Poor';
}

function roll(game, p) {
  if (p == null) return false;
  return game.rng.next() < p;
}

function spendDays(game, days, label) {
  days = Math.max(0, Math.floor(days));
  for (let i = 0; i < days; i++) {
    applyRestDay(game); // consumes food, applies health drift
  }
  if (days > 0) game.data.log.push(`${label} (${days} day${days>1?'s':''}).`);
}

function spendMoney(game, fee) {
  const m = Number(game.data.money || 0);
  game.data.money = Math.max(0, m - Number(fee || 0));
}

function dingHealth(game, delta) {
  const alive = (game.data.party || []).filter(p => p.status !== 'dead');
  if (!alive.length) return;
  const i = game.rng.nextInt(alive.length);
  alive[i].health = clamp((alive[i].health ?? 5) + delta, 0, 5);
}

function maybeNickPart(game, chance = 0.3) {
  if (!roll(game, chance)) return;
  const parts = ['wheel', 'axle', 'tongue'];
  const pick = parts[game.rng.nextInt(parts.length)];
  if ((game.data.inventory[pick] || 0) > 0) {
    game.data.inventory[pick] -= 1;
    game.data.log.push(`Lost a ${pick}.`);
  }
}

function clearBlock(game, landmark) {
  if (game.data.flags?.atLandmarkId === landmark.id) {
    delete game.data.flags.atLandmarkId;
  }
  game.save();
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n))); }
function flavor(s) { return s; }

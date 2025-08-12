// systems/eventEngine.js
// Phase 3 — Advanced Event Engine
// - Weighted, condition-gated event selection ~ every 3–6 days
// - Multi-stage graphs with choices -> effects -> goto next/end
// - Effect types: inventory, money, health, status, time, distance, mapFlag, riskBuff, morale, mortality
// - Deterministic: all random rolls use GameState.rng
//
// Notes & limitations (Phase 3 scope):
// - `time` effects increment the day counter but do not yet model food use/health drift.
//   We'll refine time passage in later phases alongside resting/repair modeling.
// - Choice gating supports simple `requires.moneyGte` and `requires.inventory.{item}Gte`.
// - Text placeholders supported: {child} -> random living child’s name; falls back to “a child”.

import { loadJSON } from './jsonLoader.js';

let EVENTS = null;

/** Ensure events are loaded once */
async function ensureEvents() {
  if (EVENTS) return;
  EVENTS = await loadJSON('../data/events.json');
  if (!Array.isArray(EVENTS)) throw new Error('events.json must be an array');
}

/**
 * Decide if an event should trigger today.
 * - Decrements a cooldown counter each day; if <= 0, tries to fire one event.
 * - On success, sets a new cooldown to 3–6 days.
 * @returns {Promise<null|EventSession>}
 */
export async function maybeTriggerEvent(game) {
  await ensureEvents();
  const flags = game.data.flags || (game.data.flags = {});
  let cd = Number(flags.evtCooldownDays || 0);
  if (cd > 0) {
    flags.evtCooldownDays = cd - 1;
    game.save();
    return null;
  }

  // Build eligible set by conditions ("when")
  const eligible = EVENTS.filter(e => isEligible(e, game));
  if (eligible.length === 0) {
    // try again tomorrow
    flags.evtCooldownDays = 1;
    game.save();
    return null;
  }

  const ev = weightedPick(game, eligible, (e) => Number(e.weight || 1));
  const session = createSession(game, ev);

  // Set cooldown for the NEXT event now (so refreshes don't double-fire).
  flags.evtCooldownDays = 3 + game.rng.nextInt(4); // 3..6
  game.data.log.push(`Event: ${ev.title}`);
  game.save();

  return session;
}

/** Create an event session at its first stage */
function createSession(game, ev) {
  const first = ev.stages?.[0];
  const startId = first?.id || 'start';
  const child = pickPartyMember(game, 'child');

  /** @type {EventSession} */
  const session = {
    event: ev,
    stageId: startId,
    vars: { child }, // usable in text placeholders
    logs: []
  };
  return session;
}

/** Render current stage (title, text with placeholders, and choice metadata) */
export function renderStage(session, game) {
  const st = findStage(session);
  const title = session.event.title;
  const text = substitute(st.text || '', session, game);
  const rawChoices = Array.isArray(st.choices) && st.choices.length
    ? st.choices
    : [{ id: 'continue', label: 'Continue', goto: 'end' }];

  const choices = rawChoices.map(ch => {
    const miss = missingRequirements(ch, game);
    return {
      id: ch.id,
      label: ch.label,
      disabled: miss.length > 0,
      reason: miss.join(', '),
      goto: ch.goto,
      effects: ch.effects || []
    };
  });

  return { title, text, choices };
}

/** Apply a chosen branch; returns { done: boolean } */
export function choose(session, choiceId, game) {
  const st = findStage(session);
  const ch = (st.choices || []).find(c => c.id === choiceId) ||
             (choiceId === 'continue' ? { id: 'continue', goto: 'end', effects: [] } : null);
  if (!ch) return { done: true };

  // If disabled, ignore (safety)
  if (missingRequirements(ch, game).length > 0) {
    session.logs.push('Choice requirements not met.');
    return { done: false };
  }

  applyEffects(ch.effects || [], game, session);

  // Advance to next stage
  const next = ch.goto;
  if (next && next !== 'end') {
    session.stageId = next;
    game.save();
    return { done: false };
  }

  // End
  game.save();
  return { done: true };
}

// ---------------- internals ----------------

function findStage(session) {
  const id = session.stageId;
  const st = (session.event.stages || []).find(s => s.id === id) || session.event.stages?.[0];
  if (!st) throw new Error(`Event ${session.event.id} has no stages`);
  return st;
}

function isEligible(ev, game) {
  const w = ev.when || {};
  const d = game.data;

  if (w.minDay != null && (d.day ?? 1) < w.minDay) return false;
  if (w.maxDay != null && (d.day ?? 1) > w.maxDay) return false;
  if (w.mileGte != null && d.miles < w.mileGte) return false;
  if (w.mileLt  != null && d.miles >= w.mileLt) return false;

  // flags
  if (w.ifFlag && !d.flags[w.ifFlag]) return false;
  if (w.ifFlagMissing && d.flags[w.ifFlagMissing]) return false;

  // simple inventory gates (few common items)
  const inv = d.inventory || {};
  const invW = w.ifInventory || {};
  if (invW.foodLt != null && !(inv.food < invW.foodLt)) return false;
  if (invW.bulletsGte != null && !(inv.bullets >= invW.bulletsGte)) return false;
  if (invW.medicineGte != null && !(inv.medicine >= invW.medicineGte)) return false;

  return true;
}

function missingRequirements(choice, game) {
  const msgs = [];
  const r = choice.requires || {};
  const d = game.data;
  if (r.moneyGte != null && !(Number(d.money || 0) >= r.moneyGte)) msgs.push(`Requires $${r.moneyGte}`);
  if (r.inventory) {
    const inv = d.inventory || {};
    for (const [k, v] of Object.entries(r.inventory)) {
      // supports keys like axleGte, bulletsGte, clothesGte …
      if (typeof v !== 'number') continue;
      const m = /^(.*)Gte$/.exec(k);
      if (!m) continue;
      const item = m[1];
      if (!(Number(inv[item] || 0) >= v)) msgs.push(`Requires ${item} ×${v}`);
    }
  }
  return msgs;
}

function substitute(text, session, game) {
  const childName = session.vars?.child?.name || 'a child';
  return String(text)
    .replaceAll('{child}', childName);
}

function weightedPick(game, arr, weightFn) {
  let sum = 0;
  const weights = arr.map(x => {
    const w = Math.max(0, Number(weightFn(x) || 0));
    sum += w;
    return w;
  });
  if (sum <= 0) return arr[0];
  let r = game.rng.next() * sum;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 1e-9) return arr[i];
  }
  return arr[arr.length - 1];
}

function applyEffects(effects, game, session) {
  for (const eff of effects) {
    switch (eff.type) {
      case 'inventory': {
        const { item, delta } = eff;
        if (!item || !Number.isFinite(delta)) break;
        game.data.inventory[item] = Number(game.data.inventory[item] || 0) + Number(delta);
        session.logs.push(`${labelItem(item)} ${deltaSigned(delta)}.`);
        game.data.log.push(`${labelItem(item)} ${deltaSigned(delta)}.`);
        break;
      }
      case 'money': {
        const d = Number(eff.delta || 0);
        const before = Number(game.data.money || 0);
        game.data.money = Math.max(0, before + d);
        session.logs.push(`Money ${deltaSigned(d)} (${fmtMoney(game.data.money)}).`);
        game.data.log.push(`Money ${deltaSigned(d)} (${fmtMoney(game.data.money)}).`);
        break;
      }
      case 'health': {
        const delta = Number(eff.delta || 0);
        const targets = resolveTargets(game, eff.target, session);
        for (const m of targets) {
          m.health = clamp(m.health + delta, 0, 5);
        }
        session.logs.push(`Health ${deltaSigned(delta)} for ${targets.length} member(s).`);
        game.data.log.push(`Health ${deltaSigned(delta)} for ${targets.length} member(s).`);
        break;
      }
      case 'status': {
        const status = String(eff.status || '').trim();
        const targets = resolveTargets(game, eff.target, session);
        for (const m of targets) {
          m.status = status || m.status;
        }
        session.logs.push(`Status set to "${status}" for ${targets.length} member(s).`);
        game.data.log.push(`Status set to "${status}" for ${targets.length} member(s).`);
        break;
      }
      case 'time': {
        const days = Number(eff.days || 0);
        game.data.day = Number(game.data.day || 1) + Math.max(0, days);
        session.logs.push(`Lost ${days} day(s).`);
        game.data.log.push(`Lost ${days} day(s).`);
        break;
      }
      case 'distance': {
        const miles = Number(eff.miles || 0);
        game.data.miles = Math.max(0, Number(game.data.miles || 0) + miles);
        const verb = miles >= 0 ? 'Advanced' : 'Lost ground';
        session.logs.push(`${verb} ${Math.abs(miles).toFixed(0)} miles.`);
        game.data.log.push(`${verb} ${Math.abs(miles).toFixed(0)} miles.`);
        break;
      }
      case 'mapFlag': {
        const { key, value } = eff;
        if (key) game.data.flags[key] = value !== undefined ? value : true;
        session.logs.push(`Flag ${key} = ${String(game.data.flags[key])}.`);
        break;
      }
      case 'riskBuff': {
        const { key, mult = 1, days = 0 } = eff;
        if (!game.data.buffs) game.data.buffs = {};
        game.data.buffs[key] = { mult: Number(mult), untilDay: Number(game.data.day || 1) + Number(days || 0) };
        session.logs.push(`Risk buff "${key}" active ×${mult} for ${days} day(s).`);
        game.data.log.push(`Risk buff "${key}" active ×${mult} for ${days} day(s).`);
        break;
      }
      case 'morale': {
        const d = Number(eff.delta || 0);
        game.data.morale = clamp(Number(game.data.morale || 0) + d, -5, 5);
        session.logs.push(`Morale ${deltaSigned(d)} (now ${game.data.morale}).`);
        game.data.log.push(`Morale ${deltaSigned(d)} (now ${game.data.morale}).`);
        break;
      }
      case 'mortality': {
        const tgt = resolveTargets(game, eff.target || 'random', session);
        const victim = tgt[0];
        if (victim && victim.status !== 'dead') {
          victim.status = 'dead';
          victim.health = 0;
          const note = epitaphFor(game, victim, eff.reason);
          const msg = `Grave for ${victim.name}: "${note}" (Day ${game.data.day}, Mile ${Math.round(game.data.miles)}).`;
          session.logs.push(msg);
          game.data.log.push(msg);
        }
        break;
      }
      case 'roll': {
        const opts = eff.options || [];
        if (!opts.length) break;
        const chosen = weightedPick(game, opts, (o) => Number(o.weight || 1));
        if (Array.isArray(chosen.effects)) {
          applyEffects(chosen.effects, game, session);
        }
        if (chosen.log) {
          game.data.log.push(String(chosen.log));
          session.logs.push(String(chosen.log));
        }
        break;
      }
      default: {
        // unknown types are ignored but noted for debugging
        session.logs.push(`(ignored effect: ${String(eff.type)})`);
        break;
      }
    }
  }
}

function labelItem(id) {
  const map = {
    food: 'Food', bullets: 'Bullets', clothes: 'Clothes',
    wheel: 'Wagon Wheel', axle: 'Wagon Axle', tongue: 'Wagon Tongue',
    medicine: 'Medicine'
  };
  return map[id] || id;
}

function deltaSigned(n) { return `${n >= 0 ? '+' : ''}${Number(n)}`; }
function fmtMoney(n) { return `$${Number(n).toFixed(2)}`; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n))); }

/** Resolve party targets by spec: 'random' | 'family' | 'child' | memberId */
function resolveTargets(game, spec, session) {
  const party = (game.data.party || []).filter(p => p.status !== 'dead');
  if (!party.length) return [];
  switch (spec) {
    case 'family':
    case 'all': return party;
    case 'child': {
      const c = party.filter(p => p.role === 'child' || p.role === 'infant');
      if (c.length) return [c[game.rng.nextInt(c.length)]];
      break;
    }
    case 'random':
    default: {
      const i = game.rng.nextInt(party.length);
      return [party[i]];
    }
  }
  // memberId match
  if (typeof spec === 'string') {
    const m = party.find(p => p.id === spec);
    if (m) return [m];
  }
  // fallback to child var if present
  if (session?.vars?.child) return [session.vars.child];
  return [party[game.rng.nextInt(party.length)]];
}

function pickPartyMember(game, role) {
  const party = (game.data.party || []).filter(p => p.status !== 'dead');
  const subset = role ? party.filter(p => p.role === role || (role === 'child' && (p.role === 'child' || p.role === 'infant'))) : party;
  if (subset.length === 0) return party[0] || null;
  return subset[game.rng.nextInt(subset.length)];
}

function epitaphFor(game, member, reason) {
  const table = game.data.epitaphs || {};
  return String(reason || table[member.id] || 'Gone ahead on the long road.');
}

/**
 * @typedef {Object} EventSession
 * @property {any} event
 * @property {string} stageId
 * @property {{ child?: any }} vars
 * @property {string[]} logs
 */

// state/GameState.js
// Phase 3 additions:
// - Fields: money, morale, buffs, epitaphs (targeted messages per member)
// - Day counter preserved from Phase 2
// - Deterministic RNG and save/load as before

const SAVE_KEY = 'canadian-trail-save-v1';

/** Mulberry32 RNG with simple state */
export class RNG {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(max) { return Math.floor(this.next() * Math.floor(max)); }
  pick(arr) { return arr[this.nextInt(arr.length)]; }
  getState() { return this.state >>> 0; }
  setState(s) { this.state = (s >>> 0) || 1; }
}

/** GameState manages persistent snapshot + deterministic RNG */
export class GameState {
  constructor(opts = {}) {
    this.storage = opts.storage || getDefaultStorage();
    this.data = {
      version: 1,
      rngSeed: 1,
      rngState: 1,
      day: 1,
      party: [],
      inventory: { food: 100, bullets: 20, clothes: 4, wheel: 1, axle: 1, tongue: 0, medicine: 2 },
      money: 50,
      morale: 0,
      buffs: {},
      miles: 0,
      settings: { pace: 'steady', rations: 'normal' },
      flags: {},
      epitaphs: defaultEpitaphs(),
      log: []
    };
    this.rng = new RNG(1);
  }

  static randomSeed() {
    try {
      if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        globalThis.crypto.getRandomValues(buf);
        return buf[0] >>> 0;
      }
    } catch { /* ignore */ }
    const a = Math.floor(Date.now() % 0xffffffff) >>> 0;
    const b = Math.floor(Math.random() * 0xffffffff) >>> 0;
    return (a ^ rotateLeft(b, 13)) >>> 0;
  }

  startNewGame(seed = GameState.randomSeed()) {
    const party = [
      { id: 'merri-ellen', name: 'Merri‑Ellen', role: 'mom',    health: 5, status: 'well' },
      { id: 'mike',        name: 'Mike',        role: 'dad',    health: 5, status: 'well' },
      { id: 'ros',         name: 'Ros',         role: 'child',  health: 5, status: 'well', age: 9 },
      { id: 'jess',        name: 'Jess',        role: 'child',  health: 5, status: 'well', age: 6 },
      { id: 'martha',      name: 'Martha',      role: 'child',  health: 5, status: 'well', age: 3 },
      { id: 'rusty',       name: 'Rusty',       role: 'infant', health: 5, status: 'well', age: 1 }
    ];
    this.data = {
      version: 1,
      rngSeed: seed >>> 0,
      rngState: seed >>> 0,
      day: 1,
      party,
      inventory: { food: 100, bullets: 30, clothes: 5, wheel: 1, axle: 1, tongue: 0, medicine: 2 },
      money: 50,
      morale: 0,
      buffs: {},
      miles: 0,
      settings: { pace: 'steady', rations: 'normal' },
      flags: { started: true },
      epitaphs: defaultEpitaphs(),
      log: [`New game started with seed ${seed}`]
    };
    this.rng = new RNG(this.data.rngState);
    this.save();
  }

  continueGame() {
    const raw = this.storage.getItem(SAVE_KEY);
    if (!raw) throw new Error('No saved game found.');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Corrupt save.');
    if (!('day' in parsed)) parsed.day = 1;
    // Add missing fields for backward compatibility
    parsed.money ??= 50;
    parsed.morale ??= 0;
    parsed.buffs ??= {};
    parsed.epitaphs ??= defaultEpitaphs();
    this.data = parsed;
    this.rng = new RNG(this.data.rngState || this.data.rngSeed || 1);
  }

  save() {
    this.data.rngState = this.rng.getState() >>> 0;
    this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  static hasSave(storage = getDefaultStorage()) {
    try {
      return !!storage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  rngNext() {
    const v = this.rng.next();
    this.save();
    return v;
  }
}

function getDefaultStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* ignore */ }
  const mem = {};
  return {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { for (const k of Object.keys(mem)) delete mem[k]; }
  };
}

function rotateLeft(n, bits) {
  return ((n << bits) | (n >>> (32 - bits))) >>> 0;
}

function defaultEpitaphs() {
  return {
    'merri-ellen': 'She kept the family moving.',
    'mike':        'He would not leave the wagon.',
    'ros':         'Bright eyes, quick hands.',
    'jess':        'A laugh that warmed the camp.',
    'martha':      'She loved buttons and stars.',
    'rusty':       'Small hands, fierce heart.'
  };
}

// state/GameState.js
// - Seeded RNG (Mulberry32 variant) with serialize/deserialize
// - startNewGame(seed?), continueGame(), save/load in localStorage
// - Designed to be Node-testable: storage is injectable and no window access at import time.

const SAVE_KEY = 'canadian-trail-save-v1';

/** Mulberry32 RNG with simple state */
export class RNG {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }
  next() {
    // 32-bit; returns float [0,1)
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
      party: [],
      inventory: { food: 100, bullets: 20, clothes: 4, wheel: 1, axle: 1, tongue: 0, medicine: 2 },
      miles: 0,
      settings: { pace: 'steady', rations: 'normal' },
      flags: {},
      log: []
    };
    this.rng = new RNG(1);
  }

  /** Generate a cryptographically strong seed if possible */
  static randomSeed() {
    try {
      if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        globalThis.crypto.getRandomValues(buf);
        return buf[0] >>> 0;
      }
    } catch { /* ignore */ }
    // Fallback: mix Date.now() + Math.random()
    const a = Math.floor(Date.now() % 0xffffffff) >>> 0;
    const b = Math.floor(Math.random() * 0xffffffff) >>> 0;
    return (a ^ rotateLeft(b, 13)) >>> 0;
  }

  /** Create a fresh game; if seed omitted, generates one */
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
      party,
      inventory: { food: 100, bullets: 30, clothes: 5, wheel: 1, axle: 1, tongue: 0, medicine: 2 },
      miles: 0,
      settings: { pace: 'steady', rations: 'normal' },
      flags: { started: true },
      log: [`New game started with seed ${seed}`]
    };
    this.rng = new RNG(this.data.rngState);
    this.save();
  }

  /** Continue from saved snapshot (throws on missing/invalid) */
  continueGame() {
    const raw = this.storage.getItem(SAVE_KEY);
    if (!raw) throw new Error('No saved game found.');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Corrupt save.');
    this.data = parsed;
    this.rng = new RNG(this.data.rngState || this.data.rngSeed || 1);
  }

  /** Save snapshot (including current RNG state) */
  save() {
    // Sync current RNG state to data before persisting
    this.data.rngState = this.rng.getState() >>> 0;
    this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  /** True if a save exists */
  static hasSave(storage = getDefaultStorage()) {
    try {
      return !!storage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  /** Advance RNG once and persist its state (for future determinism) */
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
  // In Node or restricted environments, use an in-memory fallback
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

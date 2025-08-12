// tests/run.js — tiny Node smoke tests (no browser needed)
import assert from 'node:assert/strict';
import { RNG, GameState } from '../state/GameState.js';

function testRNGDeterminism() {
  const seed = 123456789;
  const a = new RNG(seed);
  const b = new RNG(seed);
  for (let i = 0; i < 10; i++) {
    const va = a.next();
    const vb = b.next();
    assert.equal(Number(va.toFixed(10)), Number(vb.toFixed(10)), 'RNG outputs should match for same seed');
  }
  console.log('✓ RNG determinism (same seed -> same sequence)');
}

function testSaveLoadNoThrow() {
  // Memory storage stub
  let store = {};
  const storage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };

  const gs = new GameState({ storage });
  const seed = 42;
  gs.startNewGame(seed);
  assert.equal(gs.data.rngSeed, seed, 'Seed should persist in data');
  gs.save();

  const gs2 = new GameState({ storage });
  assert.doesNotThrow(() => gs2.continueGame(), 'continueGame should not throw with valid save');
  assert.equal(gs2.data.rngSeed, seed, 'Loaded seed should match');
  console.log('✓ Save/load works with injected storage');
}

testRNGDeterminism();
testSaveLoadNoThrow();
console.log('All tests passed.');

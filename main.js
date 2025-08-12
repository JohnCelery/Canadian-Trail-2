// Canadian Trail — Phase 1 main entry
// - Loads manifest JSON via systems/jsonLoader.js
// - Loads assets (with placeholder generation) via systems/assets.js
// - Initializes GameState and mounts TitleScreen with New/Continue
// - Screen manager swaps to a stub TravelScreen

import { loadJSON, showInitError } from './systems/jsonLoader.js';
import { loadAssets } from './systems/assets.js';
import { GameState } from './state/GameState.js';
import { mountTitleScreen } from './ui/TitleScreen.js';
import { mountTravelScreen } from './ui/TravelScreen.js';

const app = document.getElementById('app');

// Simple screen manager: replaces app contents; keeps a teardown hook
const ScreenManager = (() => {
  let teardown = null;
  return {
    async show(mounter) {
      if (typeof teardown === 'function') {
        try { teardown(); } catch { /* no-op */ }
      }
      app.innerHTML = '';
      teardown = await mounter(app);
    }
  };
})();

async function init() {
  try {
    // 1) Load manifest and then assets
    // NOTE: Path is relative to systems/jsonLoader.js per the project constraint.
    const manifest = await loadJSON('../data/manifest.json');

    await loadAssets(manifest);

    // 2) Create game state (auto-load if present)
    const game = new GameState();
    const hasSave = GameState.hasSave();

    // 3) Title screen
    await ScreenManager.show((root) =>
      mountTitleScreen(root, {
        hasSave,
        onNewGame: () => {
          // Start with a secure/random seed by default
          const seed = GameState.randomSeed();
          console.log('[Canadian Trail] New Game with seed:', seed);
          game.startNewGame(seed);
          ScreenManager.show((r) => mountTravelScreen(r, { game, onBackToTitle: () => ScreenManager.show((rr) => mountTitleScreen(rr, {
            hasSave: GameState.hasSave(),
            onNewGame: () => {
              const newSeed = GameState.randomSeed();
              console.log('[Canadian Trail] New Game with seed:', newSeed);
              game.startNewGame(newSeed);
              ScreenManager.show((rrr) => mountTravelScreen(rrr, { game, onBackToTitle: () => ScreenManager.show((rrrr) => mountTitleScreen(rrrr, {
                hasSave: GameState.hasSave(),
                onNewGame: () => {/* recursion unlikely here */},
                onContinue: tryContinue
              })) }));
            },
            onContinue: tryContinue
          })) }));
        },
        onContinue: tryContinue
      })
    );

    function tryContinue() {
      try {
        game.continueGame();
        console.log('[Canadian Trail] Continue from save. Seed:', game.data.rngSeed);
        ScreenManager.show((r) => mountTravelScreen(r, { game, onBackToTitle: () => ScreenManager.show((rr) => mountTitleScreen(rr, {
          hasSave: GameState.hasSave(),
          onNewGame: () => {
            const seed = GameState.randomSeed();
            console.log('[Canadian Trail] New Game with seed:', seed);
            game.startNewGame(seed);
            ScreenManager.show((rrr) => mountTravelScreen(rrr, { game, onBackToTitle: () => ScreenManager.show((rrrr) => mountTitleScreen(rrrr, {
              hasSave: GameState.hasSave(),
              onNewGame: () => {},
              onContinue: tryContinue
            })) }));
          },
          onContinue: tryContinue
        })) }));
      } catch (err) {
        console.error('Continue failed:', err);
        showInitError('Could not load saved game. Starting a new one is recommended.');
      }
    }
  } catch (err) {
    console.error(err);
    showInitError(err);
  }
}

init();

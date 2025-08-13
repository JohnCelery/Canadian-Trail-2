// Canadian Trail — Phase 4 main entry
// Adds navigation to Landmark & Shop screens when you reach a location.

import { loadJSON, showInitError } from './systems/jsonLoader.js';
import { loadAssets } from './systems/assets.js';
import { GameState } from './state/GameState.js';
import { mountTitleScreen } from './ui/TitleScreen.js';
import { mountTravelScreen } from './ui/TravelScreen.js';
import { mountLandmarkScreen } from './ui/LandmarkScreen.js';
import { mountShopScreen } from './ui/ShopScreen.js';

const app = document.getElementById('app');

const ScreenManager = (() => {
  let teardown = null;
  return {
    async show(mounter) {
      if (typeof teardown === 'function') { try { teardown(); } catch {} }
      app.innerHTML = '';
      teardown = await mounter(app);
    }
  };
})();

async function init() {
  try {
    const manifest = await loadJSON('../data/manifest.json');
    await loadAssets(manifest);

    const game = new GameState();
    const hasSave = GameState.hasSave();

    const toTitle = () => {
      ScreenManager.show((root) =>
        mountTitleScreen(root, {
          hasSave: GameState.hasSave(),
          onNewGame: () => {
            const seed = GameState.randomSeed();
            console.log('[Canadian Trail] New Game with seed:', seed);
            game.startNewGame(seed);
            toTravel();
          },
          onContinue: () => {
            try {
              game.continueGame();
              console.log('[Canadian Trail] Continue from seed:', game.data.rngSeed);
              toTravel();
            } catch (err) {
              console.error('Continue failed:', err);
              showInitError('Could not load saved game. Starting a new one is recommended.');
            }
          }
        })
      );
    };

    const toTravel = () => {
      ScreenManager.show((root) =>
        mountTravelScreen(root, {
          game,
          onBackToTitle: toTitle,
          onReachLandmark: (landmark) => {
            // Persist "at landmark" already set by Travel; open screen
            toLandmark(landmark);
          }
        })
      );
    };

    const toLandmark = (landmark) => {
      ScreenManager.show((root) =>
        mountLandmarkScreen(root, {
          game,
          landmark,
          onOpenShop: () => toShop(landmark),
          onContinue: () => {
            // Clear flag and return to travel
            if (game.data.flags) delete game.data.flags.atLandmarkId;
            game.save();
            toTravel();
          }
        })
      );
    };

    const toShop = (landmark) => {
      ScreenManager.show((root) =>
        mountShopScreen(root, {
          game,
          landmark,
          onExit: () => toLandmark(landmark)
        })
      );
    };

    // First screen
    if (hasSave) {
      // Load so we can immediately continue if user chooses
      try { game.continueGame(); } catch {}
    }
    toTitle();
  } catch (err) {
    console.error(err);
    showInitError(err);
  }
}

init();

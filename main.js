// Canadian Trail — Phase 5 main entry
// Adds hazard crossings (rivers & Canadian obstacles) as a modal when a hazard landmark is reached.

import { loadJSON, showInitError } from './systems/jsonLoader.js';
import { loadAssets } from './systems/assets.js';
import { GameState } from './state/GameState.js';
import { mountTitleScreen } from './ui/TitleScreen.js';
import { mountTravelScreen } from './ui/TravelScreen.js';
import { mountLandmarkScreen } from './ui/LandmarkScreen.js';
import { mountShopScreen } from './ui/ShopScreen.js';
import { showRiverModal } from './ui/RiverModal.js';

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
          onReachLandmark: async (landmark) => {
            if (landmark.hazard && landmark.hazard.kind) {
              // Open hazard modal on top of Travel. If still blocked afterwards,
              // the parked flag keeps it reopening next time.
              await showRiverModal(landmark, { game });
              // If hazard cleared and services exist, optionally show the landmark card (shop etc.)
              if (!game.data.flags?.atLandmarkId && Array.isArray(landmark.services) && landmark.services.length) {
                toLandmark(landmark);
              }
            } else {
              toLandmark(landmark);
            }
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

    if (hasSave) {
      try { game.continueGame(); } catch {}
    }
    toTitle();
  } catch (err) {
    console.error(err);
    showInitError(err);
  }
}

init();

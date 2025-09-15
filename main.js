// Canadian Trail — Phase 6 main entry
// Adds Hunting screen and wires it from Travel; keeps Phase 5 hazard behavior.

import { loadJSON, showInitError } from './systems/jsonLoader.js';
import { loadAssets } from './systems/assets.js';
import { GameState } from './state/GameState.js';
import { mountTitleScreen } from './ui/TitleScreen.js';
import { mountTravelScreen } from './ui/TravelScreen.js';
import { mountLandmarkScreen } from './ui/LandmarkScreen.js';
import { mountShopScreen } from './ui/ShopScreen.js';
import { showRiverModal } from './ui/RiverModal.js';
import { mountHuntingScreen } from './ui/HuntingScreen.js';
import { mountEndScreen } from './ui/EndScreen.js';

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

    const toEnd = (details = {}) => {
      ScreenManager.show((root) =>
        mountEndScreen(root, {
          game,
          result: details,
          onPlayAgain: () => {
            const newSeed = GameState.randomSeed();
            console.log('[Canadian Trail] Play Again with seed:', newSeed);
            game.startNewGame(newSeed);
            toTravel();
          },
          onBackToTitle: () => toTitle()
        })
      );
    };

    const toTravel = () => {
      ScreenManager.show((root) =>
        mountTravelScreen(root, {
          game,
          onBackToTitle: toTitle,
          onHunt: () => toHunt(),
          onGameOver: (details) => toEnd(details),
          onReachLandmark: async (landmark) => {
            if (landmark.hazard && landmark.hazard.kind) {
              await showRiverModal(landmark, { game });
              if (game.data.flags?.atLandmarkId) return;

              let nextServiceId = game.data.flags?._followServiceId;
              if (nextServiceId) {
                delete game.data.flags._followServiceId;
                game.save();
              }
              if (!nextServiceId) {
                const all = await loadJSON('../data/landmarks.json');
                all.sort((a, b) => a.mile - b.mile);
                const trailing = all
                  .filter(l =>
                    l.mile > (landmark.mile || 0) &&
                    l.mile <= (game.data.miles || 0) &&
                    Array.isArray(l.services) && l.services.length
                  );
                nextServiceId = trailing.length ? trailing[trailing.length - 1].id : null;
              }
              if (nextServiceId) {
                const all = await loadJSON('../data/landmarks.json');
                const nextLm = all.find(l => l.id === nextServiceId);
                if (nextLm) { toLandmark(nextLm); return; }
              }
              if (Array.isArray(landmark.services) && landmark.services.length) {
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

    const toHunt = () => {
      ScreenManager.show((root) =>
        mountHuntingScreen(root, {
          game,
          onExit: () => toTravel()
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

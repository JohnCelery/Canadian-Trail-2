// Canadian Trail — Phase 5 (hotfix)
// - If a hazard and a service landmark are crossed in the same day, open the hazard modal first,
//   then automatically open the next service landmark that was also crossed that day.
// - Uses an optional transient hint flag (_followServiceId) set by TravelScreen for precision;
//   otherwise falls back to scanning landmarks by mile range.

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
              // Show the hazard modal
              await showRiverModal(landmark, { game });

              // If still blocked, the parked flag remains and we'll reopen next time.
              if (game.data.flags?.atLandmarkId) return;

              // If the Travel screen set a precise follow-up shop id, use it.
              let nextServiceId = game.data.flags?._followServiceId;
              if (nextServiceId) {
                delete game.data.flags._followServiceId;
                game.save();
              }

              // If we cleared the hazard and there is a service landmark also crossed today,
              // open it automatically. Prefer the hinted id, else scan by mile range.
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
                if (nextLm) {
                  toLandmark(nextLm);
                  return;
                }
              }

              // Otherwise, if this very hazard landmark happens to have services, open it.
              if (Array.isArray(landmark.services) && landmark.services.length) {
                toLandmark(landmark);
              }
              // Else just remain on Travel.
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

// ui/TitleScreen.js
// Renders the Title hero panel (CSS-only art), with New Game / Continue.
// Accessible, responsive; uses ARIA labels and focus management.

import { getImage, getMeta } from '../systems/assets.js';

export function mountTitleScreen(root, { hasSave, onNewGame, onContinue }) {
  // Layout
  const section = document.createElement('section');
  section.className = 'hero';
  section.setAttribute('aria-labelledby', 'title-heading');

  const content = document.createElement('div');
  content.className = 'hero__content';

  // Left column: title + actions
  const left = document.createElement('div');
  left.innerHTML = `
    <h1 id="title-heading">Canadian Trail</h1>
    <p>Lead your family westward across a hard country. Supplies are thin, weather is fickle, and luck is never free.</p>
    <div class="btn-row">
      <button class="btn" id="btn-new" aria-label="Start a new game">New Game</button>
      <button class="btn btn-secondary" id="btn-continue" aria-label="Continue saved game"${hasSave ? '' : ' disabled'}>Continue</button>
    </div>
    <div class="spacer"></div>
    <p class="muted" style="margin:0">
      Mobile‑first UI · Keyboard friendly · Seeded RNG · Placeholders auto‑generate
    </p>
  `;

  // Right column: logo/placeholder panel using manifest asset
  const right = document.createElement('div');
  right.className = 'hero__logo';
  right.setAttribute('role', 'img');
  right.setAttribute('aria-label', 'Game emblem placeholder');

  const emblemKey = 'ui.icon_tools';
  const emblem = getImage(emblemKey);
  const meta = getMeta(emblemKey);
  if (emblem && meta) {
    const img = document.createElement('img');
    img.alt = meta?.placeholder ? 'Placeholder emblem' : 'Game emblem';
    img.width = meta.w;
    img.height = meta.h;
    img.src = emblem.src;
    right.appendChild(img);
  } else {
    right.textContent = 'Logo';
  }

  content.append(left, right);
  section.appendChild(content);
  root.appendChild(section);

  // Wire buttons
  const btnNew = left.querySelector('#btn-new');
  const btnCont = left.querySelector('#btn-continue');

  btnNew.addEventListener('click', (e) => {
    e.preventDefault();
    onNewGame?.();
  });

  btnCont.addEventListener('click', (e) => {
    e.preventDefault();
    onContinue?.();
  });

  // Accessibility: move focus to main after mount
  queueMicrotask(() => {
    root.focus({ preventScroll: false });
  });

  // Teardown
  return () => {
    section.remove();
  };
}

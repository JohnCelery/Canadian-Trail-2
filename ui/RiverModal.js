// ui/RiverModal.js
// Single modal for all crossing hazards (rivers, mud, snow, geese, beaver).
// - Shows parameters and Canadian-flavored choices
// - Focus trap; Esc disabled (must choose or close via success/detour)
// - Deterministic outcomes via systems/river.js

import { getHazardState, listMethods, tryMethod } from '../systems/river.js';

export async function showRiverModal(landmark, { game }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('open', '');

    const backdrop = document.createElement('div');
    backdrop.className = 'modal__backdrop';
    modal.appendChild(backdrop);

    const dialog = document.createElement('div');
    dialog.className = 'modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h3');
    titleEl.id = 'river-title';
    dialog.appendChild(titleEl);
    dialog.setAttribute('aria-labelledby', titleEl.id);

    const statEl = document.createElement('p'); // parameters line
    statEl.className = 'muted mono';
    dialog.appendChild(statEl);

    const descEl = document.createElement('p');
    dialog.appendChild(descEl);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    dialog.appendChild(btnRow);

    const resultEl = document.createElement('p');
    resultEl.className = 'muted';
    dialog.appendChild(resultEl);

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const prevFocus = document.activeElement;

    function render() {
      const hz = getHazardState(game, landmark);

      titleEl.textContent = landmark.name;
      statEl.textContent = describeParams(hz);

      descEl.textContent = flavorIntro(hz);
      btnRow.innerHTML = '';

      const methods = listMethods(hz, game);
      for (const m of methods) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = m.label + (m.estHint || '');
        b.addEventListener('click', () => {
          const res = tryMethod(game, landmark, m.id);
          resultEl.textContent = res.text;
          if (res.resolved) {
            cleanup();
            resolve();
          } else {
            // Still blocked: rerender so hints/severity/params update
            render();
          }
        });
        btnRow.appendChild(b);
      }

      // focus the first button
      btnRow.querySelector('button')?.focus();
    }

    // focus trap + no escape
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        try { navigator.vibrate?.(30); } catch {}
      } else if (e.key === 'Tab') {
        const foci = Array.from(dialog.querySelectorAll('button'));
        if (!foci.length) return;
        const first = foci[0], last = foci[foci.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    function cleanup() {
      document.removeEventListener('keydown', onKey, true);
      modal.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    }

    document.addEventListener('keydown', onKey, true);
    render();
  });
}

function describeParams(hz) {
  switch (hz.kind) {
    case 'river': {
      const d = Number(hz.depthFt || 2).toFixed(1);
      const w = Number(hz.widthFt || 150).toFixed(0);
      const c = String(hz.current || 'moderate');
      return `Depth ${d} ft · Width ${w} ft · Current ${c}`;
    }
    case 'mud':   return `Gumbo badness ${Number(hz.badness ?? 0.6).toFixed(2)} (0 good → 1 awful)`;
    case 'snow':  return `Drift ${Number(hz.driftFt || 2).toFixed(1)} ft`;
    case 'geese': return `Flock ~${Number(hz.flock || 60).toFixed(0)} birds`;
    case 'beaver':return `Gap ~${Number(hz.gapFt || 8).toFixed(1)} ft (missing planks/washout)`;
  }
  return '';
}

function flavorIntro(hz) {
  switch (hz.kind) {
    case 'river':  return 'A proud ribbon of water insists the road ends here.';
    case 'mud':    return 'The prairie becomes glue. Locals call it gumbo with a straight face.';
    case 'snow':   return 'A wind‑packed drift squats across the highway like a sleeping mammoth.';
    case 'geese':  return 'Canada geese declare eminent domain and hiss in legalese.';
    case 'beaver': return 'A bridge meets beaver renovators; planks missing, water busy.';
  }
  return '';
}

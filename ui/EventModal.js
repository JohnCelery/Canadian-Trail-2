// ui/EventModal.js
// Accessible modal for multi-stage events.
// - Focus trap, Esc disabled (you must choose)
// - Uses eventEngine.renderStage() and eventEngine.choose()

import { renderStage, choose } from '../systems/eventEngine.js';

export function showEventModal(session, { game }) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('open', '');
    // Backdrop (click does nothing; must choose)
    const backdrop = document.createElement('div');
    backdrop.className = 'modal__backdrop';
    modal.appendChild(backdrop);

    const dialog = document.createElement('div');
    dialog.className = 'modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h3');
    titleEl.id = 'event-title';
    dialog.appendChild(titleEl);
    dialog.setAttribute('aria-labelledby', titleEl.id);

    const textEl = document.createElement('p');
    textEl.id = 'event-text';
    dialog.appendChild(textEl);
    dialog.setAttribute('aria-describedby', textEl.id);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    dialog.appendChild(btnRow);

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const prevFocus = document.activeElement;

    function render() {
      const view = renderStage(session, game);
      titleEl.textContent = view.title;
      textEl.textContent = view.text;
      btnRow.innerHTML = '';
      view.choices.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = c.label;
        if (c.disabled) {
          b.disabled = true;
          if (c.reason) b.title = c.reason;
        }
        b.addEventListener('click', () => {
          const res = choose(session, c.id, game);
          if (res.done) {
            cleanup();
            resolve();
          } else {
            render();
          }
        });
        btnRow.appendChild(b);
      });
      // focus first enabled button
      const first = btnRow.querySelector('button:not(:disabled)') || btnRow.querySelector('button');
      first?.focus();
    }

    // Basic focus trap
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        // No dismiss without choice; vibrate if available as feedback
        try { navigator.vibrate?.(40); } catch {}
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

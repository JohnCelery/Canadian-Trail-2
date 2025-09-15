// ui/TravelScreen.js — Phase 6
// Adds "Go Hunting" (one outing per day), while keeping hazard-first behavior.
// Hunting is disabled if: no bullets, already hunted today, or you're blocked at a hazard.

import { getImage, getMeta } from '../systems/assets.js';
import { loadJSON } from '../systems/jsonLoader.js';
import { applyTravelDay, applyRestDay, PACE, RATIONS, milesPerDay, RATIONS_LB } from '../systems/travel.js';

function milesPerDayForPace(pace) {
  return milesPerDay({ data: { settings: { pace } } });
}

export async function mountTravelScreen(root, { game, onBackToTitle, onReachLandmark, onHunt }) {
  const landmarks = await loadJSON('../data/landmarks.json');
  landmarks.sort((a, b) => a.mile - b.mile);
  const totalMiles = landmarks.length ? landmarks[landmarks.length - 1].mile : 1000;

  const wrap = document.createElement('div');
  wrap.className = 'grid-layout';

  const progressCard = document.createElement('section');
  progressCard.className = 'card';
  progressCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Journey</h2>
    <p class="muted" id="journey-sub"></p>

    <div class="progress" aria-label="Route progress">
      <div class="progress__bar" aria-hidden="true">
        <div class="progress__fill" id="progress-fill" style="width:0%"></div>
      </div>
      <div class="progress__labels">
        <span id="progress-left" class="mono"></span>
        <span id="progress-right" class="mono"></span>
      </div>
    </div>

    <div class="muted" id="next-landmark"></div>
  `;

  const controlsCard = document.createElement('section');
  controlsCard.className = 'card';
  controlsCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Daily Plan</h2>
    <form id="controls" class="controls" aria-label="Travel controls">
      <label>
        <span>Pace</span>
        <select id="pace">
          <option value="${PACE.STEADY}">Steady (${milesPerDayForPace(PACE.STEADY)} mi/day)</option>
          <option value="${PACE.STRENUOUS}">Strenuous (${milesPerDayForPace(PACE.STRENUOUS)} mi/day, -1 health/day)</option>
          <option value="${PACE.GRUELING}">Grueling (${milesPerDayForPace(PACE.GRUELING)} mi/day, -2 health/day)</option>
        </select>
      </label>

      <label>
        <span>Rations</span>
        <select id="rations">
          <option value="${RATIONS.MEAGER}">Meager (${RATIONS_LB[RATIONS.MEAGER]} lb/person/day)</option>
          <option value="${RATIONS.NORMAL}">Normal (${RATIONS_LB[RATIONS.NORMAL]} lb/person/day)</option>
          <option value="${RATIONS.GENEROUS}">Generous (${RATIONS_LB[RATIONS.GENEROUS]} lb/person/day)</option>
        </select>
      </label>

      <div class="btn-row">
        <button class="btn" id="btn-travel" aria-label="Travel one day">Travel 1 day</button>
        <button class="btn btn-secondary" id="btn-rest" aria-label="Rest one day" type="button">Rest 1 day</button>
        <button class="btn btn-outline" id="btn-hunt" aria-label="Go hunting (one outing per day)" type="button">Go Hunting</button>
        <button class="btn btn-outline" id="btn-title" aria-label="Back to title" type="button">Back to Title</button>
      </div>
    </form>
  `;

  const suppliesCard = document.createElement('section');
  suppliesCard.className = 'card';
  suppliesCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Supplies</h2>
    <div class="supplies-grid" id="supplies"></div>
    <div class="muted" id="spares"></div>
  `;

  const partyCard = document.createElement('section');
  partyCard.className = 'card';
  partyCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Party</h2>
    <div id="party-list" class="party-list"></div>
  `;

  const logCard = document.createElement('section');
  logCard.className = 'card';
  logCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Log</h2>
    <ol id="log" class="log" aria-live="polite"></ol>
  `;

  wrap.append(progressCard, controlsCard, suppliesCard, partyCard, logCard);
  root.appendChild(wrap);

  const paceSel = controlsCard.querySelector('#pace');
  const rationsSel = controlsCard.querySelector('#rations');
  const btnTravel = controlsCard.querySelector('#btn-travel');
  const btnRest = controlsCard.querySelector('#btn-rest');
  const btnHunt = controlsCard.querySelector('#btn-hunt');
  const btnTitle = controlsCard.querySelector('#btn-title');

  paceSel.value = game.data.settings?.pace || PACE.STEADY;
  rationsSel.value = game.data.settings?.rations || RATIONS.NORMAL;

  paceSel.addEventListener('change', () => {
    game.data.settings.pace = paceSel.value;
    game.save();
    render();
  });
  rationsSel.addEventListener('change', () => {
    game.data.settings.rations = rationsSel.value;
    game.save();
    render();
  });

  btnTitle.addEventListener('click', () => onBackToTitle?.());

  btnHunt.addEventListener('click', async (e) => {
    e.preventDefault();
    if (btnHunt.disabled) return;
    await onHunt?.(); // main.js handles screen swap; when we return, just refresh UI
    drawLog(); render();
  });

  btnTravel.addEventListener('click', async (e) => {
    e.preventDefault();
    if (journeyComplete()) return;

    const beforeMiles = game.data.miles;
    const summary = applyTravelDay(game);

    const crossed = landmarksCrossed(landmarks, beforeMiles, game.data.miles);
    for (const lm of crossed) game.data.log.push(`Reached ${lm.name}.`);

    const starv = summary.starvation ? ' Short on food.' : ' A full meal.';
    game.data.log.push(`Day ${game.data.day - 1}: Traveled ${fmtMiles(summary.milesTraveled)}. Ate ${fmtLb(summary.foodConsumed)}.${starv} Health ${fmtSigned(summary.healthDelta)}.`);
    game.save();
    drawLog(); render();

    await maybeOpenEvent();

    if (crossed.length) {
      const firstHazard = crossed.find(l => l.hazard && l.hazard.kind);
      const lmToOpen = firstHazard ?? crossed[crossed.length - 1];

      if (firstHazard) {
        const trailingService = crossed
          .filter(l => l.mile > firstHazard.mile && Array.isArray(l.services) && l.services.length)
          .slice(-1)[0];
        if (trailingService) {
          game.data.flags._followServiceId = trailingService.id;
        }
      }

      game.data.flags.atLandmarkId = lmToOpen.id;
      game.save();
      onReachLandmark?.(lmToOpen);
    }
  });

  btnRest.addEventListener('click', async (e) => {
    e.preventDefault();
    if (journeyComplete()) return;
    const summary = applyRestDay(game);
    const starv = summary.starvation ? ' Short on food.' : ' A full meal.';
    game.data.log.push(`Day ${game.data.day - 1}: Rested. Ate ${fmtLb(summary.foodConsumed)}.${starv} Health ${fmtSigned(summary.healthDelta)}.`);
    game.save();
    drawLog(); render();

    await maybeOpenEvent();
  });

  async function maybeOpenEvent() {
    const { maybeTriggerEvent } = await import('../systems/eventEngine.js');
    const session = await maybeTriggerEvent(game);
    if (!session) return;
    const { showEventModal } = await import('./EventModal.js');
    await showEventModal(session, { game });
    game.save();
    drawLog(); render();
  }

  function render() {
    const miles = Math.min(game.data.miles, totalMiles);
    const pct = Math.max(0, Math.min(100, (miles / totalMiles) * 100));
    progressCard.querySelector('#journey-sub').textContent =
      `Day ${game.data.day ?? 1} · ${fmtMiles(miles)} / ${fmtMiles(totalMiles)} (${pct.toFixed(1)}%)`;

    progressCard.querySelector('#progress-fill').style.width = `${pct}%`;
    progressCard.querySelector('#progress-left').textContent = `${fmtMiles(0)}`;
    progressCard.querySelector('#progress-right').textContent = `${fmtMiles(totalMiles)}`;

    const next = nextLandmark(landmarks, miles);
    const nl = progressCard.querySelector('#next-landmark');
    if (next) {
      const dist = Math.max(0, next.mile - miles);
      nl.textContent = `Next: ${next.name} in ${fmtMiles(dist)} (mile ${next.mile}).`;
    } else {
      nl.textContent = 'Journey complete (more content unlocks in later phases).';
    }

    const sup = suppliesCard.querySelector('#supplies');
    sup.innerHTML = '';
    sup.append(
      supplyItem('ui.icon_money',   'Money ($)', game.data.money ?? 0),
      supplyItem('ui.icon_food',    'Food (lb)', game.data.inventory.food),
      supplyItem('ui.icon_bullets', 'Bullets',   game.data.inventory.bullets),
      supplyItem('ui.icon_clothes', 'Clothes',   game.data.inventory.clothes)
    );
    const spares = suppliesCard.querySelector('#spares');
    spares.textContent = `Spare parts — Wheels: ${game.data.inventory.wheel ?? 0}, Axles: ${game.data.inventory.axle ?? 0}, Tongues: ${game.data.inventory.tongue ?? 0}`;

    const list = partyCard.querySelector('#party-list');
    list.innerHTML = '';
    for (const m of game.data.party) {
      const row = document.createElement('div');
      row.className = 'party-row';
      row.innerHTML = `
        <div class="party-name">
          <strong>${escapeHTML(m.name)}</strong>
          <span class="muted">${m.role}${m.age ? ` · ${m.age}` : ''}${m.status === 'dead' ? ' · ☠︎' : ''}</span>
        </div>
        <div class="party-health">
          <label class="visually-hidden" for="meter-${m.id}">Health of ${escapeHTML(m.name)}</label>
          <meter id="meter-${m.id}" min="0" max="5" low="2" high="4" optimum="5" value="${m.health ?? 5}"></meter>
          <span class="mono">${m.health ?? 5}/5</span>
        </div>
      `;
      list.appendChild(row);
    }

    const completed = journeyComplete();
    btnTravel.disabled = completed || (game.data.party || []).every(p => p.status === 'dead');

    // Hunting gating
    const huntedToday = Number(game.data.flags?.lastHuntDay || 0) === Number(game.data.day || 1);
    const atHazard = !!game.data.flags?.atLandmarkId;
    const bullets = Number(game.data.inventory.bullets || 0);
    btnHunt.disabled = huntedToday || atHazard || bullets <= 0;
    btnHunt.title = huntedToday ? 'You already hunted today.' :
                    atHazard ? 'Clear the obstacle first.' :
                    bullets <= 0 ? 'No bullets remaining.' : 'Go hunting (30s)';
  }

  function journeyComplete() {
    return game.data.miles >= totalMiles;
  }

  function drawLog() {
    const logEl = logCard.querySelector('#log');
    logEl.innerHTML = '';
    const last = game.data.log.slice(-20);
    for (const item of last) {
      const li = document.createElement('li');
      li.textContent = item;
      logEl.appendChild(li);
    }
  }

  function nextLandmark(lms, miles) {
    return lms.find(l => l.mile > miles) || null;
  }
  function landmarksCrossed(lms, from, to) {
    return lms.filter(l => l.mile > from && l.mile <= to);
  }

  function supplyItem(key, label, value) {
    const meta = getMeta(key);
    const img = getImage(key);
    const el = document.createElement('div');
    el.className = 'supply';
    const pic = document.createElement('div');
    pic.className = 'supply__pic';
    if (img && meta) {
      const tag = document.createElement('img');
      tag.alt = meta.placeholder ? `${label} (placeholder)` : label;
      tag.width = meta.w; tag.height = meta.h; tag.src = img.src;
      pic.appendChild(tag);
    } else {
      pic.textContent = '—';
    }
    const txt = document.createElement('div');
    txt.className = 'supply__text';
    txt.innerHTML = `<div class="muted">${escapeHTML(label)}</div><div class="mono">${fmtNumber(value)}</div>`;
    el.append(pic, txt);
    return el;
  }

  function fmtMiles(n) { return `${Number(n).toFixed(0)} mi`; }
  function fmtLb(n)    { return `${Number(n).toFixed(1)} lb`; }
  function fmtNumber(n){ return `${Number(n ?? 0).toLocaleString()}`; }
  function fmtSigned(n){ return `${n >= 0 ? '+' : ''}${n}`; }
  function escapeHTML(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // Initial render + reopen if parked at a landmark
  if (!game.data.flags?.phase2_init_logged) {
    const here = landmarks.find(l => l.mile <= 0) ?? { name: 'the trailhead', mile: 0 };
    game.data.log.push(`Setting out from ${here.name}.`);
    game.data.flags.phase2_init_logged = true;
    game.save();
  }
  drawLog();
  render();

  const parkedId = game.data.flags?.atLandmarkId;
  if (parkedId) {
    const lm = landmarks.find(l => l.id === parkedId);
    if (lm) onReachLandmark?.(lm);
  }

  return () => wrap.remove();
}

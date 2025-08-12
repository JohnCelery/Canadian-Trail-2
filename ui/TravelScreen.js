// ui/TravelScreen.js — Phase 3
// Adds Advanced Event Engine integration:
// - After each Travel/Rest day, may open an event modal (weighted, gated, seeded).
// - Logs outcomes; applies effects to inventory/health/money/etc.

import { getImage, getMeta } from '../systems/assets.js';
import { loadJSON } from '../systems/jsonLoader.js';
import { applyTravelDay, applyRestDay, PACE, RATIONS, milesPerDay, RATIONS_LB } from '../systems/travel.js';
import { maybeTriggerEvent } from '../systems/eventEngine.js';
import { showEventModal } from './EventModal.js';

export async function mountTravelScreen(root, { game, onBackToTitle }) {
  // Load route data
  const landmarks = await loadJSON('../data/landmarks.json');
  landmarks.sort((a, b) => a.mile - b.mile);
  const totalMiles = landmarks.length ? landmarks[landmarks.length - 1].mile : 1000;

  // DOM skeleton
  const wrap = document.createElement('div');
  wrap.className = 'grid-layout';

  // Header / Progress
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

  // Controls
  const controlsCard = document.createElement('section');
  controlsCard.className = 'card';
  controlsCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Daily Plan</h2>
    <form id="controls" class="controls" aria-label="Travel controls">
      <label>
        <span>Pace</span>
        <select id="pace">
          <option value="${PACE.steady}">Steady (${milesPerDay(PACE.steady)} mi/day)</option>
          <option value="${PACE.strenuous}">Strenuous (${milesPerDay(PACE.strenuous)} mi/day, -1 health/day)</option>
          <option value="${PACE.grueling}">Grueling (${milesPerDay(PACE.grueling)} mi/day, -2 health/day)</option>
        </select>
      </label>

      <label>
        <span>Rations</span>
        <select id="rations">
          <option value="${RATIONS.meager}">Meager (${RATIONS_LB.meager} lb/person/day)</option>
          <option value="${RATIONS.normal}">Normal (${RATIONS_LB.normal} lb/person/day)</option>
          <option value="${RATIONS.generous}">Generous (${RATIONS_LB.generous} lb/person/day)</option>
        </select>
      </label>

      <div class="btn-row">
        <button class="btn" id="btn-travel" aria-label="Travel one day">Travel 1 day</button>
        <button class="btn btn-secondary" id="btn-rest" aria-label="Rest one day" type="button">Rest 1 day</button>
        <button class="btn btn-outline" id="btn-title" aria-label="Back to title" type="button">Back to Title</button>
      </div>
    </form>
  `;

  // Supplies
  const suppliesCard = document.createElement('section');
  suppliesCard.className = 'card';
  suppliesCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Supplies</h2>
    <div class="supplies-grid" id="supplies"></div>
    <div class="muted" id="spares"></div>
  `;

  // Party
  const partyCard = document.createElement('section');
  partyCard.className = 'card';
  partyCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Party</h2>
    <div id="party-list" class="party-list"></div>
  `;

  // Log
  const logCard = document.createElement('section');
  logCard.className = 'card';
  logCard.innerHTML = `
    <h2 style="margin-bottom:0.5rem">Log</h2>
    <ol id="log" class="log" aria-live="polite"></ol>
  `;

  wrap.append(progressCard, controlsCard, suppliesCard, partyCard, logCard);
  root.appendChild(wrap);

  // Wire up control widgets
  const paceSel = controlsCard.querySelector('#pace');
  const rationsSel = controlsCard.querySelector('#rations');
  const btnTravel = controlsCard.querySelector('#btn-travel');
  const btnRest = controlsCard.querySelector('#btn-rest');
  const btnTitle = controlsCard.querySelector('#btn-title');

  paceSel.value = game.data.settings?.pace || PACE.steady;
  rationsSel.value = game.data.settings?.rations || RATIONS.normal;

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

  btnTravel.addEventListener('click', async (e) => {
    e.preventDefault();
    if (journeyComplete()) return;
    const beforeMiles = game.data.miles;
    const summary = applyTravelDay(game);

    // Landmarks reached this day
    const crossed = landmarksCrossed(landmarks, beforeMiles, game.data.miles);
    for (const lm of crossed) addLog(`Reached ${lm.name}.`);

    const starv = summary.starvation ? ' Short on food.' : ' A full meal.';
    addLog(`Day ${game.data.day - 1}: Traveled ${fmtMiles(summary.milesTraveled)}. Ate ${fmtLb(summary.foodConsumed)}.${starv} Health ${fmtSigned(summary.healthDelta)}.`);
    game.save();
    render();

    // Maybe open an event
    await maybeOpenEvent();
  });

  btnRest.addEventListener('click', async (e) => {
    e.preventDefault();
    if (journeyComplete()) return;
    const summary = applyRestDay(game);
    const starv = summary.starvation ? ' Short on food.' : ' A full meal.';
    addLog(`Day ${game.data.day - 1}: Rested. Ate ${fmtLb(summary.foodConsumed)}.${starv} Health ${fmtSigned(summary.healthDelta)}.`);
    game.save();
    render();

    // Maybe open an event
    await maybeOpenEvent();
  });

  async function maybeOpenEvent() {
    const session = await maybeTriggerEvent(game);
    if (!session) return;
    await showEventModal(session, { game });
    // Event may have changed state; re-render and show any fresh log lines
    game.save();
    drawLog();
    render();
  }

  // ---------- render ----------
  function render() {
    // Header / progress
    const miles = Math.min(game.data.miles, totalMiles);
    const pct = Math.max(0, Math.min(100, (miles / totalMiles) * 100));
    progressCard.querySelector('#journey-sub').textContent =
      `Day ${game.data.day ?? 1} · ${fmtMiles(miles)} / ${fmtMiles(totalMiles)} (${pct.toFixed(1)}%)`;

    progressCard.querySelector('#progress-fill').style.width = `${pct}%`;
    progressCard.querySelector('#progress-left').textContent = `${fmtMiles(0)}`;
    progressCard.querySelector('#progress-right').textContent = `${fmtMiles(totalMiles)}`;

    // Next landmark
    const next = nextLandmark(landmarks, miles);
    const nl = progressCard.querySelector('#next-landmark');
    if (next) {
      const dist = Math.max(0, next.mile - miles);
      nl.textContent = `Next: ${next.name} in ${fmtMiles(dist)} (mile ${next.mile}).`;
    } else {
      nl.textContent = 'Journey complete (more content unlocks in later phases).';
    }

    // Supplies (added Money row)
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

    // Party
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

    // Travel enabled?
    const completed = journeyComplete();
    btnTravel.disabled = completed || (game.data.party || []).every(p => p.status === 'dead');
  }

  function journeyComplete() {
    return game.data.miles >= totalMiles;
  }

  function addLog(line) {
    game.data.log.push(line);
    if (game.data.log.length > 200) game.data.log.splice(0, game.data.log.length - 200);
    drawLog();
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

  // Utilities (landmarks)
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

  // Formatters
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

  // Initial render
  if (!game.data.flags?.phase2_init_logged) {
    const here = nextLandmark(landmarks, -1) ?? { name: 'the trailhead', mile: 0 };
    addLog(`Setting out from ${here.name}.`);
    game.data.flags.phase2_init_logged = true;
    game.save();
  }
  drawLog();
  render();

  return () => wrap.remove();
}

// ui/EndScreen.js
// Polished end-of-journey summary screen with score, party memorials, and log recap.

import { loadJSON } from '../systems/jsonLoader.js';

export async function mountEndScreen(root, { game, result = {}, onPlayAgain, onBackToTitle } = {}) {
  const data = game?.data ?? {};
  const party = Array.isArray(data.party) ? data.party : [];
  const inventory = typeof data.inventory === 'object' && data.inventory !== null ? data.inventory : {};
  const epitaphs = typeof data.epitaphs === 'object' && data.epitaphs !== null ? data.epitaphs : {};

  const daysOnTrail = Math.max(0, (Number(data.day) || 1) - 1);
  const milesTraveled = Math.max(0, Math.round(Number(data.miles) || 0));
  const moneyRemaining = Math.max(0, Math.round(Number(data.money) || 0));

  let totalMiles = Number(result.totalMiles ?? data.flags?.gameOver?.totalMiles);
  if (!Number.isFinite(totalMiles) || totalMiles <= 0) {
    try {
      const landmarks = await loadJSON('../data/landmarks.json');
      if (Array.isArray(landmarks) && landmarks.length) {
        totalMiles = Math.max(...landmarks.map(l => Number(l.mile) || 0));
      }
    } catch { /* ignore and fall back */ }
  }
  if (!Number.isFinite(totalMiles) || totalMiles <= 0) totalMiles = milesTraveled || 1;

  const survivors = party.filter(p => p.status !== 'dead');
  const casualties = party.filter(p => p.status === 'dead');

  const reasonKey = result.reason || data.flags?.gameOver?.reason || (survivors.length ? 'completed' : 'party_dead');
  const heading = reasonKey === 'completed' ? 'Trail Complete' : 'Journey Lost';

  const finalDayNumber = Math.max(1, Number(data.day) || 1);
  const survivorText = survivors.length === 0
    ? 'no survivors'
    : survivors.length === 1
      ? '1 survivor'
      : `${formatNumber(survivors.length)} survivors`;
  const dayText = `${formatNumber(daysOnTrail)} day${daysOnTrail === 1 ? '' : 's'}`;

  let blurb = '';
  if (reasonKey === 'completed') {
    blurb = `Your family reached the end on day ${formatNumber(finalDayNumber)} after ${dayText}, with ${survivorText}.`;
  } else {
    blurb = `The trail claimed every traveler on day ${formatNumber(finalDayNumber)}.`;
  }

  const percentComplete = Math.max(0, Math.min(100, (totalMiles > 0 ? (milesTraveled / totalMiles) * 100 : 0)));

  const scoreParts = computeScore(data, { totalMiles });

  const wrap = document.createElement('section');
  wrap.className = 'end-screen';
  wrap.setAttribute('aria-labelledby', 'end-heading');
  wrap.tabIndex = -1;

  const hero = document.createElement('header');
  hero.className = 'card end-screen__hero';
  hero.innerHTML = `
    <h1 id="end-heading">${escapeHTML(heading)}</h1>
    <p class="end-screen__tagline">${escapeHTML(blurb)}</p>
    <div class="end-score" role="group" aria-labelledby="end-score-label">
      <span class="end-score__label" id="end-score-label">Final Score</span>
      <span class="end-score__value">${formatNumber(scoreParts.total)}</span>
    </div>
    <div class="btn-row end-screen__actions">
      <button class="btn" id="btn-again">Play Again</button>
      <button class="btn btn-secondary" id="btn-title">Back to Title</button>
    </div>
  `;

  const summaryCard = document.createElement('section');
  summaryCard.className = 'card end-card end-summary';
  summaryCard.innerHTML = `
    <h2>Journey Summary</h2>
    <div class="end-summary__grid">
      ${statBlock('Days on trail', formatNumber(daysOnTrail))}
      ${statBlock('Miles traveled', `${formatNumber(milesTraveled)} / ${formatNumber(Math.round(totalMiles))}`)}
      ${statBlock('Completion', `${percentComplete.toFixed(1)}%`)}
      ${statBlock('Money remaining', `$${formatNumber(moneyRemaining)}`)}
    </div>
    <div class="end-summary__supplies">
      <h3>Remaining supplies</h3>
      <ul class="end-summary__supplies-list">
        ${supplyLine('Food', `${formatNumber(Math.round(inventory.food || 0))} lb`)}
        ${supplyLine('Bullets', formatNumber(Math.round(inventory.bullets || 0)))}
        ${supplyLine('Clothes', formatNumber(Math.round(inventory.clothes || 0)))}
        ${supplyLine('Medicine', formatNumber(Math.round(inventory.medicine || 0)))}
        ${supplyLine('Wagon wheels', formatNumber(Math.round(inventory.wheel || 0)))}
        ${supplyLine('Axles', formatNumber(Math.round(inventory.axle || 0)))}
        ${supplyLine('Tongues', formatNumber(Math.round(inventory.tongue || 0)))}
      </ul>
    </div>
    <div class="end-summary__breakdown">
      <h3>Score breakdown</h3>
      <ul>
        ${breakdownLine('Trail miles ×10', scoreParts.base, '+')}
        ${breakdownLine('Survivors ×1200', scoreParts.aliveBonus, '+')}
        ${breakdownLine('Cash ×6', scoreParts.cashBonus, '+')}
        ${breakdownLine('Supplies value', scoreParts.suppliesValue, '+')}
        ${scoreParts.dayPenalty ? breakdownLine('Slow travel penalty', scoreParts.dayPenalty, '-') : ''}
        ${scoreParts.casualtyPenalty ? breakdownLine('Casualties penalty', scoreParts.casualtyPenalty, '-') : ''}
      </ul>
    </div>
  `;

  const partyCard = document.createElement('section');
  partyCard.className = 'card end-card end-party';
  partyCard.innerHTML = '<h2>Party Outcomes</h2>';
  const partyGrid = document.createElement('div');
  partyGrid.className = 'end-party__grid';
  if (!party.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No party records available.';
    partyCard.appendChild(empty);
  } else {
    for (const member of party) {
      const alive = member.status !== 'dead';
      const article = document.createElement('article');
      article.className = `end-party__member ${alive ? 'is-alive' : 'is-dead'}`;
      const roleBits = [member.role, member.age ? `${member.age}` : null].filter(Boolean).join(' · ');
      const status = alive
        ? `Survived with ${Number(member.health ?? 0)}/5 health.`
        : 'Died on the trail.';
      article.innerHTML = `
        <div class="end-party__icon" aria-hidden="true">${alive ? '🧭' : '🪦'}</div>
        <div class="end-party__body">
          <div class="end-party__name">${escapeHTML(member.name || 'Unknown')}</div>
          <div class="end-party__meta muted">${escapeHTML(roleBits || 'Traveler')}</div>
          <div class="end-party__status">${escapeHTML(status)}</div>
          ${alive ? '' : `<blockquote class="end-party__epitaph">“${escapeHTML(epitaphs[member.id] || 'No epitaph recorded.') }”</blockquote>`}
        </div>
      `;
      partyGrid.appendChild(article);
    }
    partyCard.appendChild(partyGrid);
  }

  const logCard = document.createElement('section');
  logCard.className = 'card end-card end-log';
  logCard.innerHTML = '<h2>Trail Log Highlights</h2>';
  const logList = document.createElement('ol');
  logList.className = 'end-log__list';
  const highlights = (Array.isArray(data.log) ? data.log : []).slice(-10);
  if (highlights.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No log entries recorded.';
    logList.appendChild(li);
  } else {
    for (const entry of highlights) {
      const li = document.createElement('li');
      li.textContent = entry;
      logList.appendChild(li);
    }
  }
  logCard.appendChild(logList);

  wrap.append(hero, summaryCard, partyCard, logCard);
  root.appendChild(wrap);

  const btnAgain = hero.querySelector('#btn-again');
  const btnTitle = hero.querySelector('#btn-title');
  btnAgain?.addEventListener('click', (e) => {
    e.preventDefault();
    onPlayAgain?.();
  });
  btnTitle?.addEventListener('click', (e) => {
    e.preventDefault();
    onBackToTitle?.();
  });

  queueMicrotask(() => {
    try { wrap.focus(); } catch { /* ignore */ }
  });

  return () => {
    wrap.remove();
  };
}

function computeScore(data, { totalMiles }) {
  const miles = Math.max(0, Math.round(Number(data.miles) || 0));
  const days = Math.max(0, (Number(data.day) || 1) - 1);
  const party = Array.isArray(data.party) ? data.party : [];
  const survivors = party.filter(p => p.status !== 'dead').length;
  const casualties = Math.max(0, party.length - survivors);
  const money = Math.max(0, Math.round(Number(data.money) || 0));
  const inv = typeof data.inventory === 'object' && data.inventory !== null ? data.inventory : {};

  const suppliesValue = Math.round(
    Math.max(0, Number(inv.food) || 0) * 1.2 +
    Math.max(0, Number(inv.bullets) || 0) * 2 +
    Math.max(0, Number(inv.clothes) || 0) * 75 +
    (Math.max(0, Number(inv.wheel) || 0) + Math.max(0, Number(inv.axle) || 0) + Math.max(0, Number(inv.tongue) || 0)) * 60 +
    Math.max(0, Number(inv.medicine) || 0) * 85
  );

  const base = miles * 10;
  const aliveBonus = survivors * 1200;
  const cashBonus = money * 6;
  const expectedDays = Math.max(0, Math.round((totalMiles > 0 ? totalMiles : miles) / 12));
  const dayPenalty = Math.max(0, (days - expectedDays) * 15);
  const casualtyPenalty = casualties * 500;
  const total = Math.max(0, base + aliveBonus + cashBonus + suppliesValue - dayPenalty - casualtyPenalty);

  return { total, base, aliveBonus, cashBonus, suppliesValue, dayPenalty, casualtyPenalty };
}

function statBlock(label, value) {
  return `
    <div class="end-summary__stat">
      <div class="end-summary__stat-label">${escapeHTML(label)}</div>
      <div class="end-summary__stat-value">${escapeHTML(value)}</div>
    </div>
  `;
}

function supplyLine(label, value) {
  return `
    <li class="end-summary__supply"><span>${escapeHTML(label)}</span><span class="mono">${escapeHTML(value)}</span></li>
  `;
}

function breakdownLine(label, value, sign) {
  const prefix = sign === '-' ? '−' : '+';
  return `
    <li class="end-summary__break-item">
      <span>${escapeHTML(label)}</span>
      <span class="mono">${prefix}${formatNumber(value)}</span>
    </li>
  `;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

function escapeHTML(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

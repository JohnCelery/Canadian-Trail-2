// systems/landmarks.js
// Lightweight helpers for working with landmarks

import { loadJSON } from './jsonLoader.js';

export async function loadLandmarks() {
  const lms = await loadJSON('../data/landmarks.json');
  lms.sort((a, b) => a.mile - b.mile);
  return lms;
}

export function totalTrailMiles(landmarks) {
  return landmarks.length ? Number(landmarks[landmarks.length - 1].mile || 0) : 1000;
}

export function findLandmarkById(landmarks, id) {
  return landmarks.find(l => l.id === id) || null;
}

export function servicesFor(landmark) {
  return new Set(landmark?.services || []);
}

import { DEFAULT_TUNING } from './physics.js';

const KEY = 'kart.hostTuning';

export const KART_CONTROLS = [
  { key: 'speed', label: 'Speed', min: 0.7, max: 1.4, step: 0.05 },
  { key: 'turn', label: 'Turning', min: 0.3, max: 1.5, step: 0.05 },
  { key: 'driftTurn', label: 'Drift sensitivity', min: 0.3, max: 1.5, step: 0.05 },
  { key: 'driftLevel', label: 'Drift level change', min: 0.5, max: 2, step: 0.05 },
  { key: 'driftBoost', label: 'Drift boost', min: 0.5, max: 2, step: 0.05 },
];

export function clampKartTuning(raw) {
  const tuning = {};
  for (const { key, min, max } of KART_CONTROLS) {
    const value = Number(raw?.[key]);
    tuning[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : DEFAULT_TUNING[key];
  }
  return tuning;
}

export function loadKartTuning() {
  try {
    return clampKartTuning(JSON.parse(localStorage.getItem(KEY)));
  } catch (_) {
    return clampKartTuning(null);
  }
}

export function saveKartTuning(tuning) {
  try {
    localStorage.setItem(KEY, JSON.stringify(clampKartTuning(tuning)));
  } catch (_) {}
}

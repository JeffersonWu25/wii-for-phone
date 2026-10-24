const STORAGE_KEY = 'bowling.tuning';

const percent = (value) => `${Math.round(value * 100)}%`;
const multiplier = (value) => `${value.toFixed(2)}×`;
export const TUNING_CONTROLS = [
  { key: 'speed', label: 'Speed', min: 0.6, max: 1.5, step: 0.05, fallback: 1, format: percent },
];

// Phone-only. Both are applied before the throw is sent.
// tilt scales the starting slant. curve scales how much a twist becomes hook.
export const TILT_CONTROLS = [
  { key: 'tilt', label: 'Tilt', min: 0.5, max: 2.5, step: 0.05, fallback: 1, format: multiplier },
  { key: 'curve', label: 'Curve', min: 0.25, max: 2.5, step: 0.05, fallback: 1, format: multiplier },
];

export const FEEL_CONTROLS = [...TUNING_CONTROLS, ...TILT_CONTROLS];

export function clampTuning(raw) {
  const tuning = {};
  for (const { key, min, max, fallback } of FEEL_CONTROLS) {
    const value = Number(raw?.[key]);
    tuning[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }
  return tuning;
}

export function loadTuning() {
  try {
    return clampTuning(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (_) {
    return clampTuning(null);
  }
}

export function saveTuning(tuning) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampTuning(tuning)));
  } catch (_) {}
}

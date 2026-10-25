const STORAGE_KEY = 'bowling.tuning';

const percent = (value) => `${Math.round(value * 100)}%`;
const multiplier = (value) => `${value.toFixed(2)}×`;
const meters = (value) => `${value.toFixed(2)} m`;

export const TUNING_CONTROLS = [
  { key: 'speed', label: 'Speed', min: 0.6, max: 1.5, step: 0.05, fallback: 1, format: percent },
];

export const TILT_CONTROLS = [
  { key: 'tilt', label: 'Tilt', min: 0.5, max: 2.5, step: 0.05, fallback: 1, format: multiplier },
  { key: 'curve', label: 'Curve', min: 0.5, max: 5, step: 0.1, fallback: 2, format: multiplier },
  { key: 'maxCurve', label: 'Max Curve', min: 0.15, max: 1.2, step: 0.05, fallback: 0.45, format: meters },
];

export const FEEL_CONTROLS = [...TUNING_CONTROLS, ...TILT_CONTROLS];

export function clampTuning(raw) {
  const tuning = {};
  for (const { key, min, max, fallback } of FEEL_CONTROLS) {
    const stored = key === 'maxCurve' && raw?.maxCurve == null ? raw?.maxTwist : raw?.[key];
    const value = Number(stored);
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

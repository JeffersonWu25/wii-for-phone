const HOST_FEEL_KEY = 'bowling.hostFeel';

export const FEEL_CONTROLS = [
  { key: 'speed', label: 'Speed', min: 0.6, max: 1.5, step: 0.05, fallback: 1 },
  { key: 'tilt', label: 'Tilt', min: 0.5, max: 2.5, step: 0.05, fallback: 1.75 },
  { key: 'curve', label: 'Curve', min: 0.5, max: 5, step: 0.05, fallback: 1.6 },
  { key: 'maxCurve', label: 'Max Curve', min: 0.15, max: 1.2, step: 0.05, fallback: 0.65 },
];

export const TUNING_CONTROLS = FEEL_CONTROLS.filter((control) => control.key === 'speed');

export function clampTuning(raw) {
  const tuning = {};
  for (const { key, min, max, fallback } of FEEL_CONTROLS) {
    const stored = key === 'maxCurve' && raw?.maxCurve == null ? raw?.maxTwist : raw?.[key];
    const value = Number(stored);
    tuning[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }
  return tuning;
}

export function loadHostFeel() {
  try {
    return clampTuning(JSON.parse(localStorage.getItem(HOST_FEEL_KEY)));
  } catch (_) {
    return clampTuning(null);
  }
}

export function saveHostFeel(tuning) {
  try {
    localStorage.setItem(HOST_FEEL_KEY, JSON.stringify(clampTuning(tuning)));
  } catch (_) {}
}

export const DEFAULT_TUNING = Object.freeze({
  timingWindowMs: 180,
  interceptLead: 0.22,
  moveSpeed: 11,
  walkSpeed: 4,
  accel: 45,
  reach: 1.75,
  reachY: 3.2,
  directionSensitivity: 1,
  powerSensitivity: 1,
  swingCooldown: 0.28,
  lobSlice: 1,
  cpuDifficulty: 1,
  volleyPriority: true,
});

const LIMITS = {
  timingWindowMs: [40, 400],
  interceptLead: [0, 0.8],
  moveSpeed: [4, 16],
  walkSpeed: [1, 8],
  accel: [10, 80],
  reach: [0.6, 3.5],
  reachY: [1.5, 4.5],
  directionSensitivity: [0, 2.5],
  powerSensitivity: [0.2, 2],
  swingCooldown: [0, 1.2],
  lobSlice: [0, 2],
  cpuDifficulty: [0, 1],
};

let current = { ...DEFAULT_TUNING };

export function getTuning() {
  return { ...current };
}

export function setTuning(partial) {
  if (!partial || typeof partial !== 'object') return getTuning();
  for (const key of Object.keys(DEFAULT_TUNING)) {
    if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
    if (key === 'volleyPriority') {
      current[key] = Boolean(partial[key]);
      continue;
    }
    const value = Number(partial[key]);
    if (!Number.isFinite(value)) continue;
    const [lo, hi] = LIMITS[key];
    current[key] = Math.min(hi, Math.max(lo, value));
  }
  return getTuning();
}

export function resetTuning() {
  current = { ...DEFAULT_TUNING };
  return getTuning();
}

const G = 9.81;
const POWER_NOISE = 2.5;
const POWER_FULL = 28;
const MAX_CURVE_M = 0.45;

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function powerFromSwing(samples) {
  if (!samples || samples.length === 0) return 0.5;

  let peakMag = 0;
  for (const sample of samples) {
    const mag = Math.hypot(num(sample.ax), num(sample.ay), num(sample.az));
    if (mag > peakMag) peakMag = mag;
  }

  const excess = Math.max(0, peakMag - G);
  return clamp((excess - POWER_NOISE) / POWER_FULL, 0, 1);
}

export function tiltForThrow({ pressLean, releaseLean }) {
  const lean = clamp(num(releaseLean), -1, 1);
  return {
    angle: clamp(num(pressLean), -1, 1),
    hookM: lean * MAX_CURVE_M,
  };
}

export function composeThrow({ samples, aim, tilt, tuning }) {
  return {
    type: 'throw',
    power: powerFromSwing(samples),
    aim: { offset: aim.offset, angle: aim.angle },
    tilt: { angle: tilt.angle, hookM: tilt.hookM },
    tuning: { speed: tuning.speed },
  };
}

const G = 9.81;
const POWER_NOISE = 2.5;
const POWER_FULL = 28;

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

export function twistFromLeans(startLean, releaseLean) {
  return clamp(num(releaseLean) - num(startLean), -1, 1);
}

export function composeThrow({ samples, aim, tilt, tuning }) {
  return {
    type: 'throw',
    power: powerFromSwing(samples),
    aim: { offset: aim.offset, angle: aim.angle },
    tilt: { angle: tilt.angle, spin: tilt.spin },
    tuning: { speed: tuning.speed, curve: 1 },
  };
}

const G = 9.81;
const POWER_NOISE = 2.5;
const POWER_FULL = 28;
const SPIN_NOISE = 40;
const SPIN_FULL = 420;

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function throwFromMotion(samples) {
  if (!samples || samples.length === 0) return { power: 0.5, spin: 0 };

  let peakMag = 0;
  for (const sample of samples) {
    const mag = Math.hypot(num(sample.ax), num(sample.ay), num(sample.az));
    if (mag > peakMag) peakMag = mag;
  }

  const excess = Math.max(0, peakMag - G);
  const power = clamp((excess - POWER_NOISE) / POWER_FULL, 0, 1);

  const releaseStart = Math.floor(samples.length * 0.6);
  let releaseRollRate = 0;
  for (let i = releaseStart; i < samples.length; i++) {
    const rollRateDegPerSec = num(samples[i].gamma);
    if (Math.abs(rollRateDegPerSec) > Math.abs(releaseRollRate)) releaseRollRate = rollRateDegPerSec;
  }
  const twist = Math.sign(releaseRollRate) * Math.max(0, Math.abs(releaseRollRate) - SPIN_NOISE);
  const spin = clamp(twist / SPIN_FULL, -1, 1);
  return { power, spin };
}

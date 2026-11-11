// Grip: the phone is in the right hand, the screen faces the player, and the
// top of the phone points up the forearm the way a Wii Remote points up a racket.
//
// gamma spins the phone around that long axis. Positive gamma is a forehand,
// negative gamma is a backhand. A swing is the contiguous run where |gamma|
// stays at or above 160 deg/s, the run reaches a peak of 320 deg/s (a walking
// arm swing stays under that), the run holds at least three samples, and it
// lasts at most 500 ms.
//
// Mean beta over that run classifies the shape: above 80 deg/s is a lob
// (low to high), below -80 deg/s is a slice (high to low), otherwise flat.
//
// Power is the peak rotation-rate magnitude in the run, hypot(alpha, beta, gamma),
// divided by 1600 deg/s and clamped to 0..1. A moderate rally swing at 720 deg/s
// is 0.45. A hard swing at 1440 deg/s is 0.9.
//
// A toss has no gamma run. It is a positive beta flick that peaks at 150 deg/s
// with three samples at or above 60 deg/s, or a rise in +ay (up the forearm)
// of 7 m/s² across at least three samples. Either cue must finish within 500 ms.
// Asking for a swing ignores a toss. Asking for a toss ignores a lateral swing.

const SWING_PEAK = 320;
const BURST_FLOOR = 160;
const BURST_MIN = 3;
const MAX_BURST_MS = 500;
const LOB_BETA = 80;
const SLICE_BETA = -80;
const POWER_FULL = 1600;
const TOSS_BETA_PEAK = 150;
const TOSS_BETA_MEMBER = 60;
const TOSS_AY_RISE = 7;

function field(sample, key) {
  if (!sample || typeof sample !== 'object') return 0;
  const value = sample[key];
  return Number.isFinite(value) ? value : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function rate(sample) {
  return Math.hypot(field(sample, 'alpha'), field(sample, 'beta'), field(sample, 'gamma'));
}

function duration(samples, lo, hi) {
  return field(samples[hi], 't') - field(samples[lo], 't');
}

function shortBurst(samples, lo, hi) {
  const dt = duration(samples, lo, hi);
  return dt >= 0 && dt <= MAX_BURST_MS;
}

// Contiguous same-sign gamma runs that are fast enough to be a swing.
function gammaBursts(samples) {
  const bursts = [];
  let i = 0;
  while (i < samples.length) {
    const g = field(samples[i], 'gamma');
    if (Math.abs(g) < BURST_FLOOR) {
      i += 1;
      continue;
    }
    const sign = Math.sign(g);
    const lo = i;
    let peakAbs = 0;
    let peakRot = 0;
    let sumBeta = 0;
    let count = 0;
    while (i < samples.length) {
      const sample = samples[i];
      const gi = field(sample, 'gamma');
      if (Math.abs(gi) < BURST_FLOOR || Math.sign(gi) !== sign) break;
      count += 1;
      peakAbs = Math.max(peakAbs, Math.abs(gi));
      peakRot = Math.max(peakRot, rate(sample));
      sumBeta += field(sample, 'beta');
      i += 1;
    }
    if (count >= BURST_MIN && peakAbs >= SWING_PEAK) {
      bursts.push({
        lo,
        hi: i - 1,
        sign,
        peakAbs,
        peakRot,
        meanBeta: sumBeta / count,
      });
    }
  }
  return bursts;
}

function bestSwing(samples) {
  let best = null;
  for (const burst of gammaBursts(samples)) {
    if (!shortBurst(samples, burst.lo, burst.hi)) continue;
    if (!best || burst.peakAbs > best.peakAbs) best = burst;
  }
  return best;
}

function describeSwing(burst) {
  let shape = 'flat';
  if (burst.meanBeta > LOB_BETA) shape = 'lob';
  else if (burst.meanBeta < SLICE_BETA) shape = 'slice';
  return {
    hand: burst.sign > 0 ? 'forehand' : 'backhand',
    shape,
    power: clamp01(burst.peakRot / POWER_FULL),
  };
}

function betaToss(samples) {
  let i = 0;
  while (i < samples.length) {
    if (field(samples[i], 'beta') < TOSS_BETA_MEMBER) {
      i += 1;
      continue;
    }
    const lo = i;
    let peak = 0;
    while (i < samples.length && field(samples[i], 'beta') >= TOSS_BETA_MEMBER) {
      peak = Math.max(peak, field(samples[i], 'beta'));
      i += 1;
    }
    const hi = i - 1;
    const count = hi - lo + 1;
    if (count >= BURST_MIN && peak >= TOSS_BETA_PEAK && shortBurst(samples, lo, hi)) return true;
  }
  return false;
}

// +ay points up the forearm. The rise is measured inside a 500 ms window so a
// slow walk does not accumulate into a toss, and it has to span three samples
// so a one-tick spike does not either.
function upwardAccel(samples) {
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    let minAy = field(samples[i], 'ay');
    for (let j = i + 1; j < n; j++) {
      const dt = field(samples[j], 't') - field(samples[i], 't');
      if (dt < 0 || dt > MAX_BURST_MS) break;
      const ay = field(samples[j], 'ay');
      if (j - i >= 2 && ay - minAy >= TOSS_AY_RISE) return true;
      if (ay < minAy) minAy = ay;
    }
  }
  return false;
}

export function readMotion(samples, options = {}) {
  const expect = options && options.expect;
  const list = Array.isArray(samples) ? samples : [];
  if (expect === 'swing') {
    const burst = bestSwing(list);
    return burst ? describeSwing(burst) : null;
  }
  if (expect === 'toss') {
    if (gammaBursts(list).length > 0) return null;
    if (list.length < BURST_MIN) return null;
    if (betaToss(list) || upwardAccel(list)) return { kind: 'toss' };
    return null;
  }
  return null;
}

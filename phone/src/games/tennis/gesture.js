// When a phone swing is finished. readMotion accepts a burst on its third fast
// sample, before the peak, so the phone waits until a later sample leaves the run.

import { readMotion } from './swing.js';

export const BUFFER_MS = 500;
const BURST_FLOOR = 160;

export function samplesSince(samples, t0) {
  let i = 0;
  while (i < samples.length && samples[i].t < t0) i += 1;
  return i === 0 ? samples : samples.slice(i);
}

function burstOpen(samples) {
  if (samples.length < 2) return false;
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  return Math.abs(last.gamma) >= BURST_FLOOR
    && Math.abs(prev.gamma) >= BURST_FLOOR
    && Math.sign(last.gamma) === Math.sign(prev.gamma);
}

export function finishedGesture(samples, expect) {
  if (!samples.length) return null;
  if (expect === 'swing' && burstOpen(samples)) return null;
  const gesture = readMotion(samples, { expect });
  if (!gesture) return null;
  if (expect !== 'swing') return { gesture, at: samples[samples.length - 1].t };
  let end = samples.length - 1;
  while (end > 0 && Math.abs(samples[end].gamma) < BURST_FLOOR) end -= 1;
  const closed = readMotion(samples.slice(0, end + 1), { expect: 'swing' });
  if (!closed) return null;
  return { gesture: closed, at: samples[end].t };
}

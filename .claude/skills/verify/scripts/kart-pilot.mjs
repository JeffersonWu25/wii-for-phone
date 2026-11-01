// How a player steers a Mario Kart racer around Luigi Circuit, as a driver policy.
//
// A player reads three things and nothing else:
//   1. The road, from the TV. Here that is the same centerline the host uses
//      (host/src/games/kart/track.js), so the pilot never hard-codes turns or timings.
//   2. Where their kart is, from the phone's race_status (x, z, progress, lap).
//   3. Which way the kart is moving, from how that position changes between updates.
//
// The policy is pure pursuit: aim the kart at a point on the road a little ahead,
// and turn the stick until the kart's travel direction matches the aim. Gas is always
// on, as it is in the phone controller (drive packets always send gas: true).
//
// Stick convention (phone/src/games/kart/steer.js): steer +1 is a full left turn, and
// the stick pushed left gives positive steer. Steer raises the kart's facing, which
// raises the travel heading atan2(dx, dz), so a positive heading error means steer
// positive.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO } from './instance.mjs';

const track = await import(pathToFileURL(path.join(REPO, 'host/src/games/kart/track.js')).href);
const steer = await import(pathToFileURL(path.join(REPO, 'phone/src/games/kart/steer.js')).href);
const { poseAt, PERIM } = track;
const { STICK } = steer;

// How far ahead on the road to aim, in metres. Longer is smoother; shorter hugs the line.
export const LOOKAHEAD_M = 14;
// Steering gain: stick steer per radian of heading error. Above 1 rad the stick saturates.
const GAIN = 2.2;
// Keep the knob inside the drift band's edge so the pilot never starts a drift by accident.
const MAX_KNOB = 0.85;
// Under this speed (m/s) the heading from motion is noise, so the wheel stays centred.
const MIN_SPEED = 2;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

// The stick's steer rises from zero at the dead zone to full at the drift band, along a
// curve. Invert that curve to find the knob offset (px, from the stick centre) that
// gives the wanted steer. Negative offset is the stick pushed left, which is steer > 0.
export function stickOffsetFor(steerCmd, radius) {
  const mag = clamp(Math.abs(steerCmd), 0, 1);
  if (mag === 0) return 0;
  const ramp = mag ** (1 / STICK.curve);
  const knob = Math.min(STICK.deadZone + (STICK.driftAt - STICK.deadZone) * ramp, MAX_KNOB);
  return -Math.sign(steerCmd) * knob * radius;
}

// prev and cur are { t (ms), x, z, progress } for one kart, two race_status updates apart.
// now is the wall-clock time (ms) the stick is being set, which may be later than cur.t.
export function steerCommand(prev, cur, now) {
  if (!prev || !cur || cur.t === prev.t) return 0;
  const dt = (cur.t - prev.t) / 1000;
  const vx = (cur.x - prev.x) / dt;
  const vz = (cur.z - prev.z) / dt;
  const speed = Math.hypot(vx, vz);
  if (speed < MIN_SPEED) return 0;

  // Race state arrives about 4 times a second, so move the last sample forward to now.
  const age = Math.max(0, (now - cur.t) / 1000);
  const x = cur.x + vx * age;
  const z = cur.z + vz * age;
  const progress = cur.progress + (speed * age) / PERIM;

  const aim = poseAt(progress + LOOKAHEAD_M / PERIM);
  const wanted = Math.atan2(aim.x - x, aim.z - z);
  const travel = Math.atan2(vx, vz);
  return clamp(GAIN * wrapPi(wanted - travel), -1, 1);
}

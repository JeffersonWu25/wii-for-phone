// Shell flight — pure. Track space: state advances in (s, lateral), x/z derive from track.frameAt(s).
// Walls are the corridor limits from track.surfaceAt; a bounce flips the lateral velocity.
// Red shells ease lateral toward their target while advancing s, then pursue directly inside PURSUE_RANGE.
//
// aim = { dir: 'forward'|'backward', angle } with angle in rad, positive toward the kart's right:
// the shell flies along h + angle (forward) or h + PI - angle (backward).
import { pushEvent } from './events.js';

// ── Tunables ─────────────────────────────────────────────────────────────────

export const SHELL_SPEED = 34; // m/s, constant
export const SHELL_RADIUS = 0.45;
export const SHELL_LIFE = 8; // s
export const GREEN_MAX_BOUNCES = 5; // removed on the 6th wall contact
export const RED_LIFE = 12; // s
export const LOCK_RANGE = 15; // m ahead: an unlocked red locks on a kart this close
export const PURSUE_RANGE = 15; // m: red switches from track-space easing to direct world pursuit
const LATERAL_GAIN = 3; // 1/s: desired lateral speed per metre of lateral error
const LATERAL_ACCEL = 120; // m/s^2: how fast the lateral speed may change while homing
const MAX_LATERAL_FRAC = 0.6; // of SHELL_SPEED
const SPAWN_AHEAD = 1.6; // m from the kart centre

// ── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapDs = (track, d) => d - track.length * Math.round(d / track.length);
const kartById = (race, id) => race.karts.find((k) => k.id === id) ?? null;

// Standings neighbour one place ahead of the shooter, or null when 1st.
export function redTarget(race, shooterId) {
  const i = race.standings.indexOf(shooterId);
  return i > 0 ? race.standings[i - 1] : null;
}

// Nearest other kart within LOCK_RANGE ahead of the shell along the track, or null.
export function findLock(shell, race, track) {
  let best = null;
  let bestD = LOCK_RANGE;
  for (const k of race.karts) {
    if (k.id === shell.owner) continue;
    const ahead = wrapDs(track, k.s - shell.s);
    const d = Math.hypot(k.x - shell.x, k.z - shell.z);
    if (ahead > 0 && d <= bestD) {
      best = k.id;
      bestD = d;
    }
  }
  return best;
}

// Heading change per metre of s at s (rad/m), for the lateral-offset arc scale.
function curvatureAt(track, s) {
  const dh = track.frameAt(s + 0.5).h - track.frameAt(s).h;
  return (dh - Math.PI * 2 * Math.round(dh / (Math.PI * 2))) / 0.5;
}

// ── Fire ─────────────────────────────────────────────────────────────────────

export function fireShell(race, kart, kind, aim, track) {
  const heading = aim.dir === 'backward' ? kart.h + Math.PI - aim.angle : kart.h + aim.angle;
  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  const x = kart.x + dx * SPAWN_AHEAD;
  const z = kart.z + dz * SPAWN_AHEAD;
  const p = track.project(x, z, kart.s);
  const shell = {
    id: `e${race.entitySeq++}`,
    kind,
    owner: kart.id,
    x,
    y: track.surfaceAt(p.s, p.lateral).y + SHELL_RADIUS,
    z,
    vx: dx * SHELL_SPEED,
    vy: 0,
    vz: dz * SHELL_SPEED,
    s: p.s,
    lateral: p.lateral,
    age: 0,
    state: 'moving',
    bounces: 0,
    target: kind === 'red' && aim.dir !== 'backward' ? redTarget(race, kart.id) : null,
    homing: kind === 'red' && aim.dir !== 'backward',
  };
  race.entities.push(shell);
  return shell;
}

// ── Step ─────────────────────────────────────────────────────────────────────

// Direct world-space pursuit: aim the velocity at the target.
function pursue(shell, target) {
  const dx = target.x - shell.x;
  const dz = target.z - shell.z;
  const d = Math.hypot(dx, dz) || 1;
  shell.vx = (dx / d) * SHELL_SPEED;
  shell.vz = (dz / d) * SHELL_SPEED;
}

// Track-space advance; returns the new { s, lateral }.
function advanceInTrack(shell, target, track, fr, dt) {
  const va = shell.vx * fr.fx + shell.vz * fr.fz;
  let vl = shell.vx * fr.rx + shell.vz * fr.rz;
  if (shell.homing) {
    const want = target ? clamp((target.lateral - shell.lateral) * LATERAL_GAIN, -SHELL_SPEED * MAX_LATERAL_FRAC, SHELL_SPEED * MAX_LATERAL_FRAC) : 0;
    const vlNext = vl + clamp(want - vl, -LATERAL_ACCEL * dt, LATERAL_ACCEL * dt);
    vl = clamp(vlNext, -SHELL_SPEED * MAX_LATERAL_FRAC, SHELL_SPEED * MAX_LATERAL_FRAC);
  }
  const vaFix = Math.sign(va || 1) * Math.sqrt(Math.max(0, SHELL_SPEED * SHELL_SPEED - vl * vl));
  const arc = Math.max(0.2, 1 - shell.lateral * curvatureAt(track, shell.s));
  return { s: shell.s + (vaFix * dt) / arc, lateral: shell.lateral + vl * dt, va: vaFix, vl };
}

// Returns false when the shell is spent.
export function stepShell(shell, race, track, dt) {
  const cur = track.project(shell.x, shell.z, shell.s); // re-sync s/lateral so externally placed entities work
  shell.s = cur.s;
  shell.lateral = cur.lateral;
  if (shell.homing && shell.target == null) shell.target = findLock(shell, race, track);
  const target = shell.homing && shell.target != null ? kartById(race, shell.target) : null;
  const near = target && Math.hypot(target.x - shell.x, target.z - shell.z) <= PURSUE_RANGE;

  let s;
  let lateral;
  let va;
  let vl;
  if (near) {
    pursue(shell, target);
    const p = track.project(shell.x + shell.vx * dt, shell.z + shell.vz * dt, shell.s);
    s = p.s;
    lateral = p.lateral;
  } else {
    const fr = track.frameAt(shell.s);
    ({ s, lateral, va, vl } = advanceInTrack(shell, target, track, fr, dt));
    s = track.wrapS(s);
  }

  const surf = track.surfaceAt(s, lateral);
  const maxR = surf.limitR - SHELL_RADIUS;
  const maxL = surf.limitL - SHELL_RADIUS;
  const hitWall = lateral > maxR || lateral < -maxL;
  if (hitWall) lateral = lateral > 0 ? maxR : -maxL;

  const fr = track.frameAt(s);
  shell.s = s;
  shell.lateral = lateral;
  shell.x = fr.x + fr.rx * lateral;
  shell.z = fr.z + fr.rz * lateral;
  shell.y = track.surfaceAt(s, lateral).y + SHELL_RADIUS;
  if (!near) {
    shell.vx = va * fr.fx + vl * fr.rx;
    shell.vz = va * fr.fz + vl * fr.rz;
  }
  if (hitWall) {
    const side = lateral > 0 ? 1 : -1;
    const across = shell.vx * fr.rx + shell.vz * fr.rz;
    if (across * side > 0) {
      shell.vx -= 2 * across * fr.rx;
      shell.vz -= 2 * across * fr.rz;
      shell.bounces += 1;
      pushEvent(race, { type: 'bounce', entityId: shell.id, kind: shell.kind, x: shell.x, y: shell.y, z: shell.z });
    }
  }
  if (shell.kind === 'red') return shell.age < RED_LIFE;
  return shell.age < SHELL_LIFE && shell.bounces <= GREEN_MAX_BOUNCES;
}

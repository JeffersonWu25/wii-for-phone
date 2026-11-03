// Shell flight — pure. STUB from the core part: straight line at constant speed, simple wall reflect.
// The duel part replaces the body (red homing, corridor following) and keeps these exports.
//
// aim = { dir: 'forward'|'backward', angle } with angle in rad, positive toward the kart's right:
// the shell flies along h + angle (forward) or h + PI - angle (backward).
import { pushEvent } from './items.js';

// ── Tunables ─────────────────────────────────────────────────────────────────

export const SHELL_SPEED = 34; // m/s, constant
export const SHELL_RADIUS = 0.45;
export const SHELL_LIFE = 8; // s
export const GREEN_MAX_BOUNCES = 5; // removed on the 6th wall contact
const SPAWN_AHEAD = 1.6; // m from the kart centre

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
    target: null,
  };
  race.entities.push(shell);
  return shell;
}

// ── Step ─────────────────────────────────────────────────────────────────────

// Returns false when the shell is spent.
export function stepShell(shell, race, track, dt) {
  shell.x += shell.vx * dt;
  shell.z += shell.vz * dt;
  const p = track.project(shell.x, shell.z, shell.s);
  let { s, lateral } = p;
  const surf = track.surfaceAt(s, lateral);
  const maxR = surf.limitR - SHELL_RADIUS;
  const maxL = surf.limitL - SHELL_RADIUS;
  if (lateral > maxR || lateral < -maxL) {
    const side = lateral > 0 ? 1 : -1;
    const fr = track.frameAt(s);
    lateral = side > 0 ? maxR : -maxL;
    shell.x = fr.x + fr.rx * lateral;
    shell.z = fr.z + fr.rz * lateral;
    const across = shell.vx * fr.rx + shell.vz * fr.rz;
    if (across * side > 0) {
      shell.vx -= 2 * across * fr.rx;
      shell.vz -= 2 * across * fr.rz;
    }
    shell.bounces += 1;
    pushEvent(race, { type: 'bounce', entityId: shell.id, kind: shell.kind, x: shell.x, y: shell.y, z: shell.z });
  }
  shell.s = s;
  shell.lateral = lateral;
  shell.y = track.surfaceAt(s, lateral).y + SHELL_RADIUS;
  return shell.age < SHELL_LIFE && shell.bounces <= GREEN_MAX_BOUNCES;
}

// Moving hazards (cows, windmill blade gate): pure motion functions plus the solid-body collision step.
// Cows are circles, the closed gate is a wall across the road; a hit bounces the kart back, costs speed,
// and staggers its steering briefly. Each obstacle then lets that kart slide past for HIT_COOLDOWN s (no stun-lock).
import { KART_RADIUS } from './physics.js';

export const COW_RADIUS = 1.4;
export const COW_HEIGHT = 1.5;
export const GATE_HALF = 0.6; // m, half thickness of the closed blade gate along the road
export const HIT_COOLDOWN = 1.2; // s
export const HIT_STAGGER = 0.35; // s of weakened steering after a hit
export const HIT_RESTITUTION = 0.2;
export const SCRAPE_SPEED = 6; // m/s a kart pinned against an obstacle after the first hit can still build, so it can steer round
export const HIT_KEEP = 0.5; // share of the velocity kept by a hit

const mod = (a, n) => ((a % n) + n) % n;

// Cow lateral position and walking direction (+1 toward larger lateral) at race time t; phase is seconds.
// One period: pause at `from`, walk to `to`, pause, walk back; walking is eased.
export function cowPose(o, t) {
  if (o.from === o.to) return { lateral: o.from, dir: 1 };
  const pause = o.pause ?? 0;
  const half = o.period / 2;
  const u = mod(t + o.phase, o.period);
  const leg = u < half ? 0 : 1;
  const k = Math.min(1, Math.max(0, (u - leg * half - pause) / Math.max(1e-6, half - pause)));
  const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
  const [a, b] = leg === 0 ? [o.from, o.to] : [o.to, o.from];
  return { lateral: a + (b - a) * e, dir: Math.sign(o.to - o.from) * (leg === 0 ? 1 : -1) };
}

// Blade gate: a continuously turning 4-sail rotor, one quarter turn per period, so one sail crosses the arch each period.
// `angle` is the rotor's render angle (0 = a sail pointing straight down, + toward the road's right). The gate is closed for the
// first blockFraction of each period, and that window is centred on the sail hanging straight down, so the sail sweeps
// +/-(blockFraction * 45) degrees about vertical: the angular span the closed gate must cover. Collision and renderer share this.
export function bladeState(o, t) {
  const turns = (t + o.phase) / o.period;
  const u = mod(turns, 1);
  return { blocking: u < o.blockFraction, angle: (turns - o.blockFraction / 2) * (Math.PI / 2) };
}

// Records a hit and returns true when it is a fresh one (outside the cooldown of this obstacle).
function registerHit(race, kart, id) {
  const last = kart.obstacleHit?.[id];
  if (last != null && race.time - last <= HIT_COOLDOWN) return false;
  (kart.obstacleHit ??= {})[id] = race.time;
  kart.stagger = HIT_STAGGER;
  kart.boost = 0;
  kart.boostLevel = 0;
  Object.assign(kart.drift, { sliding: false, dir: 0, charge: 0, level: 0 });
  return true;
}

// Pushes the kart out along (nx, nz) by `pen` and bounces its velocity; the speed loss only applies to a fresh hit.
function bounce(race, kart, track, id, nx, nz, pen) {
  kart.x += nx * pen;
  kart.z += nz * pen;
  const vn = kart.vx * nx + kart.vz * nz;
  if (vn < 0) {
    const fresh = registerHit(race, kart, id);
    const e = fresh ? HIT_RESTITUTION : 0;
    kart.vx -= (1 + e) * vn * nx;
    kart.vz -= (1 + e) * vn * nz;
    if (fresh) {
      kart.vx *= HIT_KEEP;
      kart.vz *= HIT_KEEP;
    }
    const along = Math.max(0, kart.vx * Math.cos(kart.h) + kart.vz * Math.sin(kart.h));
    kart.speed = fresh ? along : Math.max(along, Math.min(kart.speed, SCRAPE_SPEED));
  }
  const p = track.project(kart.x, kart.z, kart.s);
  // Keep the push inside the corridor walls (bridge, tunnel).
  const surf = track.surfaceAt(p.s, p.lateral);
  const lateral = Math.min(surf.limitR - KART_RADIUS, Math.max(-(surf.limitL - KART_RADIUS), p.lateral));
  if (lateral !== p.lateral) {
    const fr = track.frameAt(p.s);
    kart.x = fr.x + fr.rx * lateral;
    kart.z = fr.z + fr.rz * lateral;
  }
  kart.s = p.s;
  kart.lateral = lateral;
}

export function collideObstacles(race, track) {
  if (!track.obstacles?.length) return;
  const obs = track.obstaclesAt(race.time);
  for (const kart of race.karts) {
    for (const o of obs) {
      if (o.kind === 'cow') {
        if (kart.airborne) continue; // a kart in the air flies over cows, but never through a closed gate
        const dx = kart.x - o.x;
        const dz = kart.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = KART_RADIUS + o.radius;
        if (d >= min) continue;
        const fr = track.frameAt(o.s);
        const [nx, nz] = d > 1e-6 ? [dx / d, dz / d] : [-fr.fx, -fr.fz];
        bounce(race, kart, track, o.id, nx, nz, min - d);
      } else if (o.kind === 'blades' && o.blocking) {
        if (Math.abs(kart.lateral - o.lateral) > o.radius) continue; // the wall spans the road, not the bypass
        let d = kart.s - o.s;
        d -= track.length * Math.round(d / track.length);
        const min = KART_RADIUS + GATE_HALF;
        if (Math.abs(d) >= min) continue;
        const fr = track.frameAt(o.s);
        const side = d < 0 ? -1 : 1;
        bounce(race, kart, track, o.id, fr.fx * side, fr.fz * side, min - Math.abs(d));
      }
    }
  }
}

// Arcade kart physics — pure, steps one kart against a Track. Steer +1 = right.

// ── Tunables ─────────────────────────────────────────────────────────────────

export const TOP_SPEED = 22; // m/s
export const ACCEL_RATE = 0.8; // 1/s, speed chases 1.05 * top so 95% lands near 3 s
export const BOOST_ACCEL_RATE = 2.2;
export const BOOST_TOP = 1.45;
export const BOOST_TIME = 1.2; // s
export const OFFROAD_TOP = 0.5;
export const COAST_BASE = 2; // m/s^2
export const COAST_PROP = 0.07; // 1/s
export const OVERSPEED_DRAG = 4; // m/s^2 base plus 2.5 * excess
export const TURN_RATE = 2.4; // rad/s at low speed
export const TURN_FALLOFF = 18; // m/s where turn rate halves-ish
export const GRIP_ROAD = 9; // 1/s velocity-vector catch-up
export const GRIP_OFFROAD = 3.5;
export const SCRUB = 1.5; // speed lost to sideways slip
export const KART_RADIUS = 0.9;
export const WALL_SPEED_LOSS = 0.35;
export const WALL_RESTITUTION = 0.3;
export const ATTITUDE_RATE = 12; // 1/s smoothing for pitch / roll

// Hits: a banana spins the kart out, a shell tumbles it. Steering and items are locked meanwhile.
export const HIT_TIME = { spin: 1.2, tumble: 1.4 }; // s
export const HIT_INVULN = 1.0; // s of immunity after a hit ends
export const HIT_DECAY = 8; // 1/s, speed falls to under 10% of the entry speed within 0.3 s

// Drift: travel direction and body heading are tracked apart while sliding.
export const DRIFT_MIN_STEER = 0.3; // |steer| needed to start a slide
export const DRIFT_MIN_SPEED = 8; // m/s needed to start and keep a slide
export const DRIFT_TURN = 1.0; // rad/s the travel direction swings into the turn with neutral steer
export const DRIFT_STEER_MOD = 0.9; // steering into the turn scales the swing up by this much, out of it down
export const DRIFT_TURN_MIN = 0.15; // rad/s floor so a slide never straightens or reverses
export const DRIFT_SLIP = 0.52; // rad (30 deg) the body points past the travel direction
export const DRIFT_SLIP_IN = 9; // 1/s slip eases in on drift start
export const DRIFT_SLIP_OUT = 7; // 1/s slip eases out after the slide ends
export const DRIFT_DRAG = 1.2; // m/s^2 lost while sliding
export const DRIFT_LEVEL_TIMES = [1, 2, 3]; // s of sliding to reach levels 1, 2, 3
export const DRIFT_BOOST_TIME = [0.7, 1.3, 2]; // s of boost on release at level 1, 2, 3
export const DRIFT_BOOST_TOP = [1.3, 1.45, 1.6]; // top speed multiplier per level

// ── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function wrapAngle(a) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

// ── Kart ─────────────────────────────────────────────────────────────────────

// slot is an entry from track.gridSlots().
export function createKart({ id, color, slot } = {}) {
  return {
    id,
    color,
    x: slot?.x ?? 0,
    y: slot?.y ?? 0,
    z: slot?.z ?? 0,
    h: slot?.h ?? 0,
    speed: 0,
    vx: 0,
    vz: 0,
    s: slot?.s ?? 0,
    lateral: slot?.lateral ?? 0,
    pitch: 0, // nose up positive
    roll: 0, // right side down positive
    surface: 'road',
    boost: 0,
    boostLevel: 0, // level of the drift boost running, 0 for pads or no boost
    mushroom: 0, // s left of a mushroom boost; while > 0 off-road does not lower top speed
    hit: null, // { kind: 'spin'|'tumble', t, total } while spinning out; t counts down
    invuln: 0, // s of hit immunity left
    item: { main: null, reserve: null, rollMain: 0, rollReserve: 0 }, // see items.js
    drift: { sliding: false, dir: 0, charge: 0, level: 0 },
    slip: 0, // physics-internal, the renderer must not read it: heading minus travel direction, rad
    airborne: false,
    steerVis: 0,
  };
}

export const DEFAULT_TUNING = { speed: 1, turn: 1, driftTurn: 1, driftLevel: 1, driftBoost: 1 };

// Slide state machine. A slide needs drift held plus enough steer and speed; the direction locks
// at the start. Charging pauses off-road, a wall hit only costs speed. Releasing the button at
// level 1+ grants the boost; running out of speed grants nothing. Holding drift after that
// starts a new slide once the conditions hold again.
function updateDrift(kart, input, steer, offroad, dt, tune) {
  const d = kart.drift;
  const held = !!input.drift;
  if (d.sliding) {
    const released = !held;
    // The release only takes over when it outlasts the boost already running, so a weak release
    // never cuts short or recolors a stronger one.
    const boostTime = DRIFT_BOOST_TIME[d.level - 1] * tune.driftBoost;
    if (released && kart.speed >= DRIFT_MIN_SPEED && d.level >= 1 && boostTime >= kart.boost) {
      kart.boost = boostTime;
      kart.boostLevel = d.level;
    }
    if (released || kart.speed < DRIFT_MIN_SPEED) Object.assign(d, { sliding: false, dir: 0, charge: 0, level: 0 });
  } else if (held && Math.abs(steer) >= DRIFT_MIN_STEER && kart.speed >= DRIFT_MIN_SPEED) {
    Object.assign(d, { sliding: true, dir: Math.sign(steer), charge: 0, level: 0 });
    // Start from the slip the kart already has so the body does not snap.
    if (Math.hypot(kart.vx, kart.vz) > 0.5) kart.slip = wrapAngle(kart.h - Math.atan2(kart.vz, kart.vx));
  }
  if (!d.sliding) return;
  if (!offroad) d.charge += dt;
  d.level = DRIFT_LEVEL_TIMES.filter((t) => d.charge * tune.driftLevel >= t).length;
}

// Slide: the travel direction swings into the turn, the body points past it by the slip angle.
function slideHeading(kart, steer, v, dt, tune) {
  const { dir } = kart.drift;
  const moving = Math.hypot(kart.vx, kart.vz) > 0.5;
  let travel = moving ? Math.atan2(kart.vz, kart.vx) : kart.h - kart.slip;
  travel += dir * Math.max(DRIFT_TURN_MIN, DRIFT_TURN * tune.driftTurn * (1 + DRIFT_STEER_MOD * steer * dir)) * dt;
  kart.slip += (dir * DRIFT_SLIP - kart.slip) * (1 - Math.exp(-DRIFT_SLIP_IN * dt));
  kart.h = travel + kart.slip;
  kart.vx = Math.cos(travel) * v;
  kart.vz = Math.sin(travel) * v;
}

// Grip: steer the heading, ease out leftover slip, let the velocity vector lag the heading.
// Returns the forward speed after slip scrub.
function gripHeading(kart, steer, v, offroad, dt, tune) {
  const turn = (TURN_RATE * tune.turn / (1 + (Math.abs(v) / TURN_FALLOFF) ** 2)) * Math.min(1, Math.abs(v) / 3);
  kart.h += steer * turn * Math.sign(v) * dt;
  if (kart.slip !== 0) {
    const eased = Math.abs(kart.slip) < 0.005 ? 0 : kart.slip * Math.exp(-DRIFT_SLIP_OUT * dt);
    kart.h += eased - kart.slip;
    kart.slip = eased;
  }
  const fx = Math.cos(kart.h);
  const fz = Math.sin(kart.h);
  const catchUp = 1 - Math.exp(-(offroad ? GRIP_OFFROAD : GRIP_ROAD) * dt);
  kart.vx += (fx * v - kart.vx) * catchUp;
  kart.vz += (fz * v - kart.vz) * catchUp;
  const vmag = Math.hypot(kart.vx, kart.vz);
  if (vmag > 1) v *= Math.max(0, 1 - (SCRUB * Math.abs(kart.vx * fz - kart.vz * fx) * dt) / vmag);
  return v;
}

// Starts a spin-out (banana) or tumble (shell). No-op while already hit or immune.
// Drift and boost are cancelled; the heading is left alone.
export function applyHit(kart, kind) {
  if (kart.hit || kart.invuln > 0) return false;
  const total = HIT_TIME[kind];
  if (!total) return false;
  kart.hit = { kind, t: total, total };
  Object.assign(kart.drift, { sliding: false, dir: 0, charge: 0, level: 0 });
  kart.boost = 0;
  kart.boostLevel = 0;
  kart.mushroom = 0;
  kart.slip = 0;
  return true;
}

export function stepKart(kart, input, dt, track, tune = DEFAULT_TUNING) {
  const hit = kart.hit;
  if (hit) input = { steer: 0, throttle: 0, drift: false };
  const steer = clamp(input.steer || 0, -1, 1);
  const throttle = clamp(input.throttle ?? 1, 0, 1);
  const offroad = kart.surface === 'grass' || kart.surface === 'sand';

  updateDrift(kart, input, steer, offroad, dt, tune);
  const sliding = kart.drift.sliding;
  const boostTop = kart.boostLevel > 0 ? DRIFT_BOOST_TOP[kart.boostLevel - 1] : BOOST_TOP;
  const top = TOP_SPEED * tune.speed * (offroad && kart.mushroom <= 0 ? OFFROAD_TOP : 1) * (kart.boost > 0 ? boostTop : 1);

  // Speed along the heading; it never goes negative.
  let v = kart.speed;
  if (throttle > 0) {
    if (v < top) v = Math.min(top, v + (kart.boost > 0 ? BOOST_ACCEL_RATE : ACCEL_RATE) * throttle * (top * 1.05 - v) * dt);
  } else if (v !== 0) {
    const drag = (COAST_BASE + COAST_PROP * Math.abs(v)) * dt;
    v = Math.abs(v) <= drag ? 0 : v - Math.sign(v) * drag;
  }
  if (hit) {
    const k = Math.exp(-HIT_DECAY * dt);
    v *= k;
    kart.vx *= k;
    kart.vz *= k;
  }
  if (sliding) v = Math.max(0, v - DRIFT_DRAG * dt);
  if (v > top) v = Math.max(top, v - (OVERSPEED_DRAG + 2.5 * (v - top)) * dt);
  kart.steerVis += (steer - kart.steerVis) * (1 - Math.exp(-10 * dt));

  if (sliding) slideHeading(kart, steer, v, dt, tune);
  else v = gripHeading(kart, steer, v, offroad, dt, tune);
  kart.speed = v;

  kart.x += kart.vx * dt;
  kart.z += kart.vz * dt;

  // Track frame and walls (both corridor limits are solid).
  const p = track.project(kart.x, kart.z, kart.s);
  let { s, lateral } = p;
  let surf = track.surfaceAt(s, lateral);
  const maxR = surf.limitR - KART_RADIUS;
  const maxL = surf.limitL - KART_RADIUS;
  if (lateral > maxR || lateral < -maxL) {
    const side = lateral > 0 ? 1 : -1;
    const fr = track.frameAt(s);
    lateral = side > 0 ? maxR : -maxL;
    kart.x = fr.x + fr.rx * lateral;
    kart.z = fr.z + fr.rz * lateral;

    // Reflect the outward velocity component, keep the tangential one, lose speed.
    const along = kart.vx * fr.fx + kart.vz * fr.fz;
    const across = kart.vx * fr.rx + kart.vz * fr.rz;
    const outward = across * side;
    if (outward > 0) {
      const loss = 1 - WALL_SPEED_LOSS * Math.min(1, outward / 6);
      const nAlong = along * loss;
      const nAcross = -across * WALL_RESTITUTION * loss;
      kart.vx = fr.fx * nAlong + fr.rx * nAcross;
      kart.vz = fr.fz * nAlong + fr.rz * nAcross;
      // Mid-slide the heading points past the travel direction, so keep the full speed there.
      kart.speed = kart.drift.sliding ? Math.hypot(kart.vx, kart.vz) : kart.vx * Math.cos(kart.h) + kart.vz * Math.sin(kart.h);
      // Slide along the wall: swing the heading toward the tangent.
      const toTangent = wrapAngle(Math.atan2(fr.fz, fr.fx) - kart.h);
      if (Math.abs(toTangent) < Math.PI / 2) kart.h += toTangent * 0.2;
    }
    surf = track.surfaceAt(s, lateral);
  }
  kart.s = s;
  kart.lateral = lateral;
  kart.surface = surf.kind;
  kart.y = surf.y;

  // Attitude from the surface gradient.
  const ny = surf.ny || 1;
  const gx = -surf.nx / ny;
  const gz = -surf.nz / ny;
  const k = 1 - Math.exp(-ATTITUDE_RATE * dt);
  kart.pitch += (Math.atan(gx * Math.cos(kart.h) + gz * Math.sin(kart.h)) - kart.pitch) * k;
  kart.roll += (Math.atan(-(gx * -Math.sin(kart.h) + gz * Math.cos(kart.h))) - kart.roll) * k;

  // Boost pads. A pad never shortens a running boost; once it takes over the boost reads level 0.
  kart.boost = Math.max(0, kart.boost - dt);
  kart.mushroom = Math.max(0, kart.mushroom - dt);
  if (hit) {
    hit.t -= dt;
    if (hit.t <= 0) {
      kart.hit = null;
      kart.invuln = HIT_INVULN;
    }
  } else kart.invuln = Math.max(0, kart.invuln - dt);
  for (const pad of hit ? [] : track.boostPads) {
    let ds = kart.s - pad.s;
    ds -= track.length * Math.round(ds / track.length);
    if (Math.abs(ds) <= pad.length / 2 && Math.abs(kart.lateral - pad.lateral) <= pad.width / 2 + 0.5 && kart.boost < BOOST_TIME) {
      kart.boost = BOOST_TIME;
      kart.boostLevel = 0;
    }
  }
  if (kart.boost === 0) kart.boostLevel = 0;
}

// ── Kart-vs-kart ─────────────────────────────────────────────────────────────

export function resolveKartCollisions(karts) {
  const minDist = KART_RADIUS * 2;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= minDist) continue;
      if (d < 1e-6) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      const nx = dx / d;
      const nz = dz / d;
      const push = (minDist - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;

      // Share the closing velocity along the normal, then re-derive each kart's forward speed.
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing > 0) {
        const j2 = closing * 0.55;
        a.vx -= nx * j2;
        a.vz -= nz * j2;
        b.vx += nx * j2;
        b.vz += nz * j2;
        a.speed -= j2 * (nx * Math.cos(a.h) + nz * Math.sin(a.h));
        b.speed += j2 * (nx * Math.cos(b.h) + nz * Math.sin(b.h));
      }
    }
  }
}

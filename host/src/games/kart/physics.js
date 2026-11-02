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
export const BRAKE = 25; // m/s^2
export const REVERSE_TOP = 6;
export const TURN_RATE = 2.4; // rad/s at low speed
export const TURN_FALLOFF = 18; // m/s where turn rate halves-ish
export const GRIP_ROAD = 9; // 1/s velocity-vector catch-up
export const GRIP_OFFROAD = 3.5;
export const SCRUB = 1.5; // speed lost to sideways slip
export const KART_RADIUS = 0.9;
export const WALL_SPEED_LOSS = 0.35;
export const WALL_RESTITUTION = 0.3;
export const ATTITUDE_RATE = 12; // 1/s smoothing for pitch / roll

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
    airborne: false,
    steerVis: 0,
  };
}

export function stepKart(kart, input, dt, track) {
  const steer = clamp(input.steer || 0, -1, 1);
  const gas = !!input.gas;
  const brake = !!input.brake;
  const offroad = kart.surface === 'grass' || kart.surface === 'sand';
  const top = TOP_SPEED * (offroad ? OFFROAD_TOP : 1) * (kart.boost > 0 ? BOOST_TOP : 1);

  // Speed along the heading.
  let v = kart.speed;
  if (brake && !gas) {
    v = v > 0 ? Math.max(0, v - BRAKE * dt) : Math.max(-REVERSE_TOP, v - BRAKE * 0.4 * dt);
  } else if (gas) {
    if (v < 0) v = Math.min(0, v + BRAKE * dt);
    else if (v < top) v = Math.min(top, v + (kart.boost > 0 ? BOOST_ACCEL_RATE : ACCEL_RATE) * (top * 1.05 - v) * dt);
  } else if (v !== 0) {
    const drag = (COAST_BASE + COAST_PROP * Math.abs(v)) * dt;
    v = Math.abs(v) <= drag ? 0 : v - Math.sign(v) * drag;
  }
  if (v > top) v = Math.max(top, v - (OVERSPEED_DRAG + 2.5 * (v - top)) * dt);

  // Heading.
  const turn = (TURN_RATE / (1 + (Math.abs(v) / TURN_FALLOFF) ** 2)) * Math.min(1, Math.abs(v) / 3);
  kart.h += steer * turn * Math.sign(v) * dt;
  kart.steerVis += (steer - kart.steerVis) * (1 - Math.exp(-10 * dt));

  // Velocity vector lags the heading; slip scrubs speed.
  const fx = Math.cos(kart.h);
  const fz = Math.sin(kart.h);
  const catchUp = 1 - Math.exp(-(offroad ? GRIP_OFFROAD : GRIP_ROAD) * dt);
  kart.vx += (fx * v - kart.vx) * catchUp;
  kart.vz += (fz * v - kart.vz) * catchUp;
  const vmag = Math.hypot(kart.vx, kart.vz);
  if (vmag > 1) v *= Math.max(0, 1 - (SCRUB * Math.abs(kart.vx * fz - kart.vz * fx) * dt) / vmag);
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
      kart.speed = kart.vx * Math.cos(kart.h) + kart.vz * Math.sin(kart.h);
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

  // Boost pads.
  kart.boost = Math.max(0, kart.boost - dt);
  for (const pad of track.boostPads) {
    let ds = kart.s - pad.s;
    ds -= track.length * Math.round(ds / track.length);
    if (Math.abs(ds) <= pad.length / 2 && Math.abs(kart.lateral - pad.lateral) <= pad.width / 2 + 0.5) kart.boost = BOOST_TIME;
  }
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

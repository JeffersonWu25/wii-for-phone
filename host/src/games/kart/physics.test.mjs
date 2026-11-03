import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track.js';
import { createKart, stepKart, applyHit, resolveKartCollisions, TOP_SPEED } from './physics.js';

const track = buildTrack();
const DT = 1 / 60;

function kartAt(s, lateral = 0, extra = {}) {
  const fr = track.frameAt(s);
  return Object.assign(
    createKart({
      id: 'k',
      color: 0xff0000,
      slot: { s: fr.s, lateral, x: fr.x + fr.rx * lateral, y: track.heightAt(fr.s, lateral), z: fr.z + fr.rz * lateral, h: fr.h },
    }),
    extra,
  );
}

function run(kart, input, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepKart(kart, input, DT, track);
}

test('full throttle reaches 95% of top speed in 2.5 to 3.5 s', () => {
  const kart = kartAt(10);
  let t = 0;
  while (kart.speed < TOP_SPEED * 0.95 && t < 10) {
    stepKart(kart, { steer: 0 }, DT, track);
    t += DT;
  }
  assert.ok(t > 2.5 && t < 3.5, `took ${t}`);
  run(kart, { steer: 0 }, 3);
  assert.ok(kart.speed <= TOP_SPEED + 1e-6 && kart.speed > TOP_SPEED - 0.5);
});

test('coasting slows the kart at 2 to 4 m/s^2', () => {
  const kart = kartAt(10, 0, { speed: 20, vx: 20 });
  run(kart, { steer: 0, throttle: 0 }, 1);
  const decel = 20 - kart.speed;
  assert.ok(decel > 2 && decel < 4.5, `decel ${decel}`);
  run(kart, { steer: 0, throttle: 0 }, 15);
  assert.equal(kart.speed, 0);
});

test('off-road top speed is about half', () => {
  const kart = kartAt(5, 12);
  assert.equal(track.surfaceAt(5, 12).kind, 'grass');
  run(kart, { steer: 0 }, 7);
  assert.equal(kart.surface, 'grass');
  assert.ok(kart.speed > TOP_SPEED * 0.45 && kart.speed < TOP_SPEED * 0.55, `speed ${kart.speed}`);
});

test('curbs keep full speed', () => {
  const t1 = track.pieceRange('t1');
  const kart = kartAt((t1.s0 + t1.s1) / 2, 8.5, { speed: 22 });
  stepKart(kart, { steer: 0 }, DT, track);
  assert.equal(kart.surface, 'curb');
  assert.ok(kart.speed > 21.5);
});

test('walls clamp the kart inside the corridor and cost speed', () => {
  const kart = kartAt(60, 0);
  kart.h += 0.5; // angled toward the right wall
  kart.speed = 22;
  kart.vx = Math.cos(kart.h) * 22;
  kart.vz = Math.sin(kart.h) * 22;
  let minSpeed = 22;
  for (let i = 0; i < 240; i++) {
    stepKart(kart, { steer: 0, throttle: 0 }, DT, track);
    const lim = track.surfaceAt(kart.s, kart.lateral);
    assert.ok(kart.lateral <= lim.limitR - 0.9 + 1e-6, `lateral ${kart.lateral}`);
    minSpeed = Math.min(minSpeed, kart.speed);
  }
  assert.ok(minSpeed < 22 * 0.8, `speed only dropped to ${minSpeed}`);
});

test('boost pads push speed above top speed', () => {
  const pad = track.boostPads[0];
  const kart = kartAt(pad.s - 8, pad.lateral, { speed: 22, vx: 22 });
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    stepKart(kart, { steer: 0 }, DT, track);
    peak = Math.max(peak, kart.speed);
  }
  assert.ok(peak > 26, `peak ${peak}`);
  run(kart, { steer: 0 }, 5);
  assert.ok(kart.speed <= TOP_SPEED + 0.1);
});

test('kart y follows heightAt up the hill', () => {
  const hill = track.pieceRange('hill');
  const kart = kartAt(hill.s0 + 5, 0, { speed: 15, vx: 15 });
  let sawClimb = false;
  for (let i = 0; i < 200; i++) {
    const fr = track.frameAt(kart.s);
    stepKart(kart, { steer: Math.max(-1, Math.min(1, Math.atan2(fr.fz, fr.fx) - kart.h)) * 3 }, DT, track);
    assert.ok(Math.abs(kart.y - track.heightAt(kart.s, kart.lateral)) < 1e-9);
    if (kart.y > 1) sawClimb = true;
  }
  assert.ok(sawClimb);
});

test('pitch tilts nose up on a climb and roll follows the sweeper bank', () => {
  const hill = track.pieceRange('hill');
  const climbing = kartAt(hill.s0 + 20, 0, { speed: 5 });
  run(climbing, { steer: 0, throttle: 0 }, 0.1);
  assert.ok(climbing.pitch > 0.05);

  const sw = track.pieceRange('sweeper');
  const banked = kartAt((sw.s0 + sw.s1) / 2, 0);
  run(banked, { steer: 0, throttle: 0 }, 0.5);
  assert.ok(banked.roll > 0.1, `roll ${banked.roll}`);
});

test('steering right turns the heading clockwise (h grows)', () => {
  const kart = kartAt(10, 0, { speed: 15 });
  const h0 = kart.h;
  run(kart, { steer: 1 }, 0.3);
  assert.ok(kart.h > h0);
  const left = kartAt(10, 0, { speed: 15 });
  run(left, { steer: -1 }, 0.3);
  assert.ok(left.h < h0);
});

test('overlapping karts get pushed apart and trade speed', () => {
  const a = kartAt(50, 0, { speed: 20, vx: 20 });
  const b = kartAt(51.2, 0, { speed: 10, vx: 10 });
  b.x = a.x + 1.2;
  b.z = a.z;
  resolveKartCollisions([a, b]);
  assert.ok(Math.hypot(b.x - a.x, b.z - a.z) >= 1.8 - 1e-9);
  assert.ok(a.speed < 20 && b.speed > 10);
});

// ── Drift, boost, reverse, throttle ──────────────────────────────────────────

// Endless flat road along +x so a long slide never meets a wall or the grass.
const flat = {
  length: 1e9,
  boostPads: [],
  project: (x, z) => ({ s: x, lateral: z }),
  frameAt: (s) => ({ s, x: s, z: 0, y: 0, h: 0, fx: 1, fz: 0, rx: 0, rz: 1 }),
  surfaceAt: () => ({ kind: 'road', limitR: 1e6, limitL: 1e6, y: 0, nx: 0, ny: 1, nz: 0 }),
};

function runFlat(kart, input, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepKart(kart, input, DT, flat);
}

const straight = () => {
  const kart = kartAt(10, 0, { speed: 20 });
  kart.vx = Math.cos(kart.h) * 20;
  kart.vz = Math.sin(kart.h) * 20;
  return kart;
};
const DRIFT_RIGHT = { steer: 1, drift: true };

test('a new kart is idle: drift state and boostLevel', () => {
  const kart = createKart({ id: 'x' });
  assert.deepEqual(kart.drift, { sliding: false, dir: 0, charge: 0, level: 0 });
  assert.equal(kart.boostLevel, 0);
});

test('drift starts only with the button, enough steer and enough speed', () => {
  const noSteer = straight();
  runFlat(noSteer, { steer: 0, drift: true }, 1);
  assert.equal(noSteer.drift.sliding, false);
  const weak = straight();
  runFlat(weak, { steer: 0.2, drift: true }, 0.5);
  assert.equal(weak.drift.sliding, false);
  const slow = kartAt(10, 0, { speed: 4 });
  runFlat(slow, { steer: 1, drift: true, throttle: 0 }, 0.2);
  assert.equal(slow.drift.sliding, false);
  const noButton = straight();
  runFlat(noButton, { steer: 1 }, 0.5);
  assert.equal(noButton.drift.sliding, false);
  const ok = straight();
  runFlat(ok, DRIFT_RIGHT, 0.1);
  assert.equal(ok.drift.sliding, true);
  assert.equal(ok.drift.dir, 1);
});

test('steer added while drift is held starts the slide later', () => {
  const kart = straight();
  runFlat(kart, { steer: 0, drift: true }, 0.5);
  assert.equal(kart.drift.sliding, false);
  runFlat(kart, { steer: -1, drift: true }, 0.1);
  assert.equal(kart.drift.sliding, true);
  assert.equal(kart.drift.dir, -1);
});

test('drift direction locks until the slide ends', () => {
  const kart = straight();
  runFlat(kart, DRIFT_RIGHT, 0.3);
  runFlat(kart, { steer: -1, drift: true }, 0.5);
  assert.equal(kart.drift.sliding, true);
  assert.equal(kart.drift.dir, 1);
  assert.ok(kart.h > 0, 'still turning right');
});

test('the body points past the travel direction while sliding, mirrored for left', () => {
  for (const dir of [1, -1]) {
    const kart = straight();
    runFlat(kart, { steer: dir, drift: true }, 1);
    const slip = Math.atan2(kart.vz, kart.vx) - kart.h;
    assert.ok(Math.abs(slip) > 0.35 && Math.sign(slip) === -dir, `slip ${slip}`);
  }
});

test('charge levels arrive at 1, 2 and 3 s of sliding', () => {
  const kart = straight();
  const levelAt = (secs) => {
    runFlat(kart, DRIFT_RIGHT, secs - kart.drift.charge);
    return kart.drift.level;
  };
  assert.equal(levelAt(0.5), 0);
  assert.equal(levelAt(1.1), 1);
  assert.equal(levelAt(2.1), 2);
  assert.equal(levelAt(3.1), 3);
  assert.equal(levelAt(4), 3);
});

test('releasing at level 0 grants nothing, and the drift state resets', () => {
  const kart = straight();
  runFlat(kart, DRIFT_RIGHT, 0.6);
  runFlat(kart, { steer: 1 }, DT);
  assert.equal(kart.boost, 0);
  assert.equal(kart.boostLevel, 0);
  assert.deepEqual(kart.drift, { sliding: false, dir: 0, charge: 0, level: 0 });
});

test('boost time and top speed rise strictly with the drift level', () => {
  const boosts = [1.2, 2.2, 3.2].map((secs) => {
    const kart = straight();
    runFlat(kart, DRIFT_RIGHT, secs);
    runFlat(kart, { steer: 0 }, DT);
    const out = { level: kart.boostLevel, time: kart.boost, peak: 0 };
    while (kart.boost > 0) {
      stepKart(kart, { steer: 0 }, DT, flat);
      out.peak = Math.max(out.peak, kart.speed);
    }
    assert.equal(kart.boostLevel, 0, 'boostLevel returns to 0 when the boost ends');
    return out;
  });
  assert.deepEqual(boosts.map((b) => b.level), [1, 2, 3]);
  assert.ok(boosts[0].time < boosts[1].time && boosts[1].time < boosts[2].time);
  assert.ok(boosts[0].peak < boosts[1].peak && boosts[1].peak < boosts[2].peak);
});

test('aimY never affects a drift', () => {
  const kart = straight();
  runFlat(kart, DRIFT_RIGHT, 2.2);
  runFlat(kart, { ...DRIFT_RIGHT, aimY: 1 }, 0.5);
  assert.equal(kart.drift.sliding, true);
  assert.equal(kart.drift.level, 2);
});

test('falling below the minimum speed ends the slide with no boost', () => {
  const kart = straight();
  runFlat(kart, { steer: 1, drift: true }, 1.2);
  runFlat(kart, { steer: 1, drift: true, throttle: 0 }, 6);
  assert.equal(kart.drift.sliding, false);
  assert.equal(kart.boost, 0);
});

test('charging pauses off-road', () => {
  const kart = kartAt(5, 12, { speed: 12 });
  kart.surface = 'grass';
  run(kart, DRIFT_RIGHT, 0.5);
  assert.equal(kart.drift.sliding, true);
  assert.equal(kart.drift.charge, 0);
});

test('a boost pad reads as level 0 and never shortens a running drift boost', () => {
  const pad = track.boostPads[0];
  const pads = kartAt(pad.s - 8, pad.lateral, { speed: 20, vx: 20 });
  pads.boost = 0.3;
  pads.boostLevel = 2;
  let tookOver = false;
  for (let i = 0; i < 120 && !tookOver; i++) {
    stepKart(pads, {}, DT, track);
    tookOver = pads.boost > 0.5;
  }
  assert.ok(tookOver, 'the pad took over the nearly spent drift boost');
  assert.equal(pads.boostLevel, 0);
  const drifter = kartAt(pad.s - 2, pad.lateral, { speed: 20, vx: 20 });
  drifter.boost = 2;
  drifter.boostLevel = 3;
  stepKart(drifter, {}, DT, track);
  assert.ok(drifter.boost > 1.9 && drifter.boostLevel === 3);
});

test('a weaker drift release never cuts short or recolors a stronger running boost', () => {
  const kart = straight();
  kart.boost = 5;
  kart.boostLevel = 3;
  runFlat(kart, DRIFT_RIGHT, 1.2);
  const left = kart.boost;
  runFlat(kart, { steer: 0 }, DT);
  assert.equal(kart.boostLevel, 3);
  assert.ok(kart.boost > left - 0.05, `boost ${kart.boost} kept from ${left}`);
});

test('no brake: aimY and a stray brake field leave the kart accelerating, and speed never goes negative', () => {
  const kart = kartAt(10, 0, { speed: 10, vx: 10 });
  run(kart, { aimY: 1, brake: 1 }, 2);
  assert.ok(kart.speed > 10, `speed ${kart.speed}`);
  const coast = kartAt(10, 0, { speed: 3, vx: 3 });
  run(coast, { throttle: 0 }, 5);
  assert.equal(coast.speed, 0);
});

test('a mushroom keeps top speed off-road, a plain kart is held to OFFROAD_TOP', () => {
  const plain = kartAt(10, 12, { speed: 20, vx: 20, surface: 'grass' });
  const shroom = kartAt(10, 12, { speed: 20, vx: 20, surface: 'grass', mushroom: 3 });
  run(plain, {}, 1.5);
  run(shroom, {}, 1.5);
  assert.equal(plain.surface, 'grass');
  assert.ok(plain.speed < TOP_SPEED * 0.7, `plain ${plain.speed}`);
  assert.ok(shroom.speed > TOP_SPEED * 0.9, `shroom ${shroom.speed}`);
});

// ── Hits ─────────────────────────────────────────────────────────────────────

test('applyHit locks the controls, cancels drift and boost, and drops speed under 10% in 0.3 s', () => {
  const kart = kartAt(10, 0, { speed: 20, vx: 20, boost: 1, boostLevel: 2, mushroom: 1 });
  kart.drift = { sliding: true, dir: 1, charge: 2, level: 2 };
  assert.equal(applyHit(kart, 'spin'), true);
  assert.deepEqual(kart.hit, { kind: 'spin', t: 1.2, total: 1.2 });
  assert.equal(kart.drift.sliding, false);
  assert.equal(kart.boost, 0);
  assert.equal(kart.mushroom, 0);
  const h = kart.h;
  const v0 = kart.speed;
  run(kart, { steer: 1, drift: true, aimY: 1 }, 0.3);
  assert.ok(kart.speed <= v0 * 0.1, `speed ${kart.speed}`);
  assert.equal(kart.h, h);
  assert.equal(kart.drift.sliding, false);
});

test('a hit ends after its time, then 1 s of immunity makes applyHit a no-op', () => {
  const kart = kartAt(10, 0, { speed: 20, vx: 20 });
  applyHit(kart, 'tumble');
  assert.equal(kart.hit.total, 1.4);
  assert.equal(applyHit(kart, 'spin'), false);
  assert.equal(kart.hit.kind, 'tumble');
  run(kart, {}, 1.5);
  assert.equal(kart.hit, null);
  assert.ok(kart.invuln > 0 && kart.invuln <= 1);
  assert.equal(applyHit(kart, 'spin'), false);
  run(kart, {}, 1.1);
  assert.equal(kart.invuln, 0);
  assert.equal(applyHit(kart, 'spin'), true);
});

test('a boost pad does not boost a kart that is spinning out', () => {
  const pad = track.boostPads[0];
  const kart = kartAt(pad.s, pad.lateral, { speed: 10 });
  applyHit(kart, 'spin');
  run(kart, {}, 0.2);
  assert.equal(kart.boost, 0);
});

test('throttle 0 coasts, a missing throttle drives', () => {
  const coast = kartAt(10, 0, { speed: 15, vx: 15 });
  run(coast, { throttle: 0 }, 1);
  assert.ok(coast.speed < 15 && coast.speed > 10);
  const drive = kartAt(10);
  run(drive, {}, 2);
  assert.ok(drive.speed > 10);
});

// Travel-direction turn rate (rad/s, positive = right) over 1 s of a held drift, after the slip settles.
function driftTurnRate(steer) {
  const kart = straight();
  runFlat(kart, { steer: 1, drift: true }, 0.3);
  const angle = () => Math.atan2(kart.vz, kart.vx);
  const before = angle();
  runFlat(kart, { steer, drift: true }, 1);
  return angle() - before;
}

test('steering out of a drift turns less than neutral, neutral less than in, and none reverse', () => {
  const out = driftTurnRate(-1);
  const neutral = driftTurnRate(0);
  const inward = driftTurnRate(1);
  assert.ok(out > 0, 'steering fully out still curves the same way');
  assert.ok(out < neutral && neutral < inward);
  assert.ok(out <= 0.2 * 1.05, `fully out turns at ${out}`);
});

test('a drift can follow a gentle R85 arc at 20 m/s without turning faster than the arc needs', () => {
  const need = 20 / 85; // rad/s
  let lo = -1;
  let hi = 0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (driftTurnRate(mid) > need) hi = mid;
    else lo = mid;
  }
  assert.ok(lo > -1, 'a steer value inside the range matches the arc');
  const rate = driftTurnRate(lo);
  assert.ok(rate <= need * 1.05 && rate > need * 0.9, `rate ${rate} vs needed ${need}`);
  const kart = straight();
  runFlat(kart, { steer: 1, drift: true }, 0.3);
  runFlat(kart, { steer: lo, drift: true }, 3);
  assert.equal(kart.drift.sliding, true);
  assert.ok(kart.speed > 16);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track.js';
import { createKart, stepKart, resolveKartCollisions, TOP_SPEED } from './physics.js';

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
    stepKart(kart, { steer: 0, gas: true }, DT, track);
    t += DT;
  }
  assert.ok(t > 2.5 && t < 3.5, `took ${t}`);
  run(kart, { steer: 0, gas: true }, 3);
  assert.ok(kart.speed <= TOP_SPEED + 1e-6 && kart.speed > TOP_SPEED - 0.5);
});

test('coasting slows the kart at 2 to 4 m/s^2', () => {
  const kart = kartAt(10, 0, { speed: 20, vx: 20 });
  run(kart, { steer: 0, gas: false }, 1);
  const decel = 20 - kart.speed;
  assert.ok(decel > 2 && decel < 4.5, `decel ${decel}`);
  run(kart, { steer: 0, gas: false }, 15);
  assert.equal(kart.speed, 0);
});

test('off-road top speed is about half', () => {
  const kart = kartAt(5, 12);
  assert.equal(track.surfaceAt(5, 12).kind, 'grass');
  run(kart, { steer: 0, gas: true }, 7);
  assert.equal(kart.surface, 'grass');
  assert.ok(kart.speed > TOP_SPEED * 0.45 && kart.speed < TOP_SPEED * 0.55, `speed ${kart.speed}`);
});

test('curbs keep full speed', () => {
  const t1 = track.pieceRange('t1');
  const kart = kartAt((t1.s0 + t1.s1) / 2, 8.5, { speed: 22 });
  stepKart(kart, { steer: 0, gas: true }, DT, track);
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
    stepKart(kart, { steer: 0, gas: false }, DT, track);
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
    stepKart(kart, { steer: 0, gas: true }, DT, track);
    peak = Math.max(peak, kart.speed);
  }
  assert.ok(peak > 26, `peak ${peak}`);
  run(kart, { steer: 0, gas: true }, 5);
  assert.ok(kart.speed <= TOP_SPEED + 0.1);
});

test('kart y follows heightAt up the hill', () => {
  const hill = track.pieceRange('hill');
  const kart = kartAt(hill.s0 + 5, 0, { speed: 15, vx: 15 });
  let sawClimb = false;
  for (let i = 0; i < 200; i++) {
    const fr = track.frameAt(kart.s);
    stepKart(kart, { steer: Math.max(-1, Math.min(1, Math.atan2(fr.fz, fr.fx) - kart.h)) * 3, gas: true }, DT, track);
    assert.ok(Math.abs(kart.y - track.heightAt(kart.s, kart.lateral)) < 1e-9);
    if (kart.y > 1) sawClimb = true;
  }
  assert.ok(sawClimb);
});

test('pitch tilts nose up on a climb and roll follows the sweeper bank', () => {
  const hill = track.pieceRange('hill');
  const climbing = kartAt(hill.s0 + 20, 0, { speed: 5 });
  run(climbing, { steer: 0, gas: false }, 0.1);
  assert.ok(climbing.pitch > 0.05);

  const sw = track.pieceRange('sweeper');
  const banked = kartAt((sw.s0 + sw.s1) / 2, 0);
  run(banked, { steer: 0, gas: false }, 0.5);
  assert.ok(banked.roll > 0.1, `roll ${banked.roll}`);
});

test('steering right turns the heading clockwise (h grows)', () => {
  const kart = kartAt(10, 0, { speed: 15 });
  const h0 = kart.h;
  run(kart, { steer: 1, gas: true }, 0.3);
  assert.ok(kart.h > h0);
  const left = kartAt(10, 0, { speed: 15 });
  run(left, { steer: -1, gas: true }, 0.3);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiltSensor, curveFromGravity, downFromSample, leanFromGravity } from './tilt.js';
import { tiltForThrow } from './throw.js';

const G = 9.81;

function bankedSample(bankDeg, pitchDeg = 0) {
  const bank = bankDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  const down = { x: G * Math.sin(bank), y: -G * Math.cos(bank), z: 0 };
  const y = down.y * Math.cos(pitch) - down.z * Math.sin(pitch);
  const z = down.y * Math.sin(pitch) + down.z * Math.cos(pitch);
  return { ax: -down.x, ay: -y, az: -z, alpha: 0, beta: 0, gamma: 0 };
}

test('level gravity is lean 0 even with a violent wrist rate', () => {
  const sample = { ...bankedSample(0), gamma: 900 };
  assert.deepEqual(leanFromGravity(downFromSample(sample)), { lean: 0, degrees: 0 });
});

test('player left is negative lean, player right is positive', () => {
  assert.equal(leanFromGravity(downFromSample(bankedSample(20))).lean, -0.5);
  assert.equal(leanFromGravity(downFromSample(bankedSample(-20))).lean, 0.5);
  assert.equal(leanFromGravity(downFromSample(bankedSample(50))).lean, -1);
});

test('a hard mid-swing bank that settles level before release is a straight ball', () => {
  const sensor = createTiltSensor();
  for (let i = 0; i < 40; i++) sensor.update(bankedSample(45));
  for (let i = 0; i < 120; i++) sensor.update(bankedSample(0));
  const releaseLean = sensor.read(1).lean;
  assert.ok(Math.abs(releaseLean) < 1e-6, `release lean ${releaseLean}`);
  assert.deepEqual(
    tiltForThrow({ pressLean: 0, releaseLean }),
    { angle: 0, hookM: 0 },
  );
});

test('curve sensitivity scales in-range twist linearly and leaves the deadzone fixed', () => {
  const down = downFromSample(bankedSample(11));
  const mild = Math.abs(curveFromGravity(down, 1).lean);
  const doubled = Math.abs(curveFromGravity(down, 2).lean);
  const quadrupled = Math.abs(curveFromGravity(down, 4).lean);
  assert.ok(Math.abs(mild - 0.2) < 1e-9, `lean ${mild}`);
  assert.ok(Math.abs(doubled - mild * 2) < 1e-9);
  assert.ok(Math.abs(quadrupled - mild * 4) < 1e-9);
  assert.equal(curveFromGravity(downFromSample(bankedSample(4)), 4).lean, 0);
  assert.equal(Math.abs(curveFromGravity(downFromSample(bankedSample(13)), 4).lean), 1);
});

test('higher tilt sensitivity reaches full lean sooner and shrinks the level window', () => {
  const mild = Math.abs(leanFromGravity(downFromSample(bankedSample(12))).lean);
  const sensitive = Math.abs(leanFromGravity(downFromSample(bankedSample(20)), 2).lean);
  assert.ok(mild < 0.3, `default lean ${mild}`);
  assert.equal(sensitive, 1);
  assert.notEqual(leanFromGravity(downFromSample(bankedSample(4)), 2).lean, 0);
});

test('inside the deadzone is level', () => {
  assert.equal(leanFromGravity(downFromSample(bankedSample(4))).lean, 0);
});

test('pitching the phone does not change lean', () => {
  const flat = leanFromGravity(downFromSample(bankedSample(20))).lean;
  for (const pitch of [-60, -30, 15, 45, 80]) {
    const lean = leanFromGravity(downFromSample(bankedSample(20, pitch))).lean;
    assert.ok(Math.abs(lean - flat) < 1e-9, `pitch ${pitch} gave lean ${lean}, flat gave ${flat}`);
  }
});

test('free fall reads as level', () => {
  assert.deepEqual(leanFromGravity({ x: 0.5, y: 0, z: 0 }), { lean: 0, degrees: 0 });
});

test('sensor reads level before any sample and settles toward the bank', () => {
  const sensor = createTiltSensor();
  assert.deepEqual(sensor.read(), { lean: 0, degrees: 0 });
  for (let i = 0; i < 120; i++) sensor.update(bankedSample(-20));
  assert.ok(Math.abs(sensor.read().lean - 0.5) < 1e-6);
});

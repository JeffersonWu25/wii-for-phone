import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiltSensor, downFromSample, leanFromDegrees, leanFromGravity } from './tilt.js';

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

test('curve degrees scale the twist and ignore the starting slant', () => {
  const twist = 20;
  const wide = Math.abs(leanFromDegrees(twist, 70));
  const tight = Math.abs(leanFromDegrees(twist, 35));
  assert.ok(wide < tight && wide > 0, `70° window ${wide}, 35° window ${tight}`);
  assert.equal(leanFromDegrees(0, 15), 0);
  assert.equal(leanFromDegrees(4, 35), 0);
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

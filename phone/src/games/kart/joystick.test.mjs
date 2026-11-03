import test from 'node:test';
import assert from 'node:assert/strict';
import { stickFromOffset, clampToRadius } from './joystick.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test('inside the radial dead zone gives zero for both axes', () => {
  assert.deepEqual(stickFromOffset(0, 0, 100), { steer: 0, brake: 0 });
  assert.deepEqual(stickFromOffset(11, 0, 100), { steer: 0, brake: 0 });
  assert.deepEqual(stickFromOffset(8, 8, 100), { steer: 0, brake: 0 });
  assert.deepEqual(stickFromOffset(0, 11, 100), { steer: 0, brake: 0 });
});

test('full sideways deflection and beyond clamps to +/-1', () => {
  close(stickFromOffset(100, 0, 100).steer, 1);
  close(stickFromOffset(500, 0, 100).steer, 1);
  close(stickFromOffset(-500, 0, 100).steer, -1);
  assert.equal(stickFromOffset(500, 0, 100).brake, 0);
});

test('steer is continuous at the dead-zone edge and symmetric', () => {
  close(stickFromOffset(12.0001, 0, 100).steer, 0.0001 / 100 / 0.88);
  close(stickFromOffset(56, 0, 100).steer, -stickFromOffset(-56, 0, 100).steer);
  close(stickFromOffset(56, 0, 100).steer, 0.5);
});

test('pushing up gives no brake', () => {
  assert.equal(stickFromOffset(0, -100, 100).brake, 0);
  assert.equal(stickFromOffset(0, -500, 100).brake, 0);
});

test('pushing down gives brake rescaled past the dead zone', () => {
  close(stickFromOffset(0, 100, 100).brake, 1);
  close(stickFromOffset(0, 500, 100).brake, 1);
  close(stickFromOffset(0, 56, 100).brake, 0.5);
  assert.equal(stickFromOffset(0, 100, 100).steer, 0);
});

test('diagonal gives both steer and brake', () => {
  const s = stickFromOffset(-60, 60, 100);
  assert.ok(s.steer < 0 && s.brake > 0);
  close(s.brake, -s.steer);
});

test('radial clamp: a far diagonal is limited to the circle, not the square', () => {
  const c = clampToRadius(300, 300, 100);
  close(Math.hypot(c.x, c.y), 100);
  const s = stickFromOffset(300, 300, 100);
  close(s.steer, (Math.SQRT1_2 - 0.12) / 0.88);
  assert.ok(s.steer < 1);
  assert.deepEqual(clampToRadius(30, 40, 100), { x: 30, y: 40 });
});

test('invalid radius yields zero', () => {
  assert.deepEqual(stickFromOffset(10, 10, 0), { steer: 0, brake: 0 });
  assert.deepEqual(stickFromOffset(10, 10, NaN), { steer: 0, brake: 0 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { steerFromOffset } from './joystick.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test('inside the dead zone is zero', () => {
  assert.equal(steerFromOffset(0, 100), 0);
  assert.equal(steerFromOffset(11, 100), 0);
  assert.equal(steerFromOffset(-12, 100), 0);
});

test('full deflection and beyond clamps to +/-1', () => {
  close(steerFromOffset(100, 100), 1);
  close(steerFromOffset(500, 100), 1);
  close(steerFromOffset(-500, 100), -1);
});

test('continuous at the dead-zone edge and symmetric', () => {
  close(steerFromOffset(12.0001, 100), 0.0001 / 100 / 0.88);
  close(steerFromOffset(56, 100), -steerFromOffset(-56, 100));
  close(steerFromOffset(56, 100), 0.5);
});

test('invalid radius yields zero', () => {
  assert.equal(steerFromOffset(10, 0), 0);
  assert.equal(steerFromOffset(10, NaN), 0);
});

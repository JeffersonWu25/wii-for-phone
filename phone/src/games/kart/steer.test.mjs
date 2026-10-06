import test from 'node:test';
import assert from 'node:assert/strict';
import { steerFromTilt, stickSteer, tiltAngle } from './steer.js';

test('a flat phone is neutral', () => {
  const angle = tiltAngle(0, 0, 9.8, 0);
  assert.ok(Math.abs(angle) < 0.02);
  assert.equal(steerFromTilt(angle, 0), 0);
});

test('tilt to the side becomes full steer', () => {
  const angle = tiltAngle(9.8, 0, 0.2, 0);
  assert.ok(steerFromTilt(angle, 0) > 0.9);
});

test('landscape uses the other axis', () => {
  const portrait = tiltAngle(0, 6, 6, 0);
  const landscape = tiltAngle(0, 6, 6, 90);
  assert.ok(Math.abs(landscape) > Math.abs(portrait));
});

test('the stick maps left and right onto steer', () => {
  assert.equal(stickSteer(0, 80), 0);
  assert.equal(stickSteer(80, 80), 1);
  assert.equal(stickSteer(-160, 80), -1);
});

test('calibration makes the current tilt straight', () => {
  const angle = tiltAngle(2, 0, 9.8, 0);
  assert.equal(steerFromTilt(angle, angle), 0);
});

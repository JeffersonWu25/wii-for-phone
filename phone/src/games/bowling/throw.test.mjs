import test from 'node:test';
import assert from 'node:assert/strict';
import { composeThrow, powerFromSwing, twistFromLeans } from './throw.js';

test('no samples is half power', () => {
  assert.equal(powerFromSwing([]), 0.5);
});

test('a phone at rest is zero power', () => {
  assert.equal(powerFromSwing([{ ax: 0, ay: -9.81, az: 0 }]), 0);
});

test('composeThrow builds the wire message', () => {
  assert.deepEqual(
    composeThrow({
      samples: [],
      aim: { offset: 0.2, angle: -0.4 },
      tilt: { angle: -0.4, spin: 0.5 },
      tuning: { speed: 1.2, curveDeg: 20 },
    }),
    { type: 'throw', power: 0.5, aim: { offset: 0.2, angle: -0.4 }, tilt: { angle: -0.4, spin: 0.5 }, tuning: { speed: 1.2 } },
  );
});

test('holding a lean is no twist, and a release past it is the difference', () => {
  assert.equal(twistFromLeans(-0.4, -0.4), 0);
  assert.equal(twistFromLeans(0, -0.5), -0.5);
  assert.equal(twistFromLeans(0, 0.5), 0.5);
  assert.equal(twistFromLeans(-0.4, -1), -0.6);
});

test('twist clamps to a full hook', () => {
  assert.equal(twistFromLeans(-1, 1), 1);
  assert.equal(twistFromLeans(1, -1), -1);
});

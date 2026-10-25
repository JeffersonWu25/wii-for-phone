import test from 'node:test';
import assert from 'node:assert/strict';
import { composeThrow, powerFromSwing, tiltForThrow } from './throw.js';

test('no samples is half power', () => {
  assert.equal(powerFromSwing([]), 0.5);
});

test('a phone at rest is zero power', () => {
  assert.equal(powerFromSwing([{ ax: 0, ay: -9.81, az: 0 }]), 0);
});

test('composeThrow builds the wire message and keeps the curve slider', () => {
  assert.deepEqual(
    composeThrow({
      samples: [],
      aim: { offset: 0.2, angle: -0.4 },
      tilt: { angle: -0.4, spin: 0.5 },
      tuning: { speed: 1.2, curve: 1.5 },
    }),
    { type: 'throw', power: 0.5, aim: { offset: 0.2, angle: -0.4 }, tilt: { angle: -0.4, spin: 0.5 }, tuning: { speed: 1.2, curve: 1.5 } },
  );
});

test('press lean aims, release lean against level is the hook', () => {
  assert.deepEqual(tiltForThrow({ pressLean: -0.4, releaseLean: 0 }), { angle: -0.4, spin: 0 });
  assert.deepEqual(tiltForThrow({ pressLean: 0, releaseLean: 0.5 }), { angle: 0, spin: 0.5 });
  assert.deepEqual(tiltForThrow({ pressLean: -0.4, releaseLean: -0.4 }), { angle: -0.4, spin: -0.4 });
});

test('tilt for throw clamps to a full lean', () => {
  assert.deepEqual(tiltForThrow({ pressLean: -2, releaseLean: 3 }), { angle: -1, spin: 1 });
});

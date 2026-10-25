import test from 'node:test';
import assert from 'node:assert/strict';
import { composeThrow, powerFromSwing, tiltForThrow } from './throw.js';

test('no samples is half power', () => {
  assert.equal(powerFromSwing([]), 0.5);
});

test('a phone at rest is zero power', () => {
  assert.equal(powerFromSwing([{ ax: 0, ay: -9.81, az: 0 }]), 0);
});

test('composeThrow builds the wire message without phone-only feel knobs', () => {
  assert.deepEqual(
    composeThrow({
      samples: [],
      aim: { offset: 0.2, angle: -0.4 },
      tilt: { angle: -0.4, hookM: 0.225 },
      tuning: { speed: 1.2, curve: 4, maxCurve: 0.9 },
    }),
    { type: 'throw', power: 0.5, aim: { offset: 0.2, angle: -0.4 }, tilt: { angle: -0.4, hookM: 0.225 }, tuning: { speed: 1.2 } },
  );
});

test('press lean aims and release lean scales the chosen max curve', () => {
  assert.deepEqual(
    tiltForThrow({ pressLean: -0.4, releaseLean: 0, maxCurve: 0.45 }),
    { angle: -0.4, hookM: 0 },
  );
  assert.deepEqual(
    tiltForThrow({ pressLean: 0, releaseLean: 0.5, maxCurve: 0.45 }),
    { angle: 0, hookM: 0.225 },
  );
  assert.deepEqual(
    tiltForThrow({ pressLean: 0, releaseLean: 0.5, maxCurve: 0.9 }),
    { angle: 0, hookM: 0.45 },
  );
  assert.deepEqual(
    tiltForThrow({ pressLean: -0.4, releaseLean: -1, maxCurve: 0.45 }),
    { angle: -0.4, hookM: -0.45 },
  );
});

test('tilt for throw clamps lean and max curve', () => {
  assert.deepEqual(
    tiltForThrow({ pressLean: -2, releaseLean: 3, maxCurve: 5 }),
    { angle: -1, hookM: 1.3 },
  );
});

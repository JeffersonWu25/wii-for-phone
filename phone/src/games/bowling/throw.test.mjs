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
      tuning: { speed: 1.2, curve: 4 },
    }),
    { type: 'throw', power: 0.5, aim: { offset: 0.2, angle: -0.4 }, tilt: { angle: -0.4, hookM: 0.225 }, tuning: { speed: 1.2 } },
  );
});

test('press lean aims and full release lean is the fixed max curve', () => {
  assert.deepEqual(
    tiltForThrow({ pressLean: -0.4, releaseLean: 0 }),
    { angle: -0.4, hookM: 0 },
  );
  assert.deepEqual(
    tiltForThrow({ pressLean: 0, releaseLean: 0.5 }),
    { angle: 0, hookM: 0.225 },
  );
  assert.deepEqual(
    tiltForThrow({ pressLean: -0.4, releaseLean: -1 }),
    { angle: -0.4, hookM: -0.45 },
  );
});

test('tilt for throw clamps lean to the fixed max curve', () => {
  assert.deepEqual(
    tiltForThrow({ pressLean: -2, releaseLean: 3 }),
    { angle: -1, hookM: 0.45 },
  );
});

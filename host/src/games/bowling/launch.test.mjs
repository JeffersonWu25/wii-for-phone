import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_DISTANCE, launchFromMessage, launchFromThrow, parseThrow } from './launch.js';
import { TUNING_CONTROLS } from '../../../../phone/src/games/bowling/tuning.js';

function throwMsg({ power = 0.5, offset = 0, angle = 0, tiltAngle = 0, spin = 0, speed = 1, curve = 1 } = {}) {
  return { type: 'throw', power, aim: { offset, angle }, tilt: { angle: tiltAngle, spin }, tuning: { speed, curve } };
}

function breakAtPins(launch) {
  const speed = Math.hypot(launch.velocity.x, launch.velocity.z);
  return 0.5 * launch.hookAccel * (LANE_DISTANCE / speed) ** 2;
}

test('lane distance runs positive from the foul line to the head pin', () => {
  assert.equal(LANE_DISTANCE, 15);
});

test('a centered straight throw goes down the middle', () => {
  assert.deepEqual(launchFromMessage(throwMsg({ power: 0.5 })), {
    startX: 0,
    velocity: { x: 0, z: -6.5 },
    hookAccel: 0,
  });
});

test('a held lean slants the release and adds no hook', () => {
  const left = launchFromMessage(throwMsg({ tiltAngle: -1 }));
  assert.ok(left.velocity.x < 0);
  assert.equal(left.hookAccel, 0);
});

test('phone lean and d-pad aim add, then clamp to the aim range', () => {
  const full = launchFromMessage(throwMsg({ angle: 1 })).velocity.x;
  const stacked = launchFromMessage(throwMsg({ angle: 1, tiltAngle: 1 })).velocity.x;
  assert.equal(stacked, full);
});

test('positive spin hooks right, negative spin hooks left', () => {
  assert.ok(launchFromMessage(throwMsg({ spin: 1 })).hookAccel > 0);
  assert.ok(launchFromMessage(throwMsg({ spin: -1 })).hookAccel < 0);
});

test('full spin breaks 0.45 m at the pins', () => {
  assert.ok(Math.abs(breakAtPins(launchFromMessage(throwMsg({ spin: 1 }))) - 0.45) < 1e-12);
});

test('the curve field does not scale the hook again', () => {
  const once = launchFromMessage(throwMsg({ spin: 0.6, curve: 1 })).hookAccel;
  const twice = launchFromMessage(throwMsg({ spin: 0.6, curve: 2 })).hookAccel;
  assert.equal(once, twice);
});
test('speed tuning does not change break at the pins', () => {
  const slow = breakAtPins(launchFromMessage(throwMsg({ spin: 0.6, speed: 0.6 })));
  const fast = breakAtPins(launchFromMessage(throwMsg({ spin: 0.6, speed: 1.5 })));
  assert.ok(Math.abs(slow - fast) < 1e-12, `slow ${slow} fast ${fast}`);
});

test('release speed caps at 14 m/s', () => {
  const { velocity } = launchFromMessage(throwMsg({ power: 1, speed: 3 }));
  assert.equal(Math.hypot(velocity.x, velocity.z), 14);
});

test('start position clamps inside the lane', () => {
  assert.equal(launchFromThrow(parseThrow(throwMsg({ offset: 1 }))).startX, 0.4);
  assert.equal(launchFromMessage(throwMsg({ offset: -5 })).startX, -0.4);
});

test('a spin-only message is rejected', () => {
  assert.equal(parseThrow({ type: 'throw', power: 0.5, spin: 0.8, aimOffset: 0, aimAngle: 0 }), null);
  assert.equal(launchFromMessage({ type: 'throw', power: 0.5, spin: 0.8 }), null);
});

test('a lean-only tilt is rejected', () => {
  const msg = throwMsg();
  msg.tilt = { lean: 1 };
  assert.equal(parseThrow(msg), null);
});

test('non-finite fields are rejected', () => {
  assert.equal(parseThrow(throwMsg({ spin: NaN })), null);
  assert.equal(parseThrow(throwMsg({ speed: Infinity })), null);
});

test('out-of-range fields clamp', () => {
  assert.deepEqual(parseThrow(throwMsg({ power: 2, offset: -3, angle: 3, tiltAngle: 4, spin: -4, speed: 10 })), {
    power: 1,
    aim: { offset: -1, angle: 1 },
    tilt: { angle: 1, spin: -1 },
    tuning: { speed: 3, curve: 1 },
  });
});

test('every phone slider extreme survives parsing', () => {
  for (const { key, min, max } of TUNING_CONTROLS) {
    for (const value of [min, max]) {
      assert.equal(parseThrow(throwMsg({ [key]: value })).tuning[key], value, `${key}=${value}`);
    }
  }
});

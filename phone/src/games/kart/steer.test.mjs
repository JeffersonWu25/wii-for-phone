import test from 'node:test';
import assert from 'node:assert/strict';
import { STICK, stickInput } from './steer.js';

const CENTER = { steer: 0, drift: false, knobX: 0, knobY: 0 };

test('policy zones are ordered', () => {
  assert.ok(STICK.deadZone >= 0);
  assert.ok(STICK.deadZone < STICK.driftAt);
  assert.ok(STICK.driftAt <= 1);
});

test('a centred stick is neutral', () => {
  assert.deepEqual(stickInput(0, 0, 100), CENTER);
});

test('a nudge inside the dead zone steers +0 and does not drift', () => {
  const inside = stickInput(8, 0, 100);
  assert.equal(inside.steer, 0);
  assert.equal(inside.drift, false);
  const onEdge = stickInput(STICK.deadZone * 100, 0, 100);
  assert.equal(onEdge.steer, 0);
  assert.equal(onEdge.drift, false);
  assert.equal(stickInput(-8, 4, 100).steer, 0);
});

test('stick right turns right and stick left is the mirror', () => {
  const right = stickInput(40, 10, 100);
  const left = stickInput(-40, 10, 100);
  assert.ok(right.steer < 0);
  assert.equal(left.steer, -right.steer);
  assert.equal(left.drift, right.drift);
  assert.equal(left.knobX, -right.knobX);
  assert.equal(left.knobY, right.knobY);
});

test('half deflection is a gentle turn', () => {
  const half = stickInput(50, 0, 100);
  const mag = Math.abs(half.steer);
  assert.ok(mag > 0.15 && mag < 0.45, `half ${half.steer}`);
  assert.equal(half.drift, false);
});

test('just inside the rim steers hard without drifting', () => {
  const m = STICK.driftAt - 0.01;
  const input = stickInput(m * 100, 0, 100);
  assert.equal(input.drift, false);
  const mag = Math.abs(input.steer);
  assert.ok(mag > 0.95, `steer ${input.steer}`);
  assert.ok(mag < 1, `steer ${input.steer}`);
});

test('the rim drifts at full lock', () => {
  const r = 120;
  const input = stickInput(-r, 0, r);
  assert.equal(input.steer, 1);
  assert.equal(input.drift, true);
  assert.equal(input.knobX, -1);
  assert.equal(input.knobY, 0);
});

test('the drift threshold is inclusive', () => {
  const input = stickInput(92, 0, 100);
  assert.equal(input.drift, true);
  assert.equal(input.steer, -1);
});

test('dragging past the rim clamps the knob to the unit disc and keeps direction', () => {
  const dx = 300;
  const dy = -300;
  const input = stickInput(dx, dy, 120);
  assert.equal(input.drift, true);
  assert.ok(input.steer < 0);
  assert.ok(Math.abs(input.knobX ** 2 + input.knobY ** 2 - 1) < 1e-9);
  assert.ok(Math.abs(Math.atan2(input.knobY, input.knobX) - Math.atan2(dy, dx)) < 1e-9);
});

test('vertical travel inside the disc does not change steer', () => {
  const flat = stickInput(40, 0, 100);
  const down = stickInput(40, 50, 100);
  assert.equal(down.steer, flat.steer);
  assert.notEqual(down.knobY, flat.knobY);
  assert.equal(down.drift, false);
});

test('straight up on the rim requests drift with zero steer', () => {
  const up = stickInput(0, -120, 120);
  assert.equal(up.drift, true);
  assert.equal(up.steer, 0);
  assert.equal(up.knobX, 0);
  assert.equal(up.knobY, -1);
});

test('sliding around the rim from 0° to 90° keeps drift and never increases steer', () => {
  const r = 100;
  let prev = Infinity;
  for (let deg = 0; deg <= 90; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const input = stickInput(Math.cos(rad) * r, Math.sin(rad) * r, r);
    assert.equal(input.drift, true, `drift at ${deg}`);
    const mag = Math.abs(input.steer);
    assert.ok(mag <= prev + 1e-9, `|steer| rose at ${deg}: ${mag} > ${prev}`);
    prev = mag;
  }
  assert.equal(prev, 0);
});

test('bad radius or non-finite input returns the centred input', () => {
  assert.deepEqual(stickInput(10, 10, 0), CENTER);
  assert.deepEqual(stickInput(10, 10, -5), CENTER);
  assert.deepEqual(stickInput(10, 10, NaN), CENTER);
  assert.deepEqual(stickInput(NaN, 0, 100), CENTER);
  assert.deepEqual(stickInput(0, Infinity, 100), CENTER);
  assert.deepEqual(stickInput(Infinity, -Infinity, 100), CENTER);
});

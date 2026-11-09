import test from 'node:test';
import assert from 'node:assert/strict';
import { ROULETTE_KINDS, buttonView, buzzEvents, landingScale, rouletteFrame } from './itemSlot.js';

test('roulette cycles fast then slows toward the end', () => {
  const seen = (a, b, step = 0.005) => { let n = 0, last = null; for (let t = a; t < b; t += step) { const f = rouletteFrame(t); if (f !== last) { n++; last = f; } } return n; };
  assert.ok(seen(0, 1) >= 10 && seen(0, 1) <= 13, 'about 12 changes in the fast second');
  assert.ok(seen(1.2, 1.6) < seen(0.4, 0.8), 'slower at the end');
  assert.ok(ROULETTE_KINDS.includes(rouletteFrame(0.3)));
  assert.equal(rouletteFrame(5), rouletteFrame(1.6), 'holds after the total');
});

test('landing bump goes 1 -> 1.25 -> 1', () => {
  assert.equal(landingScale(-1), 1);
  assert.equal(landingScale(0), 1);
  assert.ok(Math.abs(landingScale(0.125) - 1.25) < 1e-9);
  assert.equal(landingScale(0.25), 1);
});

test('button view: empty, rolling, ready', () => {
  assert.equal(buttonView(null).state, 'empty');
  assert.equal(buttonView({ main: null, reserve: null, rolling: false }).usable, false);
  const r = buttonView({ main: null, reserve: 'red', rolling: true, rollingReserve: false });
  assert.deepEqual([r.state, r.usable, r.reserve], ['rolling', false, 'red']);
  const ok = buttonView({ main: 'green', reserve: null, rolling: false, rollingReserve: true });
  assert.deepEqual([ok.state, ok.usable, ok.reserveRolling], ['ready', true, true]);
});

test('buzz fires on the rising edge only', () => {
  assert.deepEqual(buzzEvents({}, { incoming: true }), { incoming: true, hit: false });
  assert.deepEqual(buzzEvents({ incoming: true }, { incoming: true }), { incoming: false, hit: false });
  assert.deepEqual(buzzEvents({ hit: null }, { hit: 'spin' }), { incoming: false, hit: true });
  assert.deepEqual(buzzEvents({ hit: 'spin' }, { hit: 'spin' }), { incoming: false, hit: false });
});

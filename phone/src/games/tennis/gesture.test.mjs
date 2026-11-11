import test from 'node:test';
import assert from 'node:assert/strict';
import { finishedGesture, samplesSince } from './gesture.js';

function sample(t, gamma, beta = 0) {
  return { t, ax: 0, ay: 0, az: 0, alpha: 0, beta, gamma };
}

test('an open swing is not sent, and the closed burst uses its peak', () => {
  const rising = [200, 280, 340, 900, 1400].map((gamma, i) => sample(i * 16, gamma));
  assert.equal(finishedGesture(rising, 'swing'), null);
  const closed = finishedGesture([...rising, sample(80, 0)], 'swing');
  assert.equal(closed.gesture.hand, 'forehand');
  assert.equal(closed.gesture.shape, 'flat');
  assert.ok(Math.abs(closed.gesture.power - 1400 / 1600) < 1e-9);
  assert.equal(closed.at, 64);
});

test('a high pitch at the end of the burst is a lob, not the flat prefix', () => {
  const open = [
    sample(0, 400, 0),
    sample(16, 400, 0),
    sample(32, 500, 300),
    sample(48, 500, 300),
  ];
  assert.equal(finishedGesture(open, 'swing'), null);
  const closed = finishedGesture([...open, sample(64, 0, 0)], 'swing');
  assert.equal(closed.gesture.shape, 'lob');
  assert.ok(closed.gesture.power > 500 / 1600);
  assert.equal(closed.at, 48);
});

test('a swing from before this window is not this window\'s swing', () => {
  const old = [sample(0, 400), sample(16, 500), sample(32, 400), sample(48, 0)];
  const kept = samplesSince(old, 200);
  assert.equal(finishedGesture(kept, 'swing'), null);
  const fresh = samplesSince([
    ...old,
    sample(210, 400),
    sample(226, 500),
    sample(242, 400),
    sample(258, 0),
  ], 200);
  const done = finishedGesture(fresh, 'swing');
  assert.equal(done.gesture.hand, 'forehand');
  assert.equal(done.at, 242);
});

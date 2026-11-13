import test from 'node:test';
import assert from 'node:assert/strict';
import { gripFromOrientation } from './grip.js';

test('a screen facing the holder is a forehand', () => {
  assert.equal(gripFromOrientation({ beta: 90, gamma: 0 }), 'forehand');
  assert.equal(gripFromOrientation({ beta: 90, gamma: 55 }), 'forehand');
  assert.equal(gripFromOrientation({ beta: 90, gamma: -55 }), 'forehand');
  assert.equal(gripFromOrientation({ beta: 20, gamma: 0 }), 'forehand');
  assert.equal(gripFromOrientation({ beta: -20, gamma: 10 }), 'forehand');
  assert.equal(gripFromOrientation({ beta: 160, gamma: 0 }), 'forehand');
  assert.equal(gripFromOrientation({ beta: -160, gamma: -55 }), 'forehand');
});

test('a screen rolled away is a backhand', () => {
  assert.equal(gripFromOrientation({ beta: 90, gamma: 56 }), 'backhand');
  assert.equal(gripFromOrientation({ beta: 90, gamma: -56 }), 'backhand');
  assert.equal(gripFromOrientation({ beta: 90, gamma: 90 }), 'backhand');
  assert.equal(gripFromOrientation({ beta: 90, gamma: -90 }), 'backhand');
  assert.equal(gripFromOrientation({ beta: 20, gamma: 55.1 }), 'backhand');
  assert.equal(gripFromOrientation({ beta: -160, gamma: -90 }), 'backhand');
});

test('a flat phone returns null so the previous grip is kept', () => {
  assert.equal(gripFromOrientation({ beta: 0, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: 19.9, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: -19.9, gamma: 90 }), null);
  assert.equal(gripFromOrientation({ beta: 160.1, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: -160.1, gamma: -90 }), null);
  assert.equal(gripFromOrientation({ beta: 180, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: -180, gamma: 80 }), null);
});

test('a non-finite beta or gamma returns null', () => {
  assert.equal(gripFromOrientation({ beta: NaN, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: 90, gamma: NaN }), null);
  assert.equal(gripFromOrientation({ beta: Infinity, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: 90, gamma: -Infinity }), null);
  assert.equal(gripFromOrientation({ beta: null, gamma: 0 }), null);
  assert.equal(gripFromOrientation({ beta: 90, gamma: undefined }), null);
  assert.equal(gripFromOrientation({}), null);
  assert.equal(gripFromOrientation(null), null);
  assert.equal(gripFromOrientation(undefined), null);
});

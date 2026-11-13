import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, nextPoint, step, swing, toss, view } from './rally.js';

function singles() {
  return createMatch({
    players: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bea' }],
    sideA: ['a'],
    sideB: ['b'],
    bestOf: 3,
  });
}

function drive(match, pred, seconds = 4) {
  let t = 0;
  while (t <= seconds) {
    const v = view(match);
    if (pred(v)) return v;
    step(match, 1 / 60);
    t += 1 / 60;
  }
  return view(match);
}

test('the hitter stays swinging for a third of a second', () => {
  const match = singles();
  const id = view(match).serverId;
  toss(match, id);
  swing(match, { playerId: id, hand: 'forehand', handed: 'right', shape: 'flat', timing: 0, power: 0.7, apex: 0.5 });
  assert.equal(view(match).players.find((p) => p.id === id).swinging, true);
  step(match, 0.2);
  assert.equal(view(match).players.find((p) => p.id === id).swinging, true);
  step(match, 0.2);
  assert.equal(view(match).players.find((p) => p.id === id).swinging, false);
});

test('an unstruck toss returns to the serve without a point', () => {
  const match = singles();
  toss(match, view(match).serverId);
  step(match, 1.4);
  const v = view(match);
  assert.equal(v.phase, 'serve');
  assert.equal(v.ball, null);
  assert.equal(v.score.pointsA, '0');
  assert.equal(v.score.pointsB, '0');
});

test('a ball that lands out keeps moving after the call', () => {
  const match = singles();
  const id = view(match).serverId;
  toss(match, id);
  swing(match, { playerId: id, hand: 'forehand', handed: 'right', shape: 'flat', timing: 1, power: 0.7, apex: 0.2 });
  const called = drive(match, (v) => v.phase === 'called');
  assert.equal(called.call, 'Out');
  assert.equal(called.score.pointsB, '15');
  const bounces = called.flight.bounces;
  const y = called.ball.y;
  step(match, 0.4);
  const later = view(match);
  assert.equal(later.phase, 'called');
  assert.equal(later.score.pointsA, '0');
  assert.equal(later.score.pointsB, '15');
  assert.ok(later.ball.y !== y || later.flight.bounces > bounces);
});

test('nextPoint after an out still starts the next serve', () => {
  const match = singles();
  const id = view(match).serverId;
  toss(match, id);
  swing(match, { playerId: id, hand: 'forehand', handed: 'right', shape: 'flat', timing: 1, power: 0.7, apex: 0.2 });
  drive(match, (v) => v.phase === 'called');
  step(match, 0.4);
  nextPoint(match);
  const v = view(match);
  assert.equal(v.phase, 'serve');
  assert.equal(v.pointIndex, 1);
  assert.equal(v.ball, null);
});

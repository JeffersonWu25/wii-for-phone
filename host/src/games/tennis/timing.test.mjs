import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeTiming } from './timing.js';
import { createMatch, step } from './rally.js';
import { afterPhysics, begin, createFlow, onPhone, winnerNames } from './flow.js';

const DASH = '\u2013';

test('a perfect swing is timing 0', () => {
  assert.equal(judgeTiming({ swingAfterRecvMs: 960, contactInMs: 1000, rttMs: 80 }), 0);
});

test('an early swing is negative and a late swing is positive', () => {
  assert.equal(judgeTiming({ swingAfterRecvMs: 870, contactInMs: 1000, rttMs: 80 }), -0.5);
  assert.equal(judgeTiming({ swingAfterRecvMs: 1050, contactInMs: 1000, rttMs: 80 }), 0.5);
});

test('timing clamps at both ends', () => {
  assert.equal(judgeTiming({ swingAfterRecvMs: 960 - 180, contactInMs: 1000, rttMs: 80 }), -1);
  assert.equal(judgeTiming({ swingAfterRecvMs: 960 + 180, contactInMs: 1000, rttMs: 80 }), 1);
  assert.equal(judgeTiming({ swingAfterRecvMs: 960 - 900, contactInMs: 1000, rttMs: 80 }), -1);
  assert.equal(judgeTiming({ swingAfterRecvMs: 960 + 900, contactInMs: 1000, rttMs: 80 }), 1);
});

function singles() {
  const match = createMatch({
    players: [
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ],
    sideA: ['a'],
    sideB: ['b'],
    bestOf: 1,
  });
  const flow = createFlow(match);
  return { match, flow };
}

function advance(flow, dt, now) {
  step(flow.match, dt);
  return afterPhysics(flow, now);
}

test('the serve opens one toss window and does not repeat it every frame', () => {
  const { flow } = singles();
  const first = begin(flow, 10_000);
  assert.equal(first.type, 'tennis');
  assert.equal(first.phase, 'serve');
  assert.equal(first.scoreText, `0 ${DASH} 0`);
  assert.equal(first.gamesText, `0 ${DASH} 0`);
  assert.deepEqual(first.playing, ['a', 'b']);
  assert.equal(first.serverId, 'a');
  assert.equal(first.receiverId, 'b');
  assert.deepEqual(first.window, { playerId: 'a', windowId: 1, contactInMs: 0, kind: 'toss' });
  assert.equal(advance(flow, 0.016, 10_016), null);
  assert.equal(advance(flow, 0.016, 10_032), null);
});

test('a toss from the server opens the serve window and a stranger is ignored', () => {
  const { match, flow } = singles();
  begin(flow, 1000);
  assert.equal(onPhone(flow, { type: 'toss', playerId: 'b' }, 1100), null);
  assert.equal(match.phase, 'serve');
  const msg = onPhone(flow, { type: 'toss', playerId: 'a' }, 1200);
  assert.equal(match.phase, 'toss');
  assert.equal(msg.phase, 'toss');
  assert.deepEqual(msg.window, { playerId: 'a', windowId: 2, contactInMs: 450, kind: 'serve' });
});

test('a serve swing uses the phone pose and not the clock, then opens the return window', () => {
  const { match, flow } = singles();
  begin(flow, 1000);
  onPhone(flow, { type: 'toss', playerId: 'a' }, 1100);
  const msg = onPhone(flow, {
    type: 'swing',
    playerId: 'a',
    windowId: 2,
    swingAfterRecvMs: 5000,
    hand: 'forehand',
    shape: 'flat',
    power: 0.8,
    handed: 'right',
    apex: 1,
  }, 1600);
  assert.equal(match.phase, 'flight');
  assert.equal(match.shot.landX, 2);
  assert.equal(msg.window.kind, 'rally');
  assert.equal(msg.window.playerId, 'b');
  assert.equal(msg.window.contactInMs, 620);
  assert.equal(onPhone(flow, {
    type: 'swing',
    playerId: 'a',
    windowId: msg.window.windowId,
    power: 0.8,
    apex: 0,
  }, 1700), null);
});

test('the return uses judged timing, the last ack, and otherwise 80 ms', () => {
  const { match, flow } = singles();
  begin(flow, 1000);
  onPhone(flow, { type: 'toss', playerId: 'a' }, 1100);
  const opened = onPhone(flow, {
    type: 'swing',
    playerId: 'a',
    windowId: 2,
    power: 0.8,
    apex: 1,
    handed: 'right',
    shape: 'flat',
  }, 1500);
  const contact = opened.window.contactInMs;
  const perfect = onPhone(flow, {
    type: 'swing',
    playerId: 'b',
    windowId: opened.window.windowId,
    swingAfterRecvMs: contact - 40,
    power: 0.8,
    apex: 0,
    handed: 'right',
    shape: 'flat',
  }, 2000);
  assert.ok(match.shot.landX === 0);
  assert.equal(match.receiverId, 'a');
  assert.equal(perfect.window.kind, 'rally');
  assert.equal(perfect.window.playerId, 'a');
});

test('an ack replaces the 80 ms guess and a late or early return aims', () => {
  const { match, flow } = singles();
  begin(flow, 0);
  onPhone(flow, { type: 'toss', playerId: 'a' }, 100);
  const opened = onPhone(flow, {
    type: 'swing',
    playerId: 'a',
    windowId: flow.open.windowId,
    power: 0.8,
    apex: 1,
    handed: 'right',
    shape: 'flat',
  }, 200);
  const sent = flow.sentAt.get(opened.window.windowId);
  assert.equal(onPhone(flow, { type: 'window_ack', windowId: opened.window.windowId, playerId: 'b' }, sent + 200), null);
  assert.equal(flow.rtt.get('b'), 200);
  const contact = opened.window.contactInMs;
  onPhone(flow, {
    type: 'swing',
    playerId: 'b',
    windowId: opened.window.windowId,
    swingAfterRecvMs: contact - 40,
    power: 0.8,
    apex: 0,
    handed: 'right',
    shape: 'flat',
  }, sent + 400);
  const meters = (60 / 180) * (2.4 + 3.2 * 0.8);
  assert.ok(Math.abs(match.shot.landX - (-meters)) < 1e-9);
});

test('an unstruck toss returns to a fresh serve window', () => {
  const { match, flow } = singles();
  begin(flow, 0);
  onPhone(flow, { type: 'toss', playerId: 'a' }, 100);
  assert.equal(match.phase, 'toss');
  let now = 100;
  let msg = null;
  while (match.phase === 'toss' && now < 5000) {
    now += 50;
    msg = advance(flow, 0.05, now);
  }
  assert.equal(match.phase, 'serve');
  assert.equal(msg.window.kind, 'toss');
  assert.equal(msg.window.playerId, 'a');
  assert.equal(advance(flow, 0.05, flow.serveAt + 7999), null);
  assert.equal(match.phase, 'serve');
});

test('eight seconds without a toss is a fault and the point is held for 1200 ms', () => {
  const { match, flow } = singles();
  const t0 = 5_000;
  begin(flow, t0);
  assert.equal(advance(flow, 0.05, t0 + 7999), null);
  assert.equal(match.phase, 'serve');
  const faulted = advance(flow, 0.05, t0 + 8000);
  assert.equal(match.phase, 'flight');
  assert.equal(match.shot.outcome, 'net');
  assert.equal(faulted.window.kind, 'rally');
  assert.equal(faulted.window.contactInMs, 950);
  assert.equal(faulted.window.playerId, 'b');

  let now = t0 + 8000;
  let guard = 0;
  while (match.phase !== 'called' && guard < 40) {
    now += 50;
    advance(flow, 0.05, now);
    guard += 1;
  }
  assert.equal(match.phase, 'called');
  assert.equal(match.pointsB, 1);
  assert.equal(flow.calledAt, now);
  const held = advance(flow, 0.05, flow.calledAt + 1199);
  assert.equal(held, null);
  assert.equal(match.phase, 'called');
  const next = advance(flow, 0.05, flow.calledAt + 1200);
  assert.equal(match.phase, 'serve');
  assert.equal(next.phase, 'serve');
  assert.equal(next.scoreText, `0 ${DASH} 15`);
  assert.equal(next.window.kind, 'toss');
  assert.equal(next.window.playerId, 'a');
});

test('best of one ends on the winner names after the called hold', () => {
  const { match, flow } = singles();
  let now = 0;
  begin(flow, now);
  for (let point = 0; point < 4; point += 1) {
    const faultAt = flow.serveAt + 8000;
    advance(flow, 0.05, faultAt);
    now = faultAt;
    let guard = 0;
    while (match.phase !== 'called' && guard < 40) {
      now += 50;
      advance(flow, 0.05, now);
      guard += 1;
    }
    assert.equal(match.phase, 'called');
    now = flow.calledAt + 1200;
    advance(flow, 0.05, now);
  }
  assert.equal(match.phase, 'match');
  assert.equal(match.winnerSide, 'B');
  assert.deepEqual(winnerNames(flow), ['Bea']);
  assert.equal(advance(flow, 0.05, now + 50), null);
});

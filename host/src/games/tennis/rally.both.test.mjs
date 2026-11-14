import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, createMatch, plannedContact, planShot, step, swing, toss, view } from './rally.js';
import { getTuning } from './tuning.js';

const G = 9.81;
const DT = 1 / 60;

function singles() {
  return createMatch({
    players: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bea' }],
    sideA: ['a'],
    sideB: ['b'],
    bestOf: 3,
  });
}

function doubles() {
  return createMatch({
    players: [
      { id: 'a', name: 'Ada' },
      { id: 'c', name: 'Cal' },
      { id: 'b', name: 'Bea' },
      { id: 'd', name: 'Dee' },
    ],
    sideA: ['a', 'c'],
    sideB: ['b', 'd'],
    bestOf: 1,
  });
}

function fly(match, ball, shot = {}) {
  match.phase = 'flight';
  match.receiverId = 'b';
  match.flight = { bounces: 0, t: 0 };
  match.call = null;
  match.shot = {
    outcome: 'in',
    hitterSide: 'A',
    landX: 0,
    landZ: 8,
    flightTime: 1.2,
    serve: false,
    fast: false,
    ...shot,
  };
  match.ball = { x: 0, y: 2, z: -2, vx: 0, vy: 1, vz: 8, lift: 0, fast: false, ...ball };
  return match;
}

function hands(match) {
  const out = {};
  for (const entry of view(match).players) out[entry.id] = entry.hand;
  return out;
}

// Closed form for a lift-free ball: bounce, then the rebound apex.
function reboundApex(ball) {
  const tb = (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * G * ball.y)) / G;
  const vyImpact = ball.vy - G * tb;
  const vyR = Math.max(3.2, -vyImpact * 0.62);
  const tp = vyR / G;
  const zb = ball.z + ball.vz * tb;
  const head = Math.min(1.3, (vyR * vyR) / (2 * G));
  const tHead = (vyR - Math.sqrt(Math.max(0, vyR * vyR - 2 * G * head))) / G;
  return {
    meetZ: zb + 0.72 * ball.vz * tHead,
    bounceZ: zb,
    bounceX: ball.x + ball.vx * tb,
    peak: (vyR * vyR) / (2 * G),
    apexZ: zb + 0.72 * ball.vz * tp,
    apexX: ball.x + ball.vx * tb + 0.72 * ball.vx * tp,
    tApex: tb + tp,
  };
}

test('the net body aims at the crossing and the baseline body at the post-bounce peak', () => {
  const match = fly(singles(), {});
  step(match, DT);
  const expected = reboundApex({ x: 0, y: 2, z: -2, vx: 0, vy: 1, vz: 8 });
  const net = match.actors.get('b~partner');
  const back = match.actors.get('b');
  assert.ok(Math.abs(net.aimZ) < 2, `net aimZ ${net.aimZ}`);
  assert.ok(Math.abs(back.aimZ - expected.apexZ) < 0.1, `baseline aimZ ${back.aimZ} vs ${expected.apexZ}`);
  assert.ok(back.aimZ >= expected.bounceZ + 1, `baseline ${back.aimZ} bounce ${expected.bounceZ}`);
  assert.ok(Math.abs(back.aimZ - expected.bounceZ) > 1, 'not on the bounce');
  assert.ok(expected.peak < 1.3, 'this ball peaks under head height');
  assert.equal(plannedContact(match).id, 'b');
});

test('a net crossing above reach leaves the net body home and the baseline still meets the bounce', () => {
  const ball = { x: 0, y: 6, z: -2, vx: 0, vy: 1, vz: 8 };
  const match = fly(singles(), ball);
  step(match, DT);
  const expected = reboundApex(ball);
  const net = match.actors.get('b~partner');
  const back = match.actors.get('b');
  assert.ok(ball.y + 0.25 - 0.5 * G * 0.0625 > getTuning().reachY, 'crossing is above reachY');
  assert.equal(net.aimX, net.homeX);
  assert.equal(net.aimZ, net.homeZ);
  assert.ok(expected.peak > 1.3, 'this ball peaks above head height');
  assert.ok(Math.abs(back.aimZ - expected.meetZ) < 0.1, `baseline aimZ ${back.aimZ} vs ${expected.meetZ}`);
  assert.ok(back.aimZ >= expected.bounceZ + 1);
});

test('a contact on the right locks a forehand and the body stands 0.55 m to its left', () => {
  for (const [ballX, hand] of [[-2, 'forehand'], [2, 'backhand']]) {
    const match = fly(singles(), { x: ballX });
    const first = hands(match);
    assert.equal(first.b, hand, `baseline ${ballX}`);
    for (let i = 0; i < 70; i += 1) {
      step(match, DT);
      const now = hands(match);
      assert.equal(now.b, hand, `frame ${i}`);
      assert.equal(now['b~partner'], first['b~partner']);
    }
    const body = match.actors.get('b');
    const contact = plannedContact(match);
    assert.equal(contact.id, 'b');
    assert.equal(contact.hand, hand);
    const localGap = (contact.x - body.x) * -1;
    if (hand === 'forehand') assert.ok(localGap >= 0.55 - 1e-6, `forehand gap ${localGap}`);
    else assert.ok(-localGap >= 0.55 - 1e-6, `backhand gap ${localGap}`);
  }
});

test('the stroke is locked at the first frame and ignores handedness', () => {
  const edge = (ballX, handed) => {
    const match = fly(singles(), { x: ballX, vx: 0 });
    const hand = hands(match).b;
    swing(match, { playerId: 'b', handed, shape: 'flat', timing: 0, power: 0.7, apex: 0 });
    return hand;
  };
  assert.equal(edge(0.04, 'right'), 'forehand');
  assert.equal(edge(0.04, 'left'), 'forehand');
  assert.equal(edge(0.06, 'right'), 'backhand');
  assert.equal(edge(0.06, 'left'), 'backhand');
});

test('the locked hand is reported on both receiving bodies before anyone swings', () => {
  const match = singles();
  const id = view(match).serverId;
  toss(match, id);
  swing(match, { playerId: id, handed: 'right', shape: 'flat', timing: 0, power: 0.7, apex: 0.3 });
  assert.equal(match.phase, 'flight');
  const spots = view(match).players.filter((entry) => entry.side === 'B');
  assert.equal(spots.length, 2);
  for (const spot of spots) assert.ok(spot.hand === 'forehand' || spot.hand === 'backhand');
  const lock = { ...match.flight.locks };
  step(match, 0.3);
  const later = view(match).players.filter((entry) => entry.side === 'B');
  for (const spot of later) assert.equal(spot.hand, lock[spot.id]);
});

test('planShot ignores handedness for rally aim and serve aim', () => {
  const match = fly(singles(), { x: 0.5, y: 1.1, z: 11.185, vx: 0, vy: 0, vz: -1 }, { landZ: 4 });
  const shot = (handed, timing) => planShot(match, {
    playerId: 'b', handed, shape: 'flat', timing, power: 0.8, apex: 0,
  });
  for (const timing of [-0.7, -0.2, 0.3, 1]) {
    assert.equal(shot('left', timing).landX, shot('right', timing).landX, `timing ${timing}`);
  }
  assert.equal(shot('right', 0).landX, 0);

  const serving = singles();
  toss(serving, serving.serverId);
  const serve = (handed, timing) => planShot(serving, {
    playerId: serving.serverId, handed, shape: 'flat', timing, power: 0.7, apex: 0.95,
  });
  for (const handed of ['left', 'right']) {
    const perfect = serve(handed, 0);
    assert.equal(perfect.landX, 2);
    assert.equal(perfect.flightTime, 0.62);
    assert.equal(perfect.apex, 1.6);
    assert.equal(perfect.fast, true);
    assert.equal(perfect.outcome, 'in');
    const late = serve(handed, 1);
    assert.ok(Math.abs(late.landX - 4.6) < 1e-9, `late ${late.landX}`);
    assert.equal(late.outcome, 'out');
  }
});

test('a 1v1 rally landing in the alley is in', () => {
  const match = fly(singles(), { x: 0, y: 1.1, z: 11.185, vx: 0, vy: 0, vz: -1 }, { landZ: 4 });
  const plan = planShot(match, { playerId: 'b', handed: 'right', shape: 'flat', timing: 1, power: 0.8, apex: 0 });
  assert.ok(Math.abs(plan.landX) > COURT.singlesHalfWidth, `landX ${plan.landX}`);
  assert.ok(Math.abs(plan.landX) < COURT.doublesHalfWidth, `landX ${plan.landX}`);
  assert.equal(plan.outcome, 'in');
  const wide = planShot(match, { playerId: 'b', handed: 'right', shape: 'flat', timing: 1, power: 1, apex: 0 });
  assert.ok(Math.abs(wide.landX) > COURT.doublesHalfWidth);
  assert.equal(wide.outcome, 'out');
});

test('no body moves farther in one step than its speed allows, and both receivers move', () => {
  const match = fly(singles(), { x: -1.5 });
  const ids = [...match.actors.keys()];
  const start = new Map(ids.map((id) => [id, { x: match.actors.get(id).x, z: match.actors.get(id).z }]));
  const limit = getTuning().moveSpeed / 60 + 0.02;
  let frames = 0;
  while (view(match).phase === 'flight' && frames < 150) {
    const before = new Map(ids.map((id) => [id, { x: match.actors.get(id).x, z: match.actors.get(id).z }]));
    step(match, DT);
    frames += 1;
    for (const id of ids) {
      const body = match.actors.get(id);
      const moved = Math.hypot(body.x - before.get(id).x, body.z - before.get(id).z);
      assert.ok(moved <= limit + 1e-9, `${id} moved ${moved} > ${limit}`);
    }
  }
  assert.ok(frames > 30, 'the flight lasted');
  for (const id of ['b', 'b~partner']) {
    const body = match.actors.get(id);
    assert.ok(Math.hypot(body.x - start.get(id).x, body.z - start.get(id).z) > 0.3, `${id} stayed put`);
  }
});

test('the net body takes a reachable unbounced crossing and the window opens at the crossing', () => {
  const match = singles();
  const catcher = match.actors.get('a~partner');
  catcher.x = 0;
  catcher.z = -1.2;
  match.phase = 'flight';
  match.receiverId = 'b';
  match.flight = { bounces: 0, t: 0 };
  const partner = match.actors.get('b~partner');
  match.ball = { x: partner.x, y: 1.3, z: partner.z, vx: 0, vy: 0, vz: 3, lift: 0, fast: false };
  match.shot = {
    outcome: 'in', hitterSide: 'A', landX: 0, landZ: 8, flightTime: 1.2, serve: false, fast: false,
  };
  const hit = swing(match, { playerId: 'b', handed: 'left', shape: 'flat', timing: 0, power: 0.3, apex: 0 });
  assert.equal(hit, true);
  assert.equal(match.swingingId, 'b~partner');
  assert.equal(match.receiverId, 'a');
  assert.ok(match.shot.arriveIn > 0 && match.shot.arriveIn < match.shot.flightTime);
});

test('a swing outside reach does not change the ball', () => {
  const match = fly(singles(), { x: 4, y: 2, z: 3, vx: 0, vy: 0, vz: 1 });
  const before = { ...match.ball };
  const hit = swing(match, { playerId: 'b', handed: 'right', shape: 'flat', timing: 0, power: 0.7, apex: 0 });
  assert.equal(hit, false);
  assert.deepEqual(match.ball, before);
});

test('a serve return stays with the baseline human and the flight time', () => {
  const match = doubles();
  const id = view(match).serverId;
  toss(match, id);
  swing(match, { playerId: id, handed: 'right', shape: 'flat', timing: 0, power: 0.7, apex: 0.95 });
  assert.equal(match.shot.serve, true);
  assert.equal(match.shot.arriveIn, undefined);
  assert.equal(match.receiverId, 'b');
});

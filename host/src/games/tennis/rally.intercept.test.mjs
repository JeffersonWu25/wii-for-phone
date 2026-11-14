import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, plannedContact, planShot, step, swing, toss, view } from './rally.js';
import { getTuning, resetTuning, setTuning } from './tuning.js';
import { begin, createFlow } from './flow.js';

function singles() {
  return createMatch({
    players: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bea' }],
    sideA: ['a'],
    sideB: ['b'],
    bestOf: 3,
  });
}

function player(match, id) {
  return view(match).players.find((entry) => entry.id === id);
}

function serve(match, args) {
  const id = view(match).serverId;
  toss(match, id);
  swing(match, {
    playerId: id,
    hand: 'forehand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0.95,
    ...args,
  });
}

function armReturn(match) {
  const actor = match.actors.get('b');
  match.phase = 'flight';
  match.receiverId = 'b';
  match.flight = { bounces: 0, t: 0.2 };
  match.call = null;
  match.ball = {
    x: actor.x,
    y: 1.1,
    z: actor.z,
    vx: 0,
    vy: 0,
    vz: -1,
    lift: 0,
    fast: false,
  };
  match.shot = {
    outcome: 'in',
    hitterSide: 'A',
    landX: 0,
    landZ: 4,
    flightTime: 1,
    serve: false,
    fast: false,
  };
}

test('movement target is the predicted contact rather than the live ball', () => {
  const match = singles();
  serve(match, { apex: 0.95, timing: 0, power: 0.7 });
  step(match, 1 / 60);
  const ball = view(match).ball;
  const contact = plannedContact(match);
  assert.ok(contact, 'a zone was solved');
  assert.ok(Math.hypot(contact.x - ball.x, contact.z - ball.z) > 2, 'racket point is ahead of the ball');
  assert.ok(Math.hypot(contact.aimX - ball.x, contact.aimZ - ball.z) > 2, 'aim is not the live ball');
  const chaser = match.actors.get(contact.id);
  assert.ok(Math.abs(chaser.aimX - contact.aimX) < 1e-6);
  assert.ok(Math.abs(chaser.aimZ - contact.aimZ) < 1e-6);
  assert.equal(contact.id, 'b');
});

test('early and late forehands land on opposite sides and perfect is straight', () => {
  const match = singles();
  armReturn(match);
  const shot = (timing, handed = 'right') => planShot(match, {
    playerId: 'b',
    handed,
    shape: 'flat',
    timing,
    power: 0.8,
    apex: 0,
  });
  const early = shot(-0.5);
  const late = shot(0.5);
  const perfect = shot(0);
  assert.equal(perfect.landX, 0);
  assert.ok(early.landX > 0, `early ${early.landX}`);
  assert.ok(late.landX < 0, `late ${late.landX}`);
  assert.ok(Math.sign(early.landX) !== Math.sign(late.landX));
  assert.ok(Math.abs(shot(-0.5, 'left').landX - early.landX) < 1e-9);
});

test('direction sensitivity scales landX and the timing window does not', () => {
  const match = singles();
  armReturn(match);
  const land = () => Math.abs(planShot(match, {
    playerId: 'b',
    handed: 'right',
    shape: 'flat',
    timing: 0.5,
    power: 0.8,
    apex: 0,
  }).landX);
  const base = land();
  try {
    setTuning({ directionSensitivity: 2 });
    assert.ok(Math.abs(land() / base - 2) < 1e-9, `scaled ${land()} base ${base}`);
    setTuning({ directionSensitivity: 1, timingWindowMs: 360 });
    assert.ok(Math.abs(land() - base) < 1e-9, `window changed landX to ${land()}`);
  } finally {
    resetTuning();
  }
});

test('singles and mixed sides put four bodies on court controlled by the humans', () => {
  const one = singles();
  const players = view(one).players;
  assert.equal(players.length, 4);
  const extras = players.filter((entry) => entry.id.endsWith('~partner'));
  assert.equal(extras.length, 2);
  assert.equal(extras.find((entry) => entry.id === 'a~partner').controlledBy, 'a');
  assert.equal(extras.find((entry) => entry.id === 'b~partner').controlledBy, 'b');
  assert.equal(players.find((entry) => entry.id === 'a').controlledBy, 'a');
  assert.equal(one.sideA.includes('a~partner'), false);
  assert.equal(one.sideB.includes('b~partner'), false);
  const flow = createFlow(one);
  assert.deepEqual(begin(flow, 0).playing, ['a', 'b']);

  const mixed = createMatch({
    players: [
      { id: 'a', name: 'Ada' },
      { id: 'c', name: 'Cal' },
      { id: 'b', name: 'Bea' },
    ],
    sideA: ['a', 'c'],
    sideB: ['b'],
    bestOf: 1,
  });
  const mixedPlayers = view(mixed).players;
  assert.equal(mixedPlayers.length, 4);
  assert.equal(mixedPlayers.find((entry) => entry.id === 'b~partner').controlledBy, 'b');
  assert.equal(mixedPlayers.some((entry) => entry.id === 'a~partner'), false);

  const doubles = createMatch({
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
  const four = view(doubles).players;
  assert.equal(four.length, 4);
  assert.equal(four.some((entry) => entry.id.includes('~partner')), false);
  assert.ok(four.every((entry) => entry.controlledBy === entry.id));
});

test('a short unbounced ball is struck by the partner when the baseline cannot reach it', () => {
  const match = singles();
  armReturn(match);
  const partner = match.actors.get('b~partner');
  match.ball.x = partner.x;
  match.ball.y = 1.2;
  match.ball.z = partner.z;
  const baseline = match.actors.get('b');
  assert.ok(Math.hypot(match.ball.x - baseline.x, match.ball.z - baseline.z) > 1.75);
  const before = match.ball.vx;
  const connected = swing(match, {
    playerId: 'b',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0,
  });
  assert.equal(connected, true);
  assert.equal(match.swingingId, 'b~partner');
  assert.notEqual(match.ball.vx, before);
  assert.equal(match.receiverId, 'a');
  assert.equal(String(match.receiverId).includes('~'), false);
});

test('a front-court crossing is a volley for the net player when the bounce is deeper', () => {
  const match = singles();
  match.phase = 'flight';
  match.receiverId = 'b';
  match.flight = { bounces: 0, t: 0.3 };
  match.shot = {
    outcome: 'in',
    hitterSide: 'A',
    landX: 2.4,
    landZ: 9,
    flightTime: 1.2,
    serve: false,
    fast: false,
  };
  match.ball = {
    x: 2.4,
    y: 3.18,
    z: 1.0,
    vx: 0,
    vy: -1,
    vz: 5.45,
    lift: 0,
    fast: false,
  };
  const chase = plannedContact(match);
  assert.equal(chase.kind, 'volley');
  assert.equal(chase.id, 'b~partner');
  assert.ok(Math.abs(chase.z) <= 6.4);
  assert.ok(Math.abs(chase.z - 9) > 1);
});

test('teammates stay at least 1.5m apart over a short rally', () => {
  const match = singles();
  serve(match, { apex: 0.3, timing: 0, power: 0.6 });
  let closest = Infinity;
  const sample = () => {
    for (const side of ['A', 'B']) {
      const ids = view(match).players.filter((entry) => entry.side === side);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          closest = Math.min(closest, Math.hypot(ids[i].x - ids[j].x, ids[i].z - ids[j].z));
        }
      }
    }
  };
  let t = 0;
  while (t < 1.2 && view(match).phase === 'flight') {
    step(match, 1 / 60);
    t += 1 / 60;
    sample();
  }
  const gap = (id) => {
    const body = player(match, id);
    const ball = view(match).ball;
    if (!body || !ball) return Infinity;
    return Math.hypot(ball.x - body.x, ball.z - body.z);
  };
  let guard = 0;
  while (guard < 180 && gap('b') > 1.75 && view(match).phase === 'flight') {
    step(match, 1 / 60);
    sample();
    guard += 1;
  }
  if (gap('b') <= 1.75) {
    swing(match, {
      playerId: 'b',
      handed: 'right',
      shape: 'flat',
      timing: 0,
      power: 0.7,
      apex: 0,
    });
    t = 0;
    while (t < 0.8 && view(match).phase === 'flight') {
      step(match, 1 / 60);
      t += 1 / 60;
      sample();
    }
  }
  assert.ok(closest >= 1.5, `closest teammates ${closest}`);
});

test('cooldown rejects a second connect', () => {
  const match = singles();
  armReturn(match);
  const first = swing(match, {
    playerId: 'b',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0,
  });
  assert.equal(first, true);
  const vx = match.ball.vx;
  const vz = match.ball.vz;
  const second = swing(match, {
    playerId: 'b',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0,
  });
  assert.equal(second, false);
  assert.equal(match.ball.vx, vx);
  assert.equal(match.ball.vz, vz);
});

test('ball.fast is true only for the power serve', () => {
  const fast = singles();
  serve(fast, { apex: 0.95, timing: 0, power: 0.7 });
  const slow = singles();
  serve(slow, { apex: 0.3, timing: 0, power: 0.7 });
  assert.equal(view(fast).ball.fast, true);
  assert.equal(fast.shot.fast, true);
  assert.equal(view(slow).ball.fast, false);
  const fastH = Math.hypot(fast.ball.vx, fast.ball.vz);
  const slowH = Math.hypot(slow.ball.vx, slow.ball.vz);
  assert.ok(fastH >= slowH * 1.25, `fast ${fastH} slow ${slowH}`);
  assert.equal(fast.shot.flightTime, 0.62);
  let t = 0;
  const gap = () => {
    const body = player(fast, 'b');
    const ball = view(fast).ball;
    return Math.hypot(ball.x - body.x, ball.z - body.z);
  };
  while (t < 2 && gap() > 1.75 && view(fast).phase === 'flight') {
    step(fast, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(gap() <= 1.75, 'returner reached the power serve');
  swing(fast, {
    playerId: 'b',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0,
  });
  assert.equal(view(fast).ball.fast, false);
});

test('a rally shot through the tape is Net and a serve is not retaken', () => {
  const rally = singles();
  rally.phase = 'flight';
  rally.receiverId = 'b';
  rally.flight = { bounces: 0, t: 0 };
  rally.shot = {
    outcome: 'in',
    hitterSide: 'A',
    landX: 0,
    landZ: 4,
    flightTime: 1,
    serve: false,
    fast: false,
  };
  rally.ball = { x: 0, y: 0.4, z: -0.25, vx: 0, vy: 0, vz: 8, lift: 0, fast: false };
  let guard = 0;
  while (rally.phase === 'flight' && guard < 30) {
    step(rally, 1 / 60);
    guard += 1;
  }
  assert.equal(view(rally).call, 'Net');
  assert.equal(view(rally).score.pointsB, '15');

  const serveBall = singles();
  serve(serveBall, { apex: 0.2, timing: 1, power: 0.7 });
  assert.equal(serveBall.shot.serve, true);
  guard = 0;
  while (view(serveBall).phase === 'flight' && guard < 240) {
    step(serveBall, 1 / 60);
    guard += 1;
    assert.notEqual(view(serveBall).call, 'Net');
  }
  assert.equal(view(serveBall).call, 'Out');
});

test('tuning clamps, copies, and resets', () => {
  try {
    const got = setTuning({
      timingWindowMs: 1,
      moveSpeed: 100,
      interceptLead: -2,
      volleyPriority: false,
      aiDifficulty: 4,
      unknown: 9,
    });
    assert.equal(got.timingWindowMs, 40);
    assert.equal(got.moveSpeed, 16);
    assert.equal(got.interceptLead, 0);
    assert.equal(got.volleyPriority, false);
    assert.equal(got.aiDifficulty, 1);
    assert.equal(got.unknown, undefined);
    const copy = getTuning();
    copy.moveSpeed = 4;
    assert.equal(getTuning().moveSpeed, 16);
  } finally {
    resetTuning();
  }
  assert.equal(getTuning().timingWindowMs, 180);
  assert.equal(getTuning().volleyPriority, true);
  assert.equal(getTuning().moveSpeed, 11);
});

test('a lower ai waits, then aims off the intercept by a stable shift', () => {
  try {
    setTuning({ aiDifficulty: 0 });
    const match = singles();
    serve(match, { apex: 0.3, timing: 0, power: 0.7 });
    const home = player(match, 'b');
    let t = 0;
    while (t < 0.3 - 1e-9) {
      step(match, 1 / 60);
      t += 1 / 60;
    }
    const waiting = player(match, 'b');
    assert.equal(waiting.x, home.x);
    assert.equal(waiting.z, home.z);
    const hang = (target) => {
      target.phase = 'flight';
      target.flight = { bounces: 0, t: 0.5 };
      target.shot = {
        outcome: 'in', hitterSide: 'A', landX: 0, landZ: 6, flightTime: 1.4, serve: false, fast: false,
      };
      target.ball = { x: 0, y: 3, z: -1, vx: 0.4, vy: 1, vz: 3, lift: 0, fast: false };
      target.receiverId = 'b';
    };
    const late = singles();
    hang(late);
    step(late, 1 / 60);
    const shifted = plannedContact(late);
    assert.ok(shifted, 'committed after the delay');
    const again = shifted.aimX;
    step(late, 1 / 60);
    assert.ok(Math.abs(plannedContact(late).aimX - again) < 0.05);
    resetTuning();
    const straight = singles();
    hang(straight);
    step(straight, 1 / 60);
    const clean = plannedContact(straight);
    assert.ok(clean, 'full difficulty has a contact');
    assert.ok(Math.abs((shifted.aimX - clean.aimX) - 0.6) < 0.05, `shift ${shifted.aimX - clean.aimX}`);
  } finally {
    resetTuning();
  }
});

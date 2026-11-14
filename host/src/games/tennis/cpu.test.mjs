import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, planShot, step, view } from './rally.js';
import { afterPhysics, begin, cpuAct, createFlow, launch } from './flow.js';
import { cpuPlayer, lineupFromAssignments, seatForCpu, seatPlayers } from './teamSeat.js';
import { getTuning, resetTuning, setTuning } from './tuning.js';

function cpuMatch(sideA, sideB) {
  const match = createMatch({
    players: [
      { id: 'a', name: 'Ada' },
      { id: 'cpu', name: 'CPU' },
    ],
    sideA,
    sideB,
    bestOf: 1,
  });
  return { match, flow: createFlow(match) };
}

function playerClose(match, playerId) {
  const tuning = getTuning();
  const snap = view(match);
  const ball = snap.ball;
  if (!ball || snap.phase !== 'flight') return false;
  if (!(ball.y <= tuning.reachY)) return false;
  const mine = snap.players.filter((player) => player.id === playerId || player.controlledBy === playerId);
  const bounced = (match.flight?.bounces || 0) > 0;
  const net = mine.find((player) => player.role === 'net');
  const base = mine.find((player) => player.role !== 'net');
  const close = (player) => player
    && Math.hypot(ball.x - player.x, ball.z - player.z) <= tuning.reach + 1e-6;
  if (!match.shot?.serve && !bounced && tuning.volleyPriority && close(net)) return true;
  return close(base);
}

function chase(match, playerId, now) {
  const dt = 1 / 60;
  for (let i = 0; i < 480; i += 1) {
    if (match.phase !== 'flight') {
      return { ok: false, now, call: match.call, phase: match.phase };
    }
    if (playerClose(match, playerId)) return { ok: true, now };
    step(match, dt);
    now += dt * 1000;
  }
  return { ok: playerClose(match, playerId), now, call: match.call, phase: match.phase };
}

test('a CPU tosses, serves, and returns a human drive at difficulty 1', () => {
  setTuning({ aiDifficulty: 1 });
  try {
    const { match, flow } = cpuMatch(['cpu'], ['a']);
    begin(flow, 0);
    assert.equal(match.serverId, 'cpu');

    cpuAct(flow, 299);
    assert.equal(match.phase, 'serve');
    cpuAct(flow, 300);
    assert.equal(match.phase, 'toss');
    assert.equal(flow.open.kind, 'serve');
    assert.equal(flow.open.playerId, 'cpu');

    cpuAct(flow, 419);
    assert.equal(match.phase, 'toss');
    cpuAct(flow, 420);
    assert.equal(match.phase, 'flight');
    assert.equal(match.shot.fast, true);
    assert.equal(match.shot.flightTime, 0.62);
    assert.equal(match.shot.landX, 2);
    assert.equal(flow.open.kind, 'rally');
    assert.equal(flow.open.playerId, 'a');

    const served = match.shot.landX;
    cpuAct(flow, 420);
    assert.equal(match.shot.landX, served);
    assert.equal(flow.open.playerId, 'a');

    let now = 420;
    const human = chase(match, 'a', now);
    assert.equal(human.ok, true, `human never reached the ball (${human.phase} ${human.call})`);
    now = human.now;
    launch(flow, {
      playerId: 'a',
      power: 0.8,
      shape: 'flat',
      apex: 0,
      timing: 0,
      handed: 'right',
    }, now);
    assert.equal(match.phase, 'flight');
    assert.equal(match.shot.hitterSide, 'B');
    assert.equal(flow.open.kind, 'rally');
    assert.equal(flow.open.playerId, 'cpu');

    const cpu = chase(match, 'cpu', now);
    assert.equal(cpu.ok, true, `cpu never reached the ball (${cpu.phase} ${cpu.call})`);
    now = cpu.now;
    cpuAct(flow, now);
    assert.equal(match.phase, 'flight');
    assert.equal(match.shot.hitterSide, 'A');
    assert.notEqual(match.shot.outcome, 'net');
    assert.equal(match.shot.landX, 0);
    assert.equal(flow.open.playerId, 'a');

    const returned = match.shot.landX;
    cpuAct(flow, now + 200);
    assert.equal(match.shot.hitterSide, 'A');
    assert.equal(match.shot.landX, returned);
    assert.equal(flow.open.playerId, 'a');
  } finally {
    resetTuning();
  }
});

test('difficulty 0 rally timing is about ±0.45 and not centered', () => {
  setTuning({ aiDifficulty: 0 });
  try {
    for (const pointIndex of [0, 1]) {
      const { match, flow } = cpuMatch(['a'], ['cpu']);
      match.pointIndex = pointIndex;
      const actor = match.actors.get('cpu');
      match.phase = 'flight';
      match.receiverId = 'cpu';
      match.ball = { x: actor.x, y: 1.1, z: actor.z, vx: 0, vy: 0, vz: 0, lift: 0 };
      match.flight = { bounces: 1, t: 0.2 };
      match.shot = {
        outcome: 'in',
        hitterSide: 'A',
        landX: 0,
        landZ: actor.z,
        flightTime: 1.2,
        serve: false,
        arriveIn: 1,
      };
      flow.phaseSeen = 'flight';
      flow.open = { kind: 'rally', playerId: 'cpu', contactInMs: 400, windowId: 3, at: 0 };
      flow.seq = 3;
      const timing = (pointIndex % 2 === 0 ? -1 : 1) * 0.45;
      const expected = planShot(match, {
        playerId: 'cpu',
        power: 0.55,
        timing,
        shape: 'flat',
        apex: 0,
        handed: 'right',
      });
      const centered = planShot(match, {
        playerId: 'cpu',
        power: 0.55,
        timing: 0,
        shape: 'flat',
        apex: 0,
        handed: 'right',
      });
      cpuAct(flow, 399);
      assert.equal(match.shot.landZ, actor.z);
      cpuAct(flow, 400);
      assert.equal(match.phase, 'flight');
      assert.ok(Math.abs(timing) - 0.45 < 1e-12);
      assert.ok(Math.abs(match.shot.landX - expected.landX) < 1e-9, `landX ${match.shot.landX} vs ${expected.landX}`);
      assert.notEqual(match.shot.landX, centered.landX);
      assert.notEqual(match.shot.landX, 0);
      assert.equal(flow.open.playerId, 'a');
      const landX = match.shot.landX;
      cpuAct(flow, 700);
      assert.equal(match.shot.landX, landX);
    }
  } finally {
    resetTuning();
  }
});

function placeRally(match, flow, ball) {
  match.phase = 'flight';
  match.receiverId = 'cpu';
  match.ball = { x: 0, y: ball.y, z: ball.z, vx: 0, vy: 0, vz: 0, lift: 0 };
  match.flight = { bounces: 1, t: 0.1 };
  match.shot = {
    outcome: 'in',
    hitterSide: 'A',
    landX: 0,
    landZ: ball.z,
    flightTime: 1,
    serve: false,
    arriveIn: 1,
  };
  flow.phaseSeen = 'flight';
  flow.seq += 1;
  flow.open = { kind: 'rally', playerId: 'cpu', contactInMs: 200, windowId: flow.seq, at: 0 };
  const actor = match.actors.get('cpu');
  actor.x = match.ball.x;
  actor.z = match.ball.z;
}

test('a close net is a lob, a low crossing is a slice, and the rest is flat', () => {
  setTuning({ aiDifficulty: 1 });
  try {
    const lob = cpuMatch(['a'], ['cpu']);
    placeRally(lob.match, lob.flow, { y: 1.1, z: 11.185 });
    cpuAct(lob.flow, 200);
    assert.equal(lob.match.swingShape, 'lob');

    const overNet = cpuMatch(['a'], ['cpu']);
    overNet.match.actors.get('a~partner').z = -1;
    placeRally(overNet.match, overNet.flow, { y: 0.45, z: 0.45 });
    cpuAct(overNet.flow, 200);
    assert.equal(overNet.match.swingShape, 'lob');

    const slice = cpuMatch(['a'], ['cpu']);
    slice.match.actors.get('a~partner').z = -8;
    placeRally(slice.match, slice.flow, { y: 0.45, z: 0.45 });
    cpuAct(slice.flow, 200);
    assert.equal(slice.match.swingShape, 'slice');

    const flat = cpuMatch(['a'], ['cpu']);
    flat.match.actors.get('a~partner').z = -8;
    placeRally(flat.match, flat.flow, { y: 1.1, z: 11.185 });
    cpuAct(flat.flow, 200);
    assert.equal(flat.match.swingShape, 'flat');
  } finally {
    resetTuning();
  }
});

test('cpuAct does not swing a human window', () => {
  setTuning({ aiDifficulty: 1 });
  try {
    const { match, flow } = cpuMatch(['a'], ['cpu']);
    begin(flow, 0);
    cpuAct(flow, 10_000);
    assert.equal(match.phase, 'serve');
    assert.equal(flow.open.playerId, 'a');
    assert.equal(flow.open.kind, 'toss');
    assert.equal(match.ball, null);
  } finally {
    resetTuning();
  }
});

test('a late out-of-reach swing misses once and a second call does nothing', () => {
  setTuning({ aiDifficulty: 1 });
  try {
    const { match, flow } = cpuMatch(['cpu'], ['a']);
    begin(flow, 0);
    match.phase = 'flight';
    match.receiverId = 'cpu';
    match.ball = { x: 0, y: 1, z: -2, vx: 0, vy: 0, vz: 0, lift: 0 };
    match.flight = { bounces: 1, t: 2 };
    match.shot = {
      outcome: 'in',
      hitterSide: 'B',
      landX: 0,
      landZ: -8,
      flightTime: 0.4,
      serve: false,
      arriveIn: 0.3,
    };
    flow.phaseSeen = 'flight';
    flow.open = { kind: 'rally', playerId: 'cpu', contactInMs: 300, windowId: 5, at: 0 };
    flow.seq = 5;
    cpuAct(flow, 200);
    assert.equal(match.phase, 'flight');
    assert.equal(match.shot.landZ, -8);
    assert.ok(match.swingingId);
    const swinging = match.swingingId;
    const left = match.swingLeft;
    cpuAct(flow, 500);
    assert.equal(match.swingingId, swinging);
    assert.equal(match.swingLeft, left);
    assert.equal(match.shot.landZ, -8);
    assert.equal(flow.open.windowId, 5);
  } finally {
    resetTuning();
  }
});

test('afterPhysics tosses a CPU serve before the fault clock', () => {
  setTuning({ aiDifficulty: 1 });
  try {
    const { match, flow } = cpuMatch(['cpu'], ['a']);
    begin(flow, 1_000);
    assert.equal(afterPhysics(flow, 1_299, []), null);
    assert.equal(match.phase, 'serve');
    const tossed = afterPhysics(flow, 1_300, []);
    assert.equal(match.phase, 'toss');
    assert.equal(tossed.phase, 'toss');
    assert.equal(tossed.window.playerId, 'cpu');
    assert.equal(tossed.window.kind, 'serve');

    const late = cpuMatch(['cpu'], ['a']);
    begin(late.flow, 1_000);
    const saved = afterPhysics(late.flow, 1_000 + 8000, []);
    assert.equal(late.match.phase, 'toss');
    assert.notEqual(late.match.shot?.outcome, 'net');
    assert.equal(saved.window.kind, 'serve');
  } finally {
    resetTuning();
  }
});

test('a CPU sits on the smaller side, side B when even, and stops before a side of three', () => {
  assert.deepEqual(cpuPlayer(0), { playerId: 'cpu', name: 'CPU' });
  assert.deepEqual(cpuPlayer(1), { playerId: 'cpu-2', name: 'CPU 2' });

  const two = [
    { playerId: 'p1', name: 'One' },
    { playerId: 'p2', name: 'Two' },
  ];
  const seated = seatPlayers(two);
  assert.deepEqual(
    two.map((player) => seated.assignments[player.playerId]),
    ['A', 'B'],
  );
  assert.equal(seatForCpu(two, seated.assignments), 'B');

  const withCpu = [...two, cpuPlayer(0)];
  const even = { ...seated.assignments, cpu: 'B' };
  assert.deepEqual(lineupFromAssignments(withCpu, even), {
    sideA: ['p1'],
    sideB: ['p2', 'cpu'],
    format: '1v2',
    legal: true,
  });
  assert.equal(seatForCpu(withCpu, even), 'A');

  const three = [...withCpu, cpuPlayer(1)];
  const filled = { ...even, 'cpu-2': 'A' };
  assert.equal(lineupFromAssignments(three, filled).format, '2v2');
  assert.equal(seatForCpu(three, filled), null);

  const one = [{ playerId: 'p1', name: 'Ada' }];
  const alone = seatPlayers(one);
  assert.deepEqual(one.map((player) => alone.assignments[player.playerId]), ['out']);
  const cpu = cpuPlayer(0);
  assert.equal(seatForCpu([...one, cpu], alone.assignments), 'B');
  assert.deepEqual(lineupFromAssignments([...one, cpu], { p1: 'A', cpu: 'B' }), {
    sideA: ['p1'],
    sideB: ['cpu'],
    format: '1v1',
    legal: true,
  });

  const pair = [
    { playerId: 'p1', name: 'One' },
    { playerId: 'p2', name: 'Two' },
    { playerId: 'p3', name: 'Three' },
  ];
  const uneven = { p1: 'A', p2: 'A', p3: 'B' };
  assert.equal(seatForCpu(pair, uneven), 'B');
});

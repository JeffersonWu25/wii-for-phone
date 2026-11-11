import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, createMatch, setGrip, step, swing, toss, view } from './rally.js';

const REACH = 1.75;
const TOP_SPEED = 8.6;

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

function gap(match, id) {
  const snap = view(match);
  const body = snap.players.find((entry) => entry.id === id);
  const ball = snap.ball;
  if (!body || !ball) return Infinity;
  return Math.hypot(ball.x - body.x, ball.z - body.z);
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

function yawOf(x, z) {
  return Math.atan2(x, z);
}

function angleBetween(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

test('the canonical fast serve is inside reach at the first bounce', () => {
  const match = singles();
  serve(match, { apex: 0.95, timing: 0, power: 0.7 });
  let prev = 0;
  let seen = null;
  let t = 0;
  while (t < 2) {
    step(match, 1 / 60);
    t += 1 / 60;
    const bounces = view(match).flight?.bounces || 0;
    if (bounces >= 1 && prev < 1) {
      seen = gap(match, 'b');
      break;
    }
    prev = bounces;
  }
  assert.ok(seen != null, 'first bounce');
  assert.ok(seen <= REACH, `returner gap ${seen}`);
});

test('a fast wide serve stays out of reach and the server wins', () => {
  const match = singles();
  serve(match, { apex: 0.95, timing: 0.7, power: 0.7 });
  const planX = match.shot.landX;
  assert.ok(Math.abs(planX) < COURT.singlesHalfWidth, `landX ${planX}`);
  let minGap = Infinity;
  let t = 0;
  while (t < 3 && view(match).phase === 'flight') {
    const before = view(match).ball;
    const speed = Math.hypot(before.vx, before.vy, before.vz);
    step(match, 1 / 60);
    t += 1 / 60;
    const after = view(match);
    if (after.ball) {
      const moved = Math.hypot(after.ball.x - before.x, after.ball.y - before.y, after.ball.z - before.z);
      assert.ok(moved <= speed * (1 / 60) + 0.5 * 12 * (1 / 60) + 0.05, `ball gap ${moved}`);
    }
    const distance = gap(match, 'b');
    if (distance < minGap) minGap = distance;
    const bounces = after.flight?.bounces || 0;
    if (bounces < 2 && after.phase === 'flight' && distance <= minGap + 0.05) {
      const vx = match.ball.vx;
      const vz = match.ball.vz;
      swing(match, {
        playerId: 'b',
        hand: 'forehand',
        handed: 'right',
        shape: 'flat',
        timing: 0,
        power: 0.7,
        apex: 0,
      });
      assert.equal(match.ball.vx, vx);
      assert.equal(match.ball.vz, vz);
    }
    if ((view(match).flight?.bounces || 0) >= 2 || view(match).phase === 'called') break;
  }
  assert.ok(minGap > REACH, `closest ${minGap}`);
  let guard = 0;
  while (view(match).phase !== 'called' && guard < 180) {
    step(match, 1 / 60);
    guard += 1;
  }
  const end = view(match);
  assert.equal(end.phase, 'called');
  assert.equal(end.score.pointsA, '15');
  assert.equal(end.score.pointsB, '0');
  assert.equal(end.receiverId, 'b');
});

test('a slow deuce serve is returnable and the rally continues', () => {
  const match = singles();
  serve(match, { apex: 0.3, timing: 0, power: 0.6 });
  const serveShot = match.shot.landX;
  let t = 0;
  let closest = Infinity;
  while (t < 3 && view(match).phase === 'flight' && (view(match).flight?.bounces || 0) < 2) {
    closest = Math.min(closest, gap(match, 'b'));
    if (gap(match, 'b') <= REACH) break;
    step(match, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(closest <= REACH || gap(match, 'b') <= REACH, `slow gap ${closest}`);
  assert.equal(view(match).phase, 'flight');
  const before = { ...match.ball };
  swing(match, {
    playerId: 'b',
    hand: 'backhand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0,
  });
  const moved = Math.hypot(match.ball.x - before.x, match.ball.y - before.y, match.ball.z - before.z);
  assert.ok(moved <= 0.02, `ball shift ${moved}`);
  const snap = view(match);
  assert.equal(snap.phase, 'flight');
  assert.notEqual(snap.shot ? match.shot.landX : serveShot, undefined);
  assert.equal(match.receiverId, 'a');
  assert.equal(match.shot.hitterSide, 'B');
  assert.ok(match.flight.bounces === 0);
});

test('a flat rally down the middle is inside reach for the other player', () => {
  const match = singles();
  serve(match, { apex: 0.3, timing: 0, power: 0.6 });
  let t = 0;
  while (t < 3 && gap(match, 'b') > REACH && (view(match).flight?.bounces || 0) < 2) {
    step(match, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(gap(match, 'b') <= REACH, 'returner reached the serve');
  swing(match, {
    playerId: 'b',
    hand: 'forehand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0,
  });
  assert.equal(match.receiverId, 'a');
  t = 0;
  let best = Infinity;
  while (t < 3 && view(match).phase === 'flight' && (view(match).flight?.bounces || 0) < 2) {
    best = Math.min(best, gap(match, 'a'));
    if (gap(match, 'a') <= REACH) break;
    step(match, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(best <= REACH, `server gap ${best}`);
});

test('a short ball pulls the returner in and a slice behind them is gone', () => {
  const match = singles();
  serve(match, { apex: 0.3, timing: 0, power: 0.6 });
  let t = 0;
  while (t < 3 && gap(match, 'b') > REACH && view(match).phase === 'flight') {
    step(match, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(gap(match, 'b') <= REACH, 'pulled into the short serve');
  const pulledZ = player(match, 'b').z;
  swing(match, {
    playerId: 'b',
    hand: 'forehand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.22,
    apex: 0,
  });
  assert.equal(match.phase, 'flight');
  assert.equal(match.receiverId, 'a');
  t = 0;
  while (t < 3 && gap(match, 'a') > REACH && view(match).phase === 'flight') {
    step(match, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(gap(match, 'a') <= REACH, 'server reaches the short reply');
  swing(match, {
    playerId: 'a',
    hand: 'forehand',
    handed: 'right',
    shape: 'slice',
    timing: 1,
    power: 0.35,
    apex: 0,
  });
  assert.equal(match.shot.hitterSide, 'A');
  assert.equal(match.receiverId, 'b');
  t = 0;
  let best = Infinity;
  while (t < 3 && view(match).phase === 'flight' && (view(match).flight?.bounces || 0) < 2) {
    best = Math.min(best, gap(match, 'b'));
    const distance = gap(match, 'b');
    if (distance <= best + 0.02) {
      const vx = match.ball.vx;
      swing(match, {
        playerId: 'b',
        hand: 'backhand',
        handed: 'right',
        shape: 'flat',
        timing: 0,
        power: 0.7,
        apex: 0,
      });
      if (match.ball.vx !== vx) break;
    }
    if (match.phase !== 'flight') break;
    step(match, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(best > REACH, `got back within ${best}, started near z ${pulledZ}`);
  assert.equal(match.shot.hitterSide, 'A');
});

test('speed eases in, stays capped, and the body does not teleport', () => {
  const match = singles();
  serve(match, { apex: 0.95, timing: 0, power: 0.7 });
  assert.equal(player(match, 'b').speed, 0);
  let t = 0;
  let prev = player(match, 'b');
  let travel = prev.travel;
  while (t < 0.1 - 1e-9) {
    step(match, 1 / 60);
    t += 1 / 60;
    const body = player(match, 'b');
    const moved = Math.hypot(body.x - prev.x, body.z - prev.z);
    const allowed = Math.max(prev.speed, body.speed) * (1 / 60) + 0.01;
    assert.ok(moved <= allowed + 1e-6, `jump ${moved} > ${allowed}`);
    assert.ok(body.speed <= TOP_SPEED + 1e-6, `speed ${body.speed}`);
    assert.ok(body.travel + 1e-6 >= travel, 'travel went backwards');
    travel = body.travel;
    prev = body;
  }
  assert.ok(player(match, 'b').speed < 3.2, `ease speed ${player(match, 'b').speed}`);
  assert.ok(player(match, 'b').speed > 2, `ease speed ${player(match, 'b').speed}`);
  while (t < 0.7 && view(match).phase === 'flight') {
    step(match, 1 / 60);
    t += 1 / 60;
    const body = player(match, 'b');
    const moved = Math.hypot(body.x - prev.x, body.z - prev.z);
    const allowed = Math.max(prev.speed, body.speed) * (1 / 60) + 0.01;
    assert.ok(moved <= allowed + 1e-6, `jump ${moved} > ${allowed}`);
    assert.ok(body.speed <= TOP_SPEED + 1e-9, `speed ${body.speed}`);
    assert.ok(body.travel + 1e-6 >= travel);
    travel = body.travel;
    prev = body;
  }
});

test('a connected hit leaves the ball on the strings and aims at the landing', () => {
  function strike(shape) {
    const match = singles();
    serve(match, { apex: 0.3, timing: 0, power: 0.6 });
    let t = 0;
    while (t < 3 && gap(match, 'b') > REACH) {
      step(match, 1 / 60);
      t += 1 / 60;
    }
    const before = { x: match.ball.x, y: match.ball.y, z: match.ball.z };
    swing(match, {
      playerId: 'b',
      hand: 'forehand',
      handed: 'right',
      shape,
      timing: 0,
      power: 0.7,
      apex: 0,
    });
    const after = match.ball;
    const shift = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    const aim = yawOf(match.shot.landX - after.x, match.shot.landZ - after.z);
    const face = yawOf(after.vx, after.vz);
    const hitter = player(match, 'b');
    return {
      shift,
      aimError: angleBetween(aim, face),
      pitch: hitter.facePitch,
      yaw: hitter.faceYaw,
      struck: hitter.struck,
      shape: hitter.shape,
      swingT: hitter.swingT,
    };
  }
  const flat = strike('flat');
  const lob = strike('lob');
  const slice = strike('slice');
  for (const shot of [flat, lob, slice]) {
    assert.ok(shot.shift <= 0.02, `shift ${shot.shift}`);
    assert.ok(shot.aimError < (12 * Math.PI) / 180, `aim ${shot.aimError}`);
    assert.equal(shot.struck, true);
    assert.equal(shot.swingT, 0);
  }
  assert.ok(lob.pitch > flat.pitch, `lob ${lob.pitch} flat ${flat.pitch}`);
  assert.ok(slice.pitch < flat.pitch, `slice ${slice.pitch} flat ${flat.pitch}`);
  assert.equal(flat.shape, 'flat');
  assert.equal(lob.shape, 'lob');
  assert.equal(slice.shape, 'slice');
});

test('two ball substeps stay within the speed of each step', () => {
  const match = singles();
  serve(match, { apex: 0.95, timing: 0, power: 0.7 });
  const dt = 1 / 60;
  for (let i = 0; i < 2; i += 1) {
    const before = view(match).ball;
    const speed = Math.hypot(before.vx, before.vy, before.vz);
    step(match, dt);
    const after = view(match).ball;
    const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    const allowance = speed * dt + 0.5 * 12 * dt * dt + 0.02;
    assert.ok(moved <= allowance, `substep ${i} moved ${moved} allowance ${allowance}`);
  }
});

test('a whiff animates the swing and does not change the ball', () => {
  const match = singles();
  serve(match, { apex: 0.95, timing: 0.7, power: 0.7 });
  const before = { vx: match.ball.vx, vy: match.ball.vy, vz: match.ball.vz, x: match.ball.x, z: match.ball.z };
  swing(match, {
    playerId: 'b',
    hand: 'backhand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.8,
    apex: 0,
  });
  assert.equal(match.ball.vx, before.vx);
  assert.equal(match.ball.vy, before.vy);
  assert.equal(match.ball.vz, before.vz);
  assert.equal(match.phase, 'flight');
  const hitter = player(match, 'b');
  assert.equal(hitter.swinging, true);
  assert.equal(hitter.hand, 'backhand');
  assert.equal(hitter.shape, 'flat');
  assert.equal(hitter.swingT, 0);
  assert.equal(hitter.struck, false);
  assert.equal(player(match, 'a').swinging, false);
});

test('grip shows between swings and a serve swing is shaped serve', () => {
  const match = singles();
  setGrip(match, 'a', 'backhand');
  assert.equal(player(match, 'a').hand, 'backhand');
  assert.equal(player(match, 'a').swingT, -1);
  assert.equal(player(match, 'a').shape, null);
  const id = view(match).serverId;
  toss(match, id);
  swing(match, {
    playerId: id,
    hand: 'forehand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0.5,
  });
  const server = player(match, id);
  assert.equal(server.hand, 'forehand');
  assert.equal(server.shape, 'serve');
  assert.equal(server.struck, true);
  step(match, 0.4);
  assert.equal(player(match, id).swingT, -1);
  assert.equal(player(match, id).hand, 'backhand');
  assert.equal(player(match, id).struck, false);
});

test('nobody runs during the toss and homes stay on the marks', () => {
  const match = singles();
  const before = player(match, 'b');
  assert.equal(before.homeX, 0);
  assert.ok(Math.abs(before.homeZ - 11.185) < 1e-6);
  assert.equal(before.x, before.homeX);
  assert.equal(before.z, before.homeZ);
  toss(match, 'a');
  step(match, 0.4);
  const server = player(match, 'a');
  const ball = view(match).ball;
  assert.equal(player(match, 'b').x, before.x);
  assert.equal(player(match, 'b').z, before.z);
  assert.equal(player(match, 'b').speed, 0);
  assert.ok(Math.hypot(ball.x - server.x, ball.z - server.z) < 0.45);
});

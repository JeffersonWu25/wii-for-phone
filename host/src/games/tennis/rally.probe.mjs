// Frozen contract for host/src/games/tennis/rally.js.
// Competing rally builds must pass this file and must not edit it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, createMatch, nextPoint, planShot, step, swing, toss, view } from './rally.js';

const A = { id: 'a', name: 'Ada' };
const B = { id: 'b', name: 'Bea' };
const C = { id: 'c', name: 'Cal' };
const D = { id: 'd', name: 'Dee' };
const E = { id: 'e', name: 'Eve' };
const ROSTER = [A, B, C, D, E];

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function matchOf(sideA, sideB, bestOf = 1) {
  const ids = new Set([...sideA, ...sideB]);
  return createMatch({
    players: ROSTER.filter((p) => ids.has(p.id)),
    sideA,
    sideB,
    bestOf,
  });
}

function player(v, id) {
  return v.players.find((p) => p.id === id);
}

function expectedPlan(v, playerId, args) {
  const power = clamp(Number(args.power ?? 0), 0, 1);
  const apexHit = clamp(Number(args.apex ?? 0), 0, 1);
  let timing = clamp(Number(args.timing ?? 0), -1, 1);
  if (args.handed === 'left') timing = -timing;
  const side = player(v, playerId).side;
  const meters = timing * (2.4 + 3.2 * power);
  const toward = side === 'A' ? 1 : -1;
  const serve = v.phase === 'toss';
  if (serve) {
    const fast = apexHit >= 0.85;
    if (power < 0.2) {
      return { outcome: 'net', landX: 0, landZ: 0, apex: fast ? 1.6 : 2.8, flightTime: fast ? 0.62 : 0.95, fast };
    }
    const deuce = v.pointIndex % 2 === 0;
    const boxSign = deuce ? 1 : -1;
    const xSign = side === 'A' ? boxSign : -boxSign;
    const landX = xSign * (2.0 + timing * 2.6);
    const landZ = toward * (3.2 + 1.4 * (1 - Math.abs(timing)));
    const wide = Math.abs(landX) > COURT.singlesHalfWidth;
    return {
      outcome: wide ? 'out' : 'in',
      landX,
      landZ,
      apex: fast ? 1.6 : 2.8,
      flightTime: fast ? 0.62 : 0.95,
      fast,
    };
  }
  if (power < 0.18) {
    return { outcome: 'net', landX: 0, landZ: 0, apex: 1, flightTime: 0.4, fast: false };
  }
  const depth = 2.5 + 8.2 * ((power - 0.18) / 0.82);
  const landX = side === 'A' ? meters : -meters;
  const landZ = toward * depth;
  const half = v.format === '1v1' ? COURT.singlesHalfWidth : COURT.doublesHalfWidth;
  const out = Math.abs(landX) > half || Math.abs(landZ) > COURT.halfLength;
  const shape = args.shape === 'lob' || args.shape === 'slice' ? args.shape : 'flat';
  const apex = shape === 'lob' ? 6.2 : shape === 'slice' ? 1.25 : 2.4;
  const flightTime = shape === 'lob' ? 1.45 : shape === 'slice' ? 0.85 : 1.05;
  return { outcome: out ? 'out' : 'in', landX, landZ, apex, flightTime, fast: false };
}

function near(actual, exp, eps, label) {
  assert.ok(Math.abs(actual - exp) <= eps, `${label}: ${actual} vs ${exp}`);
}

function assertPlan(got, exp) {
  assert.equal(got.outcome, exp.outcome);
  near(got.landX, exp.landX, 0.05, 'landX');
  near(got.landZ, exp.landZ, 0.05, 'landZ');
  near(got.apex, exp.apex, 0.05, 'apex');
  near(got.flightTime, exp.flightTime, 0.02, 'flightTime');
  assert.equal(Boolean(got.fast), exp.fast);
}

function driveUntil(match, pred, seconds = 5) {
  let t = 0;
  let peak = 0;
  let bounceAt = null;
  let prevBounces = view(match).flight?.bounces || 0;
  let last = view(match);
  while (t <= seconds) {
    if (pred(last, { peak, bounceAt, t })) return { v: last, peak, bounceAt, t };
    step(match, 1 / 60);
    t += 1 / 60;
    last = view(match);
    if (last.ball) peak = Math.max(peak, last.ball.y);
    const bounces = last.flight?.bounces || 0;
    if (!bounceAt && bounces >= 1 && prevBounces < 1 && last.ball) {
      bounceAt = { x: last.ball.x, y: last.ball.y, z: last.ball.z, t };
    }
    prevBounces = bounces;
  }
  return { v: last, peak, bounceAt, t };
}

function strike(match, playerId, args) {
  const v = view(match);
  const full = {
    playerId,
    hand: 'forehand',
    handed: 'right',
    shape: 'flat',
    timing: 0,
    power: 0.7,
    apex: 0.5,
    ...args,
  };
  const exp = expectedPlan(v, playerId, full);
  const got = planShot(match, full);
  assertPlan(got, exp);
  swing(match, full);
  return exp;
}

function serveIn(match, args = {}) {
  const id = view(match).serverId;
  toss(match, id);
  return strike(match, id, { power: 0.7, apex: 0.95, timing: 0, shape: 'flat', ...args });
}

test('court constants match the tennis court used by the scene', () => {
  assert.equal(COURT.halfLength, 11.885);
  assert.equal(COURT.doublesHalfWidth, 5.485);
  assert.equal(COURT.singlesHalfWidth, 4.115);
  assert.equal(COURT.serviceFromNet, 6.4);
  assert.equal(COURT.netCenter, 0.914);
  assert.equal(COURT.netPost, 1.07);
});

test('createMatch accepts 1v1, 1v2, and 2v2 only', () => {
  assert.equal(view(matchOf(['a'], ['b'])).format, '1v1');
  assert.equal(view(matchOf(['a', 'c'], ['b'])).format, '1v2');
  assert.equal(view(matchOf(['a'], ['b', 'd'])).format, '1v2');
  assert.equal(view(matchOf(['a', 'c'], ['b', 'd'], 5)).format, '2v2');
  assert.throws(() => matchOf(['a'], []));
  assert.throws(() => createMatch({ players: [A, B, C, D], sideA: ['a', 'b', 'c'], sideB: ['d'], bestOf: 1 }));
  assert.throws(() => createMatch({ players: [A, B], sideA: ['a'], sideB: ['b'], bestOf: 2 }));
});

test('opening formation puts the server and the returner at the back', () => {
  const v = view(matchOf(['a', 'c'], ['b', 'd'], 3));
  assert.equal(v.phase, 'serve');
  assert.equal(v.ball, null);
  assert.equal(v.serverId, 'a');
  assert.equal(v.servingSide, 'A');
  assert.equal(v.pointIndex, 0);
  assert.equal(v.score.pointsA, '0');
  assert.equal(v.score.pointsB, '0');
  assert.equal(v.score.gamesA, 0);
  assert.equal(v.score.gamesB, 0);
  assert.equal(v.winnerSide, null);
  const a = player(v, 'a');
  const c = player(v, 'c');
  const b = player(v, 'b');
  const d = player(v, 'd');
  assert.equal(a.role, 'back');
  assert.equal(c.role, 'net');
  assert.equal(b.role, 'back');
  assert.equal(d.role, 'net');
  near(a.z, -11.185, 0.02, 'a.z');
  near(a.x, 0, 0.02, 'a.x');
  near(c.x, -2.4, 0.02, 'c.x');
  near(c.z, -5.6, 0.02, 'c.z');
  near(b.z, 11.185, 0.02, 'b.z');
  near(d.x, 2.4, 0.02, 'd.x');
  near(d.z, 5.6, 0.02, 'd.z');
  assert.equal(view(matchOf(['a'], ['b'])).players.every((p) => p.role === 'solo'), true);
  assert.equal(player(view(matchOf(['a', 'c'], ['b'])), 'b').role, 'solo');
  const colors = new Set(v.players.map((p) => p.color));
  assert.equal(colors.size, 4);
});

test('the toss lifts the ball above the server', () => {
  const m = matchOf(['a'], ['b']);
  const id = view(m).serverId;
  toss(m, id);
  const server = player(view(m), id);
  step(m, 0.45);
  const v = view(m);
  assert.equal(v.phase, 'toss');
  assert.ok(v.ball.y > 2.2, `toss height ${v.ball.y}`);
  near(v.ball.x, server.x, 0.45, 'toss x');
  near(v.ball.z, server.z, 0.45, 'toss z');
});

test('a perfect serve lands in the deuce box and the returner is the back player', () => {
  const m = matchOf(['a', 'c'], ['b', 'd']);
  const plan = serveIn(m);
  assert.equal(plan.outcome, 'in');
  assert.equal(plan.fast, true);
  const v = view(m);
  assert.equal(v.phase, 'flight');
  assert.equal(v.receiverId, 'b');
  assert.equal(player(v, 'a').swinging, true);
  const hit = driveUntil(m, (state, info) => info.bounceAt || state.call, 3);
  assert.equal(hit.v.call, null);
  assert.ok(hit.bounceAt, 'first bounce');
  assert.ok(hit.bounceAt.y < 0.4, `bounce height ${hit.bounceAt.y}`);
  near(hit.bounceAt.x, plan.landX, 0.75, 'bounce x');
  near(hit.bounceAt.z, plan.landZ, 0.75, 'bounce z');
  assert.ok(hit.bounceAt.x > 0, 'deuce box is the server\'s right');
});

test('the second serve of a game is into the ad court', () => {
  const m = matchOf(['a'], ['b'], 3);
  const first = serveIn(m);
  driveUntil(m, (v) => v.phase === 'called', 4);
  nextPoint(m);
  assert.equal(view(m).pointIndex, 1);
  const plan = serveIn(m);
  assert.ok(plan.landX < 0, `ad box landX ${plan.landX}`);
  assert.notEqual(Math.sign(plan.landX), Math.sign(first.landX));
});

test('a wide serve and a weak serve lose the point', () => {
  const wide = matchOf(['a'], ['b'], 3);
  serveIn(wide, { timing: 1, power: 0.7, apex: 0.2 });
  const wideEnd = driveUntil(wide, (v) => v.phase === 'called', 4);
  assert.equal(wideEnd.v.call, 'Out');
  assert.equal(wideEnd.v.score.pointsA, '0');
  assert.equal(wideEnd.v.score.pointsB, '15');

  const soft = matchOf(['a'], ['b'], 3);
  serveIn(soft, { timing: 0, power: 0.1, apex: 0.95 });
  const softEnd = driveUntil(soft, (v) => v.phase === 'called', 4);
  assert.equal(softEnd.v.call, 'Net');
  assert.equal(softEnd.v.score.pointsB, '15');
});

test('an untouched serve that lands in becomes the server\'s point on the second bounce', () => {
  const m = matchOf(['a'], ['b'], 3);
  serveIn(m);
  const end = driveUntil(m, (v) => v.phase === 'called', 5);
  assert.equal(end.v.call, null);
  assert.equal(end.v.score.pointsA, '15');
  assert.ok(end.v.flight.bounces >= 2);
});

test('a fast serve arrives sooner than a slow serve and the ball bounces up', () => {
  function timeToBounce(apex) {
    const m = matchOf(['a'], ['b'], 3);
    serveIn(m, { apex, power: 0.7, timing: 0 });
    const hit = driveUntil(m, (v, info) => info.bounceAt, 3);
    assert.ok(hit.bounceAt, 'bounce');
    const popped = driveUntil(m, (v) => v.ball && v.ball.y > 0.45, 1.2);
    assert.ok(popped.v.ball.y > 0.45, 'bounce is visible');
    return hit.bounceAt.t;
  }
  const fast = timeToBounce(0.95);
  const slow = timeToBounce(0.2);
  assert.ok(fast < slow - 0.12, `fast ${fast} slow ${slow}`);
});

test('lob hangs above a flat shot and a slice stays under it', () => {
  function returnPeak(shape) {
    const m = matchOf(['a'], ['b'], 3);
    serveIn(m);
    driveUntil(m, (v, info) => info.bounceAt, 3);
    strike(m, 'b', { shape, power: 0.7, timing: 0, apex: 0 });
    const hit = driveUntil(m, (v, info) => (v.flight?.bounces || 0) >= 1 || v.call, 4);
    assert.equal(hit.v.call, null);
    return hit.peak;
  }
  const flat = returnPeak('flat');
  const lob = returnPeak('lob');
  const slice = returnPeak('slice');
  assert.ok(lob > flat + 1.2, `lob ${lob} flat ${flat}`);
  assert.ok(slice < flat - 0.35, `slice ${slice} flat ${flat}`);
});

test('the same wide return is an alley winner in doubles and out in singles', () => {
  function wideReturn(sideA, sideB) {
    const m = matchOf(sideA, sideB, 3);
    serveIn(m);
    driveUntil(m, (v, info) => info.bounceAt, 3);
    const plan = strike(m, sideB[0], { timing: 1, power: 0.75, shape: 'flat' });
    const end = driveUntil(m, (v) => v.call || v.phase === 'called', 4);
    return { plan, end };
  }
  const singles = wideReturn(['a'], ['b']);
  const doubles = wideReturn(['a', 'c'], ['b', 'd']);
  assert.equal(singles.plan.outcome, 'out');
  assert.equal(singles.end.v.call, 'Out');
  assert.equal(doubles.plan.outcome, 'in');
  assert.equal(doubles.end.v.call, null);
  assert.equal(Math.abs(doubles.plan.landX) > COURT.singlesHalfWidth, true);
  assert.equal(Math.abs(doubles.plan.landX) < COURT.doublesHalfWidth, true);
});

test('a full-power wide rally shot misses the doubles court', () => {
  const m = matchOf(['a', 'c'], ['b', 'd'], 3);
  serveIn(m);
  driveUntil(m, (v, info) => info.bounceAt, 3);
  const plan = strike(m, 'b', { timing: 1, power: 1, shape: 'flat' });
  assert.equal(plan.outcome, 'out');
  const end = driveUntil(m, (v) => v.phase === 'called', 4);
  assert.equal(end.v.call, 'Out');
  assert.equal(end.v.score.pointsA, '15');
});

test('a short rally ball is for the net player, a deep one for the back player', () => {
  const m = matchOf(['a', 'c'], ['b', 'd'], 3);
  serveIn(m);
  assert.equal(view(m).receiverId, 'b');
  driveUntil(m, (v, info) => info.bounceAt, 3);
  strike(m, 'b', { power: 0.2, timing: 0, shape: 'flat' });
  assert.equal(view(m).receiverId, 'c');
  const deep = matchOf(['a', 'c'], ['b', 'd'], 3);
  serveIn(deep);
  driveUntil(deep, (v, info) => info.bounceAt, 3);
  strike(deep, 'b', { power: 0.7, timing: 0, shape: 'flat' });
  assert.equal(view(deep).receiverId, 'a');
});

test('a swing from the wrong player does not take the point', () => {
  const m = matchOf(['a', 'c'], ['b', 'd'], 3);
  serveIn(m);
  driveUntil(m, (v, info) => info.bounceAt, 3);
  const before = view(m).score.pointsA;
  swing(m, { playerId: 'd', hand: 'forehand', handed: 'right', shape: 'flat', timing: 0, power: 0.7, apex: 0 });
  step(m, 1 / 60);
  assert.equal(view(m).phase, 'flight');
  assert.equal(view(m).score.pointsA, before);
});

test('love, deuce, and advantage follow tennis scoring and a game rotates serve', () => {
  const m = matchOf(['a', 'c'], ['b', 'd'], 3);
  const score = () => view(m).score;
  function play(opts) {
    const end = (() => {
      const id = view(m).serverId;
      toss(m, id);
      swing(m, {
        playerId: id,
        hand: 'forehand',
        handed: 'right',
        shape: 'flat',
        timing: 0,
        power: 0.7,
        apex: 0.95,
        ...opts,
      });
      return driveUntil(m, (v) => v.phase === 'called', 5);
    })();
    assert.equal(end.v.phase, 'called');
    nextPoint(m);
    return score();
  }
  assert.deepEqual([play().pointsA, play({ timing: 1 }).pointsB], ['15', '15']);
  play();
  play({ timing: 1 });
  play();
  const deuce = play({ timing: 1 });
  assert.equal(deuce.pointsA, '40');
  assert.equal(deuce.pointsB, '40');
  const ad = play();
  assert.equal(ad.pointsA, 'Ad');
  assert.equal(ad.pointsB, '40');
  const back = play({ timing: 1 });
  assert.equal(back.pointsA, '40');
  assert.equal(back.pointsB, '40');
  play();
  const game = play();
  assert.equal(game.gamesA, 1);
  assert.equal(game.gamesB, 0);
  assert.equal(game.pointsA, '0');
  assert.equal(game.pointsB, '0');
  const next = view(m);
  assert.equal(next.phase, 'serve');
  assert.equal(next.serverId, 'b');
  assert.equal(next.servingSide, 'B');
  assert.equal(next.pointIndex, 0);
  assert.equal(player(next, 'b').role, 'back');
  assert.equal(player(next, 'd').role, 'net');
  assert.equal(player(next, 'a').role, 'net');
  assert.equal(player(next, 'c').role, 'back');
});

test('best of one ends when a side wins the game, best of three continues', () => {
  function fourAces(bestOf) {
    const m = matchOf(['a'], ['b'], bestOf);
    for (let i = 0; i < 4; i += 1) {
      serveIn(m);
      driveUntil(m, (v) => v.phase === 'called', 5);
      if (i < 3) nextPoint(m);
    }
    return m;
  }
  const one = fourAces(1);
  const won = view(one);
  assert.equal(won.phase, 'called');
  assert.equal(won.winnerSide, 'A');
  assert.equal(won.score.gamesA, 1);
  nextPoint(one);
  assert.equal(view(one).phase, 'match');

  const three = fourAces(3);
  assert.equal(view(three).winnerSide, null);
  assert.equal(view(three).score.gamesA, 1);
  nextPoint(three);
  assert.equal(view(three).phase, 'serve');
  assert.equal(view(three).serverId, 'b');
});

test('a left-handed timing aims the other way on a rally shot', () => {
  function land(handed, timing) {
    const m = matchOf(['a'], ['b'], 3);
    serveIn(m);
    driveUntil(m, (v, info) => info.bounceAt, 3);
    return planShot(m, {
      playerId: 'b', hand: 'backhand', handed, shape: 'flat', timing, power: 0.7, apex: 0,
    }).landX;
  }
  const right = land('right', 1);
  near(land('left', 1), -right, 0.05, 'mirror');
  assert.ok(right < 0, 'from side B a righty late shot goes to the hitter\'s right');
});

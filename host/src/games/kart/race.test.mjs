import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF, PERIM, poseAt, sampleTrack } from './track.js';
import { stickInput } from '../../../../phone/src/games/kart/steer.js';
import { slots } from './layout.js';
import {
  CHECKPOINTS,
  DEFAULT_TUNING,
  LAPS,
  TUNING_LIMITS,
  applyDrive,
  applyUseItem,
  createRace,
  driftView,
  noteProgress,
  placeLabel,
  rankKarts,
  setTuning,
  snapshot,
  stepRace,
} from './race.js';

test('centerline pose stays on the track and progress matches', () => {
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const pose = poseAt(t);
    const sample = sampleTrack(pose.x, pose.z);
    assert.ok(Math.abs(sample.lateral) < 0.05, `lateral ${sample.lateral} at ${t}`);
    const dp = Math.abs(sample.progress - t);
    const wrapped = Math.min(dp, 1 - dp);
    assert.ok(wrapped < 0.02, `progress ${sample.progress} vs ${t}`);
  }
});

test('a point outside the right straight is past the wall', () => {
  const sample = sampleTrack(RC_OUT(), 0);
  assert.ok(sample.lateral > HALF);
});

function RC_OUT() {
  return 16 + HALF + 3;
}

test('crossing the start line opens checkpoint 1 and does not finish a lap', () => {
  const kart = freshKart();
  noteProgress(kart, 0.99, true, 0);
  noteProgress(kart, 0.01, true, 100);
  assert.equal(kart.nextCheckpoint, 1);
  assert.equal(kart.completedLaps, 0);
  assert.equal(kart.finished, false);
});

test('skipping ahead does not count the next gate', () => {
  const kart = freshKart();
  noteProgress(kart, 0.99, true, 0);
  noteProgress(kart, 0.01, true, 100);
  noteProgress(kart, 0.5, true, 200);
  assert.equal(kart.nextCheckpoint, 1);
});

test('leaving the track does not count a gate', () => {
  const kart = freshKart();
  noteProgress(kart, 0.99, true, 0);
  noteProgress(kart, 0.01, false, 100);
  assert.equal(kart.nextCheckpoint, 0);
});

test('three full loops finish the race', () => {
  const kart = freshKart();
  let time = 0;
  noteProgress(kart, 0.99, true, time);
  for (let lap = 0; lap < LAPS; lap++) {
    for (let gate = 0; gate < CHECKPOINTS; gate++) {
      const gateT = gate / CHECKPOINTS;
      time += 100;
      noteProgress(kart, (gateT - 0.01 + 1) % 1, true, time);
      time += 100;
      noteProgress(kart, (gateT + 0.01) % 1, true, time);
    }
  }
  assert.equal(kart.completedLaps, LAPS);
  assert.equal(kart.finished, true);
  assert.equal(kart.finishTimeMs, time);
});

test('gas on the straight builds speed without leaving the track', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -10;
  kart.facing = 0;
  let now = 0;
  for (let i = 0; i < 30; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: i + 1 }, now);
    stepRace(race, 0.05, now);
  }
  const sample = sampleTrack(kart.x, kart.z);
  assert.ok(kart.speed > 20, `speed ${kart.speed}`);
  assert.ok(Math.abs(sample.lateral) < 0.5, `lateral ${sample.lateral}`);
  assert.ok(kart.z > -10);
});

test('a drift release adds a boost', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  assert.equal(driftView(kart).charged, true);
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.equal(driftView(kart).phase, 'boosting');
  assert.ok(driftView(kart).boost > 0);
});

test('stale input coasts', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  kart.speed = 20;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 1 }, 0);
  stepRace(race, 0.05, 1000);
  assert.ok(kart.speed < 20);
});

test('the later lap ranks ahead', () => {
  const race = createRace([
    { playerId: 'a', name: 'A' },
    { playerId: 'b', name: 'B' },
  ], 0);
  race.karts[1].completedLaps = 1;
  const ranked = rankKarts(race.karts);
  assert.equal(ranked[0].playerId, 'b');
});

test('split slots follow every racer', () => {
  assert.equal(slots(1).length, 1);
  assert.equal(slots(2).length, 2);
  assert.equal(slots(4).length, 4);
  const three = slots(3);
  assert.equal(three.length, 3);
  assert.ok(three[2].x > 0 && three[2].x < 0.5);
});

test('an older drive packet does not rewind steer', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  applyDrive(race, { playerId: 'p1', steer: 0.4, gas: true, drift: false, seq: 5 }, 10);
  applyDrive(race, { playerId: 'p1', steer: -1, gas: false, drift: false, seq: 4 }, 11);
  assert.equal(race.karts[0].steer, 0.4);
  assert.equal(race.karts[0].gas, true);
});

function freshKart() {
  return {
    nextCheckpoint: 0,
    gateDelta: null,
    completedLaps: 0,
    finished: false,
    finishTimeMs: null,
    progress: 0,
    speed: 10,
  };
}

test('perimeter is a closed loop longer than the straights', () => {
  assert.ok(PERIM > 150);
});

test('a late driver holding the gas finishes a lap inside the walls', () => {
  const race = createRace([{ playerId: 'p1', name: 'Ada' }], 0);
  const kart = race.karts[0];
  race.phase = 'racing';
  const hist = [];
  let off = 0;
  let steps = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 20; t += dt) {
    const sample = sampleTrack(kart.x, kart.z);
    const aim = poseAt(sample.progress + 0.045);
    const desired = Math.atan2(aim.x - kart.x, aim.z - kart.z);
    let err = desired - kart.facing;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const intent = Math.max(-1, Math.min(1, err / 0.4));
    hist.push(stickInput(-intent * 120, 0, 120).steer);
    const delayed = hist[Math.max(0, hist.length - 10)];
    applyDrive(race, { playerId: 'p1', steer: delayed, gas: true, drift: false, seq: steps + 1 }, t * 1000);
    stepRace(race, dt, t * 1000);
    if (Math.abs(sampleTrack(kart.x, kart.z).lateral) > HALF * 0.98) off += 1;
    steps += 1;
    if (kart.completedLaps >= 1) break;
  }
  assert.equal(kart.completedLaps >= 1, true);
  assert.ok(off / steps < 0.08, `off track ${(off / steps).toFixed(3)}`);
});

test('speed tuning lowers the top speed a gas-holding kart reaches', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  setTuning(race, { speed: 0.5, turn: 9 });
  assert.equal(race.tuning.speed, 0.5);
  assert.equal(race.tuning.turn, 2.2);
  for (let i = 0; i < 80; i++) {
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: i + 1 }, i * 50);
    stepRace(race, 0.05, i * 50);
  }
  assert.ok(race.karts[0].speed < 20, `speed ${race.karts[0].speed}`);
  assert.ok(race.karts[0].speed > 12, `speed ${race.karts[0].speed}`);
});

test('the stick on the rim drifts the kart and releasing it boosts', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  kart.speed = 20;
  const rim = stickInput(-120, 0, 120);
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, {
      playerId: 'p1',
      steer: rim.steer,
      gas: true,
      drift: rim.drift,
      seq: i,
    }, now);
    stepRace(race, 0.05, now);
  }
  assert.equal(driftView(kart).charged, true, `charge ${driftView(kart).charge}`);
  const release = stickInput(0, 0, 120);
  now += 50;
  applyDrive(race, {
    playerId: 'p1',
    steer: release.steer,
    gas: true,
    drift: release.drift,
    seq: 100,
  }, now);
  stepRace(race, 0.05, now);
  assert.equal(driftView(kart).phase, 'boosting');
});

test('each use_item while racing adds exactly one to itemPresses', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  assert.equal(race.karts[0].itemPresses, 0);
  applyUseItem(race, { playerId: 'p1' });
  applyUseItem(race, { playerId: 'p1' });
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(race.karts[0].itemPresses, 3);
});

test('use_item is ignored in countdown, for a finished kart, and for an unknown player', () => {
  const race = createRace([
    { playerId: 'p1', name: 'A' },
    { playerId: 'p2', name: 'B' },
  ], 0);
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(race.karts[0].itemPresses, 0);

  race.phase = 'racing';
  race.karts[0].finished = true;
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(race.karts[0].itemPresses, 0);

  applyUseItem(race, { playerId: 'nobody' });
  assert.equal(race.karts[0].itemPresses, 0);
  assert.equal(race.karts[1].itemPresses, 0);

  applyUseItem(race, { playerId: 'p2' });
  assert.equal(race.karts[1].itemPresses, 1);
  assert.equal(race.karts[0].itemPresses, 0);
});

test('place labels use ordinal suffixes', () => {
  assert.equal(placeLabel(1), '1st');
  assert.equal(placeLabel(2), '2nd');
  assert.equal(placeLabel(3), '3rd');
  assert.equal(placeLabel(4), '4th');
  assert.equal(placeLabel(11), '11th');
  assert.equal(placeLabel(12), '12th');
  assert.equal(placeLabel(21), '21st');
});

test('snapshot exposes MK8 HUD fields and world poses', () => {
  const race = createRace([
    { playerId: 'a', name: 'A' },
    { playerId: 'b', name: 'B' },
  ], 0);
  const shot = snapshot(race);
  assert.equal(shot.lapsTotal, LAPS);
  assert.equal(shot.players.length, 2);
  for (const player of shot.players) {
    assert.equal(typeof player.placeText, 'string');
    assert.equal(player.coins, 0);
    assert.equal(player.itemPrimary, null);
    assert.equal(player.itemSecondary, null);
    assert.equal(typeof player.x, 'number');
    assert.equal(typeof player.z, 'number');
    assert.equal(typeof player.progress, 'number');
  }
});

test('tuning key sets match', () => {
  assert.deepEqual(Object.keys(DEFAULT_TUNING), Object.keys(TUNING_LIMITS));
});

test('a short hold does not boost and a long hold does', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 12; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  assert.equal(driftView(kart).charged, false);
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 50 }, now);
  stepRace(race, 0.05, now);
  assert.notEqual(driftView(kart).phase, 'boosting');

  for (let i = 0; i < 14; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: 60 + i }, now);
    stepRace(race, 0.05, now);
  }
  assert.equal(driftView(kart).charged, true);
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 200 }, now);
  stepRace(race, 0.05, now);
  assert.equal(driftView(kart).phase, 'boosting');
});

test('left drift slips and rolls into the turn', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 8; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.9, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  const view = driftView(kart);
  assert.ok(view.slip > 0, `slip ${view.slip}`);
  assert.ok(view.roll < 0, `roll ${view.roll}`);
  assert.ok(Math.abs(view.travel - wrap(view.facing - view.slip)) < 1e-9);
});

function wrap(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

test('drift scale 0 keeps the nose on the path and scale 2 slips more', () => {
  function hold(driftScale) {
    const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
    race.phase = 'racing';
    setTuning(race, { drift: driftScale });
    const kart = race.karts[0];
    kart.x = 16;
    kart.z = -18;
    kart.facing = 0;
    kart.speed = 20;
    let now = 0;
    for (let i = 0; i < 20; i++) {
      now += 50;
      applyDrive(race, { playerId: 'p1', steer: 0.9, gas: true, drift: true, seq: i }, now);
      stepRace(race, 0.05, now);
    }
    return driftView(kart);
  }
  const zero = hold(0);
  const one = hold(1);
  const two = hold(2);
  assert.ok(Math.abs(zero.slip) < 1e-3, `slip ${zero.slip}`);
  assert.ok(Math.abs(two.slip) > Math.abs(one.slip));
});

test('a charged release from the unboosted cap kicks to the boost cap', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  kart.speed = 32;
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.equal(driftView(kart).phase, 'boosting');
  assert.ok(Math.abs(kart.speed - 42) < 1e-6, `speed ${kart.speed}`);
  assert.ok(Math.abs(driftView(kart).boost - 0.7) < 1e-9, `boost ${driftView(kart).boost}`);
});

test('boost scale doubles the kick and setTuning merges partial keys', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  setTuning(race, { boost: 2 });
  setTuning(race, { speed: 1 });
  assert.equal(race.tuning.boost, 2);
  assert.equal(race.tuning.speed, 1);
  assert.equal(race.tuning.turn, 1);
  setTuning(race, { drift: 9, boost: -1 });
  assert.equal(race.tuning.drift, 2);
  assert.equal(race.tuning.boost, 0);

  setTuning(race, { boost: 2, drift: 1 });
  const kart = race.karts[0];
  kart.x = 16;
  kart.z = -18;
  kart.facing = 0;
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  kart.speed = 32;
  kart.x = 16;
  kart.z = -18;
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.ok(Math.abs(kart.speed - 52) < 1e-6, `speed ${kart.speed}`);
});

test('yaw bonus scales as 1 / 1.35 / 1.7 at drift 0 / 1 / 2', () => {
  function yawDelta(driftScale) {
    const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
    race.phase = 'racing';
    setTuning(race, { drift: driftScale, turn: 1 });
    const kart = race.karts[0];
    kart.x = 16;
    kart.z = -18;
    kart.facing = 0;
    kart.speed = 20;
    kart.appliedSteer = 1;
    applyDrive(race, { playerId: 'p1', steer: 1, gas: true, drift: true, seq: 1 }, 0);
    const before = kart.facing;
    stepRace(race, 0.05, 0);
    return Math.abs(kart.facing - before);
  }
  const d0 = yawDelta(0);
  const d1 = yawDelta(1);
  const d2 = yawDelta(2);
  assert.ok(Math.abs(d1 / d0 - 1.35) < 1e-6, `ratio1 ${d1 / d0}`);
  assert.ok(Math.abs(d2 / d0 - 1.7) < 1e-6, `ratio2 ${d2 / d0}`);
});

test('straight up on the rim does not charge', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  const kart = race.karts[0];
  kart.speed = 20;
  for (let i = 0; i < 20; i++) {
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: true, seq: i }, i * 50);
    stepRace(race, 0.05, i * 50);
  }
  assert.equal(driftView(kart).phase, 'idle');
  assert.equal(driftView(kart).charge, 0);
});

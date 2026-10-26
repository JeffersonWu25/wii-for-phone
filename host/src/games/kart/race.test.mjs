import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIM, followTrack, poseAt, sampleTrack } from './track.js';
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
    assert.equal(typeof pose.halfWidth, 'number');
    assert.ok(pose.halfWidth > 0);
    const dp = Math.abs(sample.progress - t);
    const wrapped = Math.min(dp, 1 - dp);
    assert.ok(wrapped < 0.02, `progress ${sample.progress} vs ${t}`);
  }
});

test('grass beside the start straight is not asphalt', () => {
  const pose = poseAt(0);
  const nx = Math.cos(pose.heading);
  const nz = -Math.sin(pose.heading);
  const sample = sampleTrack(
    pose.x + nx * (pose.halfWidth + 8),
    pose.z + nz * (pose.halfWidth + 8),
    0,
  );
  assert.equal(sample.surface, 'grass');
});

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
  const spawn = placeOnStraight(kart, 4);
  let now = 0;
  for (let i = 0; i < 30; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: i + 1 }, now);
    stepRace(race, 0.05, now);
  }
  const sample = sampleTrack(kart.x, kart.z);
  assert.ok(kart.speed > 20, `speed ${kart.speed}`);
  assert.ok(Math.abs(sample.lateral) < 0.5, `lateral ${sample.lateral}`);
  const ahead = Math.sin(spawn.heading) * (kart.x - spawn.x) + Math.cos(spawn.heading) * (kart.z - spawn.z);
  assert.ok(ahead > 8, `ahead ${ahead}`);
});

test('a drift release adds a boost', () => {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  placeOnStraight(kart, 6);
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

function placeOnStraight(kart, metersAhead) {
  const pose = poseAt(metersAhead / PERIM);
  kart.x = pose.x;
  kart.z = pose.z;
  kart.facing = pose.heading;
  kart.progress = metersAhead / PERIM;
  return pose;
}

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
    const live = sampleTrack(kart.x, kart.z);
    if (typeof live.halfWidth === 'number' && Math.abs(live.lateral) > live.halfWidth * 1.15) off += 1;
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
  placeOnStraight(kart, 6);
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
  placeOnStraight(kart, 6);
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
  placeOnStraight(kart, 6);
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
    placeOnStraight(kart, 6);
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
  placeOnStraight(kart, 6);
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  kart.speed = 32;
  placeOnStraight(kart, 6);
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
  placeOnStraight(kart, 6);
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  kart.speed = 32;
  placeOnStraight(kart, 6);
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
    placeOnStraight(kart, 6);
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

test('sand slows a kart that is not on a mushroom', () => {
  const spot = sandSpot();
  const race = racingKart();
  const kart = race.karts[0];
  kart.speed = 32;
  for (let i = 0; i < 30; i++) {
    pinKart(kart, spot);
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: i + 1 }, i * 50);
    stepRace(race, 0.05, i * 50);
  }
  assert.equal(kart.surface, 'sand');
  assert.ok(kart.speed < 18, `sand speed ${kart.speed}`);
});

test('a mushroom ignores sand drag', () => {
  const spot = sandSpot();
  const race = racingKart();
  const kart = race.karts[0];
  pinKart(kart, spot);
  kart.speed = 16;
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(kart.itemPresses, 1);
  pinKart(kart, spot);
  stepRace(race, 0.05, 50);
  assert.equal(kart.surface, 'sand');
  assert.ok(kart.speed > 28, `mushroom speed ${kart.speed}`);
  assert.notEqual(driftView(kart).phase, 'boosting');
});

test('a dash pad boosts once without starting a mini-turbo', () => {
  const pad = dashApproach();
  const entered = followTrack({
    x0: pad.x0, z0: pad.z0, x1: pad.x1, z1: pad.z1, seedProgress: pad.progress,
  });
  assert.equal(entered.dashEntered, true);
  const again = followTrack({
    x0: pad.x1,
    z0: pad.z1,
    x1: pad.x1 + Math.sin(pad.heading) * 0.5,
    z1: pad.z1 + Math.cos(pad.heading) * 0.5,
    seedProgress: pad.progress,
  });
  assert.equal(again.dashEntered, false);

  const race = racingKart();
  const kart = race.karts[0];
  kart.x = pad.x0;
  kart.z = pad.z0;
  kart.facing = pad.heading;
  kart.progress = pad.progress;
  kart.speed = 20;
  let sawFast = false;
  for (let i = 0; i < 10; i++) {
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: i + 1 }, i * 50);
    stepRace(race, 0.05, i * 50);
    assert.notEqual(driftView(kart).phase, 'boosting');
    if (kart.speed > 34) sawFast = true;
  }
  assert.equal(sawFast, true, `speed ${kart.speed}`);
});

function racingKart() {
  const race = createRace([{ playerId: 'p1', name: 'A' }], 0);
  race.phase = 'racing';
  race.startedAt = 0;
  return race;
}

function pinKart(kart, spot) {
  kart.x = spot.x;
  kart.z = spot.z;
  kart.facing = spot.heading;
  kart.progress = spot.progress;
}

function sandSpot() {
  const apex = widestPose();
  const nx = Math.cos(apex.pose.heading);
  const nz = -Math.sin(apex.pose.heading);
  for (let extra = 3; extra <= 16; extra += 1) {
    const x = apex.pose.x - nx * (apex.pose.halfWidth + extra);
    const z = apex.pose.z - nz * (apex.pose.halfWidth + extra);
    const sample = sampleTrack(x, z, apex.t);
    if (sample.surface === 'sand') {
      return { x, z, heading: apex.pose.heading, progress: sample.progress };
    }
  }
  assert.fail('course has no sand inside the wide turn');
}

function widestPose() {
  let bestT = 0;
  let bestW = 0;
  for (let i = 0; i < 240; i++) {
    const pose = poseAt(i / 240);
    if ((pose.halfWidth || 0) > bestW) {
      bestW = pose.halfWidth;
      bestT = i / 240;
    }
  }
  assert.ok(bestW > 0, 'poseAt has no width');
  return { t: bestT, pose: poseAt(bestT) };
}

function dashApproach() {
  const apex = widestPose();
  for (let i = -50; i <= 50; i++) {
    const t = (apex.t + i / 200 + 1) % 1;
    const pose = poseAt(t);
    const tx = Math.sin(pose.heading);
    const tz = Math.cos(pose.heading);
    const nx = Math.cos(pose.heading);
    const nz = -Math.sin(pose.heading);
    for (const frac of [0.4, 0.6, 0.8]) {
      const lat = pose.halfWidth * frac;
      const x1 = pose.x + nx * lat;
      const z1 = pose.z + nz * lat;
      const x0 = x1 - tx * 3;
      const z0 = z1 - tz * 3;
      const hit = followTrack({ x0, z0, x1, z1, seedProgress: t });
      if (hit.dashEntered) {
        return { x0, z0, x1, z1, heading: pose.heading, progress: t };
      }
    }
  }
  assert.fail('outer final turn has no dash pad');
}

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

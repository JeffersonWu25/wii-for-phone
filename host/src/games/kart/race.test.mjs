import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF, PERIM, poseAt, sampleTrack } from './track.js';
import { slots } from './layout.js';
import {
  CHECKPOINTS,
  LAPS,
  applyDrive,
  createRace,
  noteProgress,
  rankKarts,
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
  kart.heading = 0;
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
  kart.heading = 0;
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  assert.ok(kart.driftCharge > 0.55);
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.ok(kart.boostT > 0);
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

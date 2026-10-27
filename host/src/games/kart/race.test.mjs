import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF, PERIM, poseAt, sampleTrack, luigiCircuit as luigi } from './track.js';
import { CAM_HEIGHT, LOOK_Y, placeCamera } from './camera.js';
import { stickInput } from '../../../../phone/src/games/kart/steer.js';
import { slots } from './layout.js';
import {
  CHECKPOINTS,
  DEFAULT_TUNING,
  LAPS,
  TUNING_LIMITS,
  applyDrive,
  applyUseItem,
  contactFrame,
  createRace,
  driftView,
  gridPose,
  noteProgress,
  placeLabel,
  rankKarts,
  setTuning,
  snapshot,
  stepRace,
} from './race.js';

function raceWith(players, now = 0) {
  return createRace(
    players.map((player) => ({ characterId: 'mario', ...player })),
    now,
    luigi,
  );
}

const BOX_T = luigi.itemBoxProgress;
const MUSHROOM_CAP = 32 * 1.45;
const STAR_CAP = 32 * 1.55;

function startRace(players, rng) {
  const race = createRace(
    players.map((player) => ({ characterId: 'mario', ...player })),
    0,
    luigi,
    rng,
  );
  race.phase = 'racing';
  race.startedAt = 0;
  return race;
}

function park(kart, x, z, facing = 0, progressHint) {
  kart.x = x;
  kart.z = z;
  kart.facing = facing;
  kart.speed = 0;
  kart.steer = 0;
  kart.appliedSteer = 0;
  kart.gas = false;
  kart.drift = false;
  kart.lastInputAt = 0;
  const sample = sampleTrack(x, z, progressHint);
  kart.surface = sample.surface;
  kart.y = sample.y;
  kart.normal = sample.normal;
  kart.progress = sample.progress;
  kart.dashRemaining = 0;
}

function asphaltPose(t = 0.05) {
  const pose = poseAt(t);
  return { x: pose.x, z: pose.z, facing: pose.heading, t };
}

function parkOnTrack(kart, t = 0.05) {
  const pose = asphaltPose(t);
  park(kart, pose.x, pose.z, pose.facing, t);
}

function parkNear(kart, t, lateral = 0, along = 0, facingOffset = 0) {
  const pose = poseAt(t);
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  const tx = Math.sin(pose.heading);
  const tz = Math.cos(pose.heading);
  park(
    kart,
    pose.x + rx * lateral + tx * along,
    pose.z + rz * lateral + tz * along,
    pose.heading + facingOffset,
    t,
  );
}

function firstBox(race) {
  return race.entities.find((entity) => entity.kind === 'box');
}

function hold(race, kart, id) {
  kart.itemPrimary = id;
  applyUseItem(race, { playerId: kart.playerId });
}

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

test('grass beside the start straight is not asphalt', () => {
  const pose = poseAt(0.05);
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  const sample = sampleTrack(
    pose.x + rx * (pose.halfWidth + 4),
    pose.z + rz * (pose.halfWidth + 4),
    0.05,
  );
  assert.equal(sample.surface, 'grass');
  assert.ok(sample.lateral > HALF);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  parkOnTrack(kart, 0.02);
  const start = { x: kart.x, z: kart.z };
  let now = 0;
  for (let i = 0; i < 22; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: i + 1 }, now);
    stepRace(race, 0.05, now);
  }
  const sample = sampleTrack(kart.x, kart.z, kart.progress);
  assert.ok(kart.speed > 20, `speed ${kart.speed}`);
  assert.ok(Math.abs(sample.lateral) < 0.5, `lateral ${sample.lateral}`);
  assert.ok(sample.surface === 'asphalt', sample.surface);
  assert.ok(Math.hypot(kart.x - start.x, kart.z - start.z) > 2);
});

test('a drift release adds a boost', () => {
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  parkOnTrack(kart, 0.05);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  kart.speed = 20;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 1 }, 0);
  stepRace(race, 0.05, 1000);
  assert.ok(kart.speed < 20);
});

test('the later lap ranks ahead', () => {
  const race = raceWith([
    { playerId: 'a', name: 'A' },
    { playerId: 'b', name: 'B' },
  ]);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
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

test('a late driver holding the gas finishes a lap', () => {
  const race = raceWith([{ playerId: 'p1', name: 'Ada' }]);
  const kart = race.karts[0];
  race.phase = 'racing';
  const hist = [];
  let steps = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 30; t += dt) {
    const sample = sampleTrack(kart.x, kart.z, kart.progress);
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
    steps += 1;
    if (kart.completedLaps >= 1) break;
  }
  assert.equal(kart.completedLaps >= 1, true);
  assert.ok(Math.hypot(kart.x, kart.z) < luigi.trackVisuals().grassRadius);
});

test('speed tuning lowers the top speed a gas-holding kart reaches', () => {
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  parkOnTrack(kart, 0.05);
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

test('use_item on an empty slot does nothing', () => {
  const race = startRace([{ playerId: 'p1', name: 'A' }]);
  applyUseItem(race, { playerId: 'p1' });
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(race.karts[0].itemPresses, 0);
  assert.equal(race.karts[0].itemPrimary, null);
  assert.deepEqual(race.karts[0].modifiers, {});
});

test('use_item is ignored in countdown, for a finished kart, and for an unknown player', () => {
  const race = raceWith([
    { playerId: 'p1', name: 'A' },
    { playerId: 'p2', name: 'B' },
  ]);
  race.karts[0].itemPrimary = 'mushroom';
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(race.karts[0].itemPresses, 0);
  assert.equal(race.karts[0].itemPrimary, 'mushroom');
  assert.equal(race.karts[0].modifiers.speed, undefined);

  race.phase = 'racing';
  race.karts[0].finished = true;
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(race.karts[0].itemPresses, 0);
  assert.equal(race.karts[0].itemPrimary, 'mushroom');
  assert.equal(race.karts[0].modifiers.speed, undefined);

  applyUseItem(race, { playerId: 'nobody' });
  assert.equal(race.karts[0].itemPresses, 0);
  assert.equal(race.karts[1].itemPresses, 0);

  race.karts[1].itemPrimary = 'banana';
  applyUseItem(race, { playerId: 'p2' });
  assert.equal(race.karts[1].itemPresses, 1);
  assert.equal(race.karts[1].itemPrimary, null);
  assert.equal(race.karts[1].itemSecondary, null);
  assert.equal(race.karts[0].itemPresses, 0);
  assert.equal(race.karts[0].itemPrimary, 'mushroom');

  race.phase = 'finished';
  race.karts[1].itemPrimary = 'star';
  applyUseItem(race, { playerId: 'p2' });
  assert.equal(race.karts[1].itemPresses, 1);
  assert.equal(race.karts[1].itemPrimary, 'star');
  assert.equal(race.karts[1].modifiers.invuln, undefined);
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
  const race = raceWith([
    { playerId: 'a', name: 'A' },
    { playerId: 'b', name: 'B' },
  ]);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  const kart = race.karts[0];
  parkOnTrack(kart, 0.05);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  const kart = race.karts[0];
  parkOnTrack(kart, 0.05);
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
    const race = raceWith([{ playerId: 'p1', name: 'A' }]);
    race.phase = 'racing';
    setTuning(race, { drift: driftScale });
    const kart = race.karts[0];
    parkOnTrack(kart, 0.05);
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
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  race.phase = 'racing';
  const kart = race.karts[0];
  parkOnTrack(kart, 0.05);
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  parkOnTrack(kart, 0.05);
  kart.speed = 32;
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.equal(driftView(kart).phase, 'boosting');
  assert.ok(Math.abs(kart.speed - 42) < 1e-6, `speed ${kart.speed}`);
  assert.ok(Math.abs(driftView(kart).boost - 0.7) < 1e-9, `boost ${driftView(kart).boost}`);
});

test('boost scale doubles the kick and setTuning merges partial keys', () => {
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
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
  parkOnTrack(kart, 0.05);
  kart.speed = 20;
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i }, now);
    stepRace(race, 0.05, now);
  }
  parkOnTrack(kart, 0.05);
  kart.speed = 32;
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.ok(Math.abs(kart.speed - 52) < 1e-6, `speed ${kart.speed}`);
});

test('yaw bonus scales as 1 / 1.35 / 1.7 at drift 0 / 1 / 2', () => {
  function yawDelta(driftScale) {
    const race = raceWith([{ playerId: 'p1', name: 'A' }]);
    race.phase = 'racing';
    setTuning(race, { drift: driftScale, turn: 1 });
    const kart = race.karts[0];
    parkOnTrack(kart, 0.05);
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

test('createRace keeps the chosen characters and the luigi module', () => {
  const race = createRace([
    { playerId: 'a', name: 'Ada', characterId: 'peach' },
    { playerId: 'b', name: 'Bo', characterId: 'peach' },
  ], 0, luigi);
  assert.equal(race.phase, 'countdown');
  assert.equal(race.countdown, 3);
  assert.equal(race.track, luigi);
  assert.equal(race.trackId, 'luigi-circuit');
  assert.equal(race.karts[0].character.id, 'peach');
  assert.equal(race.karts[1].character.id, 'peach');
  assert.equal(race.karts[0].character.name, 'Peach');
  assert.equal(race.karts[0].seq, -1);
  assert.equal(race.karts[1].character.css, '#f28cb6');
  const pose = gridPose(0, luigi);
  assert.equal(race.karts[0].x, pose.x);
  assert.equal(race.karts[0].z, pose.z);
  assert.notEqual(race.karts[0].character.id, 'mario');

  const daisy = createRace([
    { playerId: 'c', name: 'Cy', characterId: 'daisy' },
  ], 0, luigi);
  assert.equal(daisy.karts[0].character.id, 'daisy');
  assert.equal(daisy.karts[0].character.css, '#f5a423');
});

test('createRace rejects a missing character and a track module without the sample contract', () => {
  assert.throws(() => createRace([{ playerId: 'a', name: 'A' }], 0, luigi));
  assert.throws(() => createRace([{ playerId: 'a', name: 'A', characterId: 'not-a-racer' }], 0, luigi));
  assert.throws(() => createRace(
    [{ playerId: 'a', name: 'A', characterId: 'peach' }],
    0,
    { poseAt, sampleTrack },
  ));
  assert.throws(() => createRace(
    [{ playerId: 'a', name: 'A', characterId: 'peach' }],
    0,
    null,
  ));
});

test('a race starts with six cooldown-free boxes on the centerline', () => {
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  const boxes = race.entities.filter((entity) => entity.kind === 'box');
  assert.equal(boxes.length, 6);
  for (let i = 0; i < BOX_T.length; i++) {
    const pose = poseAt(BOX_T[i]);
    assert.equal(boxes[i].cooldown, 0);
    assert.ok(Math.abs(boxes[i].x - pose.x) < 1e-9);
    assert.ok(Math.abs(boxes[i].z - pose.z) < 1e-9);
    assert.ok(Math.abs(sampleTrack(boxes[i].x, boxes[i].z).lateral) < 0.05);
  }
});

test('centered draws land on the weight table', () => {
  const counts = { mushroom: 0, banana: 0, green_shell: 0, star: 0 };
  for (let i = 0; i < 100; i++) {
    const race = startRace([{ playerId: 'p1', name: 'A' }], () => (i + 0.5) / 100);
    const box = firstBox(race);
    const kart = race.karts[0];
    park(kart, box.x, box.z);
    stepRace(race, 0.05, 50);
    counts[kart.itemPrimary] += 1;
  }
  assert.deepEqual(counts, { mushroom: 35, banana: 30, green_shell: 25, star: 10 });
});

test('an empty kart collects the rng bucket and starts the box cooldown', () => {
  const draws = [0, 0.35, 0.65, 0.9];
  const ids = ['mushroom', 'banana', 'green_shell', 'star'];
  const labels = ['Mushroom', 'Banana', 'Green Shell', 'Star'];
  const colors = ['#e23b3b', '#ffe14a', '#3ddc4a', '#ffe566'];
  for (let i = 0; i < draws.length; i++) {
    const race = startRace([{ playerId: 'p1', name: 'A' }], () => draws[i]);
    const box = firstBox(race);
    const kart = race.karts[0];
    park(kart, box.x, box.z);
    stepRace(race, 0.05, 50);
    assert.equal(kart.itemPrimary, ids[i]);
    assert.equal(kart.itemSecondary, null);
    assert.equal(box.cooldown, 3);
    const shot = snapshot(race).players[0];
    assert.equal(shot.itemLabel, labels[i]);
    assert.equal(shot.itemColor, colors[i]);
    assert.equal(shot.itemSecondary, null);
    assert.equal(shot.effect, null);
  }
});

test('a full slot leaves the box live and a second press does not count', () => {
  const race = startRace([{ playerId: 'p1', name: 'A' }], () => 0);
  const box = firstBox(race);
  const kart = race.karts[0];
  kart.itemPrimary = 'banana';
  park(kart, box.x, box.z);
  stepRace(race, 0.05, 50);
  assert.equal(kart.itemPrimary, 'banana');
  assert.equal(box.cooldown, 0);

  const phase = kart.driftPhase;
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(kart.itemPresses, 1);
  assert.equal(kart.itemPrimary, null);
  assert.equal(kart.itemSecondary, null);
  assert.equal(kart.driftPhase, phase);
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(kart.itemPresses, 1);
});

test('the nearer empty kart takes the box', () => {
  const race = startRace([
    { playerId: 'far', name: 'Far' },
    { playerId: 'near', name: 'Near' },
  ], () => 0);
  const box = firstBox(race);
  park(race.karts[0], box.x + 1.2, box.z);
  park(race.karts[1], box.x + 0.4, box.z);
  stepRace(race, 0.05, 50);
  assert.equal(race.karts[1].itemPrimary, 'mushroom');
  assert.equal(race.karts[0].itemPrimary, null);
  assert.equal(box.cooldown, 3);
});

test('a finished kart does not take a box', () => {
  const race = startRace([{ playerId: 'p1', name: 'A' }], () => 0);
  const box = firstBox(race);
  const kart = race.karts[0];
  kart.finished = true;
  park(kart, box.x, box.z);
  stepRace(race, 0.05, 50);
  assert.equal(kart.itemPrimary, null);
  assert.equal(box.cooldown, 0);
});

test('a mushroom raises the speed cap without touching drift and then expires', () => {
  const race = startRace([{ playerId: 'p1', name: 'A' }], () => 0);
  const kart = race.karts[0];
  const box = firstBox(race);
  park(kart, box.x, box.z);
  stepRace(race, 0.05, 50);
  assert.equal(kart.itemPrimary, 'mushroom');
  const phase = kart.driftPhase;
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(kart.modifiers.speed, 1.5);
  assert.equal(kart.driftPhase, phase);
  assert.equal(snapshot(race).players[0].effect, 'boost');

  parkOnTrack(kart, 0.05);
  kart.speed = 47;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 1 }, 50);
  stepRace(race, 0.05, 100);
  assert.ok(kart.speed < 47, `speed ${kart.speed}`);
  assert.ok(kart.speed <= MUSHROOM_CAP + 1e-6, `speed ${kart.speed}`);
  assert.equal(kart.driftPhase.phase, 'idle');

  let now = 100;
  let steps = 1;
  while (kart.modifiers.speed > 0 && steps < 40) {
    now += 50;
    steps += 1;
    applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: steps }, now);
    stepRace(race, 0.05, now);
  }
  assert.equal(kart.modifiers.speed, undefined);
  assert.equal(snapshot(race).players[0].effect, null);
  parkOnTrack(kart, 0.05);
  kart.speed = 10;
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 80 }, now);
  stepRace(race, 0.05, now);
  assert.ok(kart.speed > 10, `speed ${kart.speed}`);
});

test('a mini-turbo still boosts while a mushroom is up and the cap is the greater one', () => {
  const race = startRace([{ playerId: 'p1', name: 'A' }]);
  const kart = race.karts[0];
  parkOnTrack(kart, 0.05);
  kart.speed = 20;
  hold(race, kart, 'mushroom');
  assert.equal(kart.modifiers.speed, 1.5);
  let now = 0;
  for (let i = 0; i < 16; i++) {
    now += 50;
    applyDrive(race, { playerId: 'p1', steer: 0.8, gas: true, drift: true, seq: i + 1 }, now);
    stepRace(race, 0.05, now);
  }
  assert.equal(driftView(kart).charged, true);
  assert.ok(kart.modifiers.speed > 0);
  parkOnTrack(kart, 0.05);
  kart.speed = 44;
  now += 50;
  applyDrive(race, { playerId: 'p1', steer: 0, gas: true, drift: false, seq: 100 }, now);
  stepRace(race, 0.05, now);
  assert.equal(driftView(kart).phase, 'boosting');
  assert.ok(kart.modifiers.speed > 0);
  assert.ok(kart.speed > 44, `speed ${kart.speed}`);
  assert.ok(kart.speed <= MUSHROOM_CAP + 1e-6, `speed ${kart.speed}`);
});

test('a banana spins another kart, despawns, and ages out', () => {
  const race = startRace([
    { playerId: 'owner', name: 'Owner' },
    { playerId: 'victim', name: 'Victim' },
  ]);
  const owner = race.karts[0];
  const victim = race.karts[1];
  parkNear(owner, 0.05, 0, 0);
  parkNear(victim, 0.12, 0, 0);
  hold(race, owner, 'banana');
  const peel = race.entities.find((entity) => entity.kind === 'banana');
  assert.ok(peel);
  assert.equal(owner.itemPrimary, null);
  const behind = (peel.x - owner.x) * Math.sin(owner.facing) + (peel.z - owner.z) * Math.cos(owner.facing);
  assert.ok(behind < 0);
  assert.ok(Math.abs(Math.hypot(peel.x - owner.x, peel.z - owner.z) - 2.4) < 1e-9);

  park(owner, peel.x, peel.z);
  stepRace(race, 0.05, 50);
  assert.equal(owner.modifiers.spin, undefined);
  assert.equal(race.entities.includes(peel), true);

  parkNear(owner, 0.12, 0, 0);
  park(victim, peel.x, peel.z);
  stepRace(race, 0.05, 100);
  assert.ok(Math.abs(victim.modifiers.spin - (1 - 0.05)) < 1e-9, `spin ${victim.modifiers.spin}`);
  assert.equal(race.entities.includes(peel), false);
  assert.equal(snapshot(race).players.find((player) => player.playerId === 'victim').effect, 'spin');
  const phase = { phase: 'boosting', remaining: 0.5, slip: 0.2 };
  victim.driftPhase = phase;
  parkNear(victim, 0.1, -1.2, 0);
  parkNear(owner, 0.1, 1.2, 0);
  stepRace(race, 0.05, 120);
  assert.equal(victim.driftPhase, phase);
  assert.equal(victim.driftPhase.remaining, 0.5);

  const spun = victim.modifiers.spin;
  hold(race, owner, 'banana');
  const second = race.entities.find((entity) => entity.kind === 'banana');
  park(victim, second.x, second.z);
  stepRace(race, 0.05, 150);
  assert.ok(victim.modifiers.spin < spun, `spin ${victim.modifiers.spin}`);
  assert.ok(Math.abs(victim.modifiers.spin - (spun - 0.05)) < 1e-9);
  assert.equal(race.entities.includes(second), false);

  parkNear(owner, 0.05, 0, 0);
  parkNear(victim, 0.12, 0, 0);
  hold(race, owner, 'banana');
  const aged = race.entities.find((entity) => entity.kind === 'banana');
  let now = 150;
  for (let i = 0; i < 298; i++) {
    now += 50;
    stepRace(race, 0.05, now);
  }
  assert.equal(race.entities.includes(aged), true);
  for (let i = 0; i < 3; i++) {
    now += 50;
    stepRace(race, 0.05, now);
  }
  assert.equal(race.entities.includes(aged), false);
});

test('a green shell flies straight, spins on contact, and dies past the wall', () => {
  const race = startRace([
    { playerId: 'owner', name: 'Owner' },
    { playerId: 'victim', name: 'Victim' },
  ]);
  const owner = race.karts[0];
  const victim = race.karts[1];
  parkNear(owner, 0.05, 0, 0);
  parkNear(victim, 0.12, 0, 0);
  hold(race, owner, 'green_shell');
  const shell = race.entities.find((entity) => entity.kind === 'shell');
  assert.ok(shell);
  const ahead = (shell.x - owner.x) * Math.sin(owner.facing) + (shell.z - owner.z) * Math.cos(owner.facing);
  assert.ok(ahead > 0);
  assert.equal(shell.vx, Math.sin(0) * 48);
  assert.equal(shell.vz, Math.cos(0) * 48);
  const vx = shell.vx;
  const vz = shell.vz;
  park(victim, shell.x, shell.z + 48 * 0.05);
  stepRace(race, 0.05, 50);
  assert.equal(shell.vx, vx);
  assert.equal(shell.vz, vz);
  assert.equal(race.entities.includes(shell), false);
  assert.ok(Math.abs(victim.modifiers.spin - (1 - 0.05)) < 1e-9);
  assert.equal(owner.modifiers.spin, undefined);

  parkNear(owner, 0.05, 0, 0, Math.PI / 2);
  parkNear(victim, 0.12, 0, 0);
  victim.modifiers = {};
  hold(race, owner, 'green_shell');
  const wall = race.entities.find((entity) => entity.kind === 'shell');
  const wallVx = wall.vx;
  const wallVz = wall.vz;
  assert.ok(wallVx > 0);
  stepRace(race, 0.05, 100);
  assert.equal(race.entities.includes(wall), true);
  assert.equal(wall.vx, wallVx);
  assert.equal(wall.vz, wallVz);
  stepRace(race, 0.05, 150);
  assert.equal(race.entities.includes(wall), false);
  assert.equal(wall.vx, wallVx);
  assert.equal(wall.vz, wallVz);
  assert.equal(victim.modifiers.spin, undefined);
});

test('a star blocks spins, rams on a new touch, and then expires', () => {
  const race = startRace([
    { playerId: 'star', name: 'Star' },
    { playerId: 'victim', name: 'Victim' },
  ]);
  const star = race.karts[0];
  const victim = race.karts[1];
  parkNear(star, 0.12, 0, 0);
  parkNear(victim, 0.16, 0, 0);
  star.modifiers.spin = 0.4;
  hold(race, star, 'star');
  assert.equal(star.modifiers.spin, undefined);
  assert.equal(star.modifiers.speed, 5);
  assert.equal(star.modifiers.invuln, 5);
  assert.equal(snapshot(race).players[0].effect, 'star');
  assert.equal(snapshot(race).players[0].itemLabel, null);

  star.speed = 47;
  applyDrive(race, { playerId: 'star', steer: 0, gas: true, drift: false, seq: 1 }, 10);
  stepRace(race, 0.05, 50);
  assert.ok(star.speed > 47, `speed ${star.speed}`);
  assert.ok(star.speed <= STAR_CAP + 1e-6, `speed ${star.speed}`);

  function pile() {
    parkNear(star, 0.05, 0, 0);
    parkNear(victim, 0.05, 1.0, 0);
  }
  pile();
  stepRace(race, 0.05, 100);
  assert.equal(star.modifiers.spin, undefined);
  const first = victim.modifiers.spin;
  assert.ok(Math.abs(first - (1 - 0.05)) < 1e-9, `spin ${first}`);
  pile();
  stepRace(race, 0.05, 150);
  assert.ok(Math.abs(victim.modifiers.spin - (first - 0.05)) < 1e-9, `spin ${victim.modifiers.spin}`);

  let now = 150;
  let guard = 0;
  while (victim.modifiers.spin > 0 && guard < 40) {
    pile();
    now += 50;
    guard += 1;
    stepRace(race, 0.05, now);
  }
  assert.equal(victim.modifiers.spin, undefined);
  pile();
  now += 50;
  stepRace(race, 0.05, now);
  assert.equal(victim.modifiers.spin, undefined, 'still overlapped after the spin ended');
  parkNear(star, 0.05, 0, 0);
  parkNear(victim, 0.12, 0, 0);
  now += 50;
  stepRace(race, 0.05, now);
  pile();
  now += 50;
  stepRace(race, 0.05, now);
  assert.ok(Math.abs(victim.modifiers.spin - (1 - 0.05)) < 1e-9, `re-spin ${victim.modifiers.spin}`);
  assert.equal(star.modifiers.spin, undefined);

  parkNear(victim, 0.12, 0, 0);
  victim.modifiers = {};
  hold(race, victim, 'banana');
  const peel = race.entities.find((entity) => entity.kind === 'banana');
  park(star, peel.x, peel.z);
  parkNear(victim, 0.12, 1.2, 0);
  now += 50;
  stepRace(race, 0.05, now);
  assert.equal(star.modifiers.spin, undefined);
  assert.equal(race.entities.includes(peel), false);
  assert.ok(star.modifiers.invuln > 0);

  parkNear(star, 0.05, 0, 0);
  hold(race, victim, 'green_shell');
  const shell = race.entities.find((entity) => entity.kind === 'shell');
  park(star, shell.x, shell.z + shell.vz * 0.05);
  now += 50;
  stepRace(race, 0.05, now);
  assert.equal(star.modifiers.spin, undefined);
  assert.equal(race.entities.includes(shell), false);

  const before = star.modifiers.speed;
  assert.ok(before > 1.5 && before < 5);
  hold(race, star, 'mushroom');
  assert.ok(star.modifiers.speed + 1e-9 >= before);
  assert.ok(star.modifiers.speed > 1.5);
  star.speed = 48;
  now += 50;
  applyDrive(race, { playerId: 'star', steer: 0, gas: true, drift: false, seq: 90 }, now);
  stepRace(race, 0.05, now);
  assert.ok(star.speed > 48, `merged mul speed ${star.speed}`);

  let left = 0;
  while (((star.modifiers.speed || 0) > 0.05 || (star.modifiers.invuln || 0) > 0.05) && left < 200) {
    left += 1;
    now += 50;
    parkNear(star, 0.1, 0, 0);
    parkNear(victim, 0.14, 0, 0);
    stepRace(race, 0.05, now);
  }
  assert.ok(left < 200, 'star timers did not run out');
  parkNear(star, 0.1, 0, 0);
  parkNear(victim, 0.14, 0, 0);
  star.speed = 20;
  now += 50;
  stepRace(race, 0.05, now);
  assert.equal(star.modifiers.speed, undefined);
  assert.equal(star.modifiers.invuln, undefined);
  assert.ok(star.speed > 0, `speed ${star.speed}`);
  star.speed = 10;
  now += 50;
  applyDrive(race, { playerId: 'star', steer: 0, gas: true, drift: false, seq: 200 }, now);
  stepRace(race, 0.05, now);
  assert.ok(star.speed > 10, `speed ${star.speed}`);
});

test('an unknown item clears the slot and does not count', () => {
  const race = startRace([{ playerId: 'p1', name: 'A' }]);
  const kart = race.karts[0];
  kart.itemPrimary = 'red_shell';
  applyUseItem(race, { playerId: 'p1' });
  assert.equal(kart.itemPrimary, null);
  assert.equal(kart.itemPresses, 0);
  assert.deepEqual(kart.modifiers, {});
  assert.equal(race.entities.some((entity) => entity.kind !== 'box'), false);
  kart.itemSecondary = 'star';
  assert.equal(snapshot(race).players[0].itemSecondary, null);
});

function slopeTrack(normal, follow = true) {
  const sample = {
    y: 0,
    progress: 0.2,
    surface: 'asphalt',
    lateral: 0,
    tx: 0,
    tz: 1,
    dirX: 1,
    dirZ: 0,
  };
  const track = {
    HALF: 6,
    itemBoxProgress: [0],
    poseAt() {
      return { x: 0, z: 0, y: 0, heading: 0, halfWidth: 6 };
    },
    sampleTrack() {
      return { ...sample, normal: { ...normal } };
    },
  };
  if (follow) {
    track.followTrack = ({ x1, z1 }) => ({
      x: x1,
      z: z1,
      ...sample,
      normal: { ...normal },
      dashEntered: false,
    });
  }
  return track;
}

function racingOn(track) {
  const race = createRace(
    [{ playerId: 'p', name: 'P', characterId: 'mario' }],
    0,
    track,
  );
  race.phase = 'racing';
  race.startedAt = 0;
  return race;
}

test('a hit without contact throws', () => {
  const track = slopeTrack({ x: 0, y: 1, z: 0 });
  track.followTrack = () => ({
    x: 0,
    z: 1,
    y: Number.NaN,
    progress: 0,
    surface: 'asphalt',
    normal: { x: 0, y: 1, z: 0 },
  });
  const race = racingOn(track);
  assert.throws(() => stepRace(race, 0.05, 10), /followTrack hit is missing contact/);

  const flat = slopeTrack({ x: 0, y: 0, z: 1 });
  const tipped = racingOn(flat);
  assert.throws(() => stepRace(tipped, 0.05, 10), /followTrack hit is missing contact/);
});

test('downhill raises the gas cap and uphill lowers it', () => {
  function speedAfter(normal) {
    const race = racingOn(slopeTrack(normal));
    const kart = race.karts[0];
    kart.speed = 32;
    kart.gas = true;
    kart.lastInputAt = 10;
    stepRace(race, 0.05, 10);
    return kart.speed;
  }
  const flat = speedAfter({ x: 0, y: 1, z: 0 });
  const down = speedAfter({ x: 0, y: Math.cos(0.3), z: Math.sin(0.3) });
  const up = speedAfter({ x: 0, y: Math.cos(0.3), z: -Math.sin(0.3) });
  assert.ok(down > flat + 0.5, `down ${down} flat ${flat}`);
  assert.ok(up < flat - 0.5, `up ${up} flat ${flat}`);
});

test('a stopped kart does not yaw on a bank, and a moving kart does', () => {
  const normal = { x: -0.3, y: Math.sqrt(1 - 0.09), z: 0 };
  const stopped = racingOn(slopeTrack(normal));
  const still = stopped.karts[0];
  const facing = still.facing;
  stepRace(stopped, 0.05, 10);
  assert.equal(still.facing, facing);
  assert.equal(still.speed, 0);

  const moving = racingOn(slopeTrack(normal));
  const kart = moving.karts[0];
  kart.speed = 16;
  kart.gas = true;
  kart.lastInputAt = 10;
  const before = kart.facing;
  stepRace(moving, 0.05, 10);
  assert.ok(kart.facing < before, `facing ${kart.facing} vs ${before}`);
});

test('the bank lifts the outer tire and an uphill sample pitches nose-up in Three.js', () => {
  let bestT = 0;
  let best = poseAt(0);
  for (let i = 0; i <= 360; i++) {
    const t = i / 360;
    const pose = poseAt(t);
    if (pose.y > best.y) {
      best = pose;
      bestT = t;
    }
  }
  const sample = sampleTrack(best.x, best.z, bestT);
  const frame = contactFrame(sample.normal, best.heading);
  assert.ok(frame.roadRoll > 0.01, `roadRoll ${frame.roadRoll}`);
  assert.ok(Math.sin(frame.roadRoll) > 0);

  const uphill = contactFrame({ x: 0, y: Math.cos(0.3), z: -Math.sin(0.3) }, 0);
  assert.ok(uphill.pitch < 0, `pitch ${uphill.pitch}`);
  assert.ok(uphill.along < 0);
});

test('createRace and the camera use the sampled height', () => {
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
  const kart = race.karts[0];
  const home = gridPose(0, luigi);
  const sample = sampleTrack(home.x, home.z);
  assert.equal(kart.y, sample.y);
  assert.ok(kart.normal.y > 0);
  const box = race.entities.find((entity) => entity.kind === 'box');
  const pose = poseAt(luigi.itemBoxProgress[0]);
  assert.equal(box.y, pose.y);

  const camera = {
    position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    lookAt(x, y, z) { this.look = { x, y, z }; },
    up: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    fov: 0,
  };
  placeCamera(camera, { x: 4, y: 1.5, z: -2 }, 0);
  assert.equal(camera.position.y, 1.5 + CAM_HEIGHT);
  assert.equal(camera.look.y, 1.5 + LOOK_Y);
  assert.equal(camera.up.y, 1);
});

test('a track without followTrack still stores sample contact', () => {
  const race = racingOn(slopeTrack({ x: 0, y: 1, z: 0 }, false));
  const kart = race.karts[0];
  kart.y = 99;
  kart.speed = 5;
  kart.gas = true;
  kart.lastInputAt = 10;
  stepRace(race, 0.05, 10);
  assert.equal(kart.y, 0);
  assert.equal(kart.normal.y, 1);
});

test('straight up on the rim does not charge', () => {
  const race = raceWith([{ playerId: 'p1', name: 'A' }]);
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

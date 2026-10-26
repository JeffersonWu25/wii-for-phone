import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack, poseAt, PERIM } from './track.js';
import { applyDrive, createRace, stepRace } from './race.js';

const STUB_GRID = Object.freeze({
  frontMeters: 2.3,
  rowMeters: 3,
  colOffset: 1.6,
  columns: 2,
});

function stubPlan() {
  return {
    waypoints: [
      { id: 'a', seg: 'start', x: 0, z: -20, halfWidth: 5 },
      { id: 'b', seg: 'start', x: 0, z: 20, halfWidth: 5 },
      { id: 'c', seg: 'start', x: 40, z: 20, halfWidth: 5 },
      { id: 'd', seg: 'start', x: 40, z: -20, halfWidth: 5 },
    ],
    sandBands: [],
    dashes: [],
    corridors: [],
    grid: STUB_GRID,
    grassMargin: 6,
  };
}

test('createTrack builds a second course a race can step', () => {
  const luigiPose = poseAt(0.1);
  const track = createTrack(stubPlan(), {
    id: 'stub-loop',
    itemBoxProgress: [0.25, 0.75],
  });
  const other = createTrack(stubPlan(), { id: 'stub-plain' });

  assert.equal(track.id, 'stub-loop');
  assert.ok(track.PERIM > 0 && track.PERIM < 190, `stub perim ${track.PERIM}`);
  assert.notEqual(track.PERIM, PERIM);
  assert.deepEqual([...track.itemBoxProgress], [0.25, 0.75]);
  assert.ok(Object.isFrozen(track.itemBoxProgress));
  assert.deepEqual([...other.itemBoxProgress], [0.08, 0.22, 0.38, 0.55, 0.72, 0.88]);
  assert.deepEqual(poseAt(0.1), luigiPose);

  const race = createRace(
    [{ playerId: 'a', name: 'Ada', characterId: 'mario' }],
    0,
    track,
  );
  assert.equal(race.track, track);
  const boxes = race.entities.filter((entity) => entity.kind === 'box');
  assert.equal(boxes.length, track.itemBoxProgress.length);
  for (let i = 0; i < boxes.length; i++) {
    const pose = track.poseAt(track.itemBoxProgress[i]);
    assert.ok(Math.abs(boxes[i].x - pose.x) < 1e-9);
    assert.ok(Math.abs(boxes[i].z - pose.z) < 1e-9);
  }

  race.phase = 'racing';
  race.startedAt = 0;
  applyDrive(race, { playerId: 'a', steer: 0.2, gas: true, drift: false, seq: 1 }, 10);
  for (let i = 0; i < 30; i++) stepRace(race, 0.05, 10 + i * 50);
  assert.ok(Number.isFinite(race.karts[0].x));
  assert.ok(Number.isFinite(race.karts[0].speed));
  assert.equal(typeof track.trackVisuals().grassRadius, 'number');
  assert.equal(typeof other.poseAt(0).halfWidth, 'number');
});

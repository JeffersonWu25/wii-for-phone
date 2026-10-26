import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF, PERIM, createTrack, itemBoxProgress, poseAt } from './track.js';
import * as luigiNs from './track.js';
import { applyDrive, createRace, stepRace } from './race.js';

/** Minimal second track that only satisfies the race/items/scene contract. */
function ovalTrack() {
  const half = 5;
  const radius = 20;
  return {
    HALF: half,
    itemBoxProgress: Object.freeze([0.25, 0.75]),
    poseAt(t) {
      const a = t * Math.PI * 2;
      return {
        x: Math.sin(a) * radius,
        z: Math.cos(a) * radius,
        heading: a + Math.PI / 2,
        halfWidth: half,
        visualOuterY: 0,
      };
    },
    sampleTrack(x, z) {
      const progress = (Math.atan2(x, z) / (Math.PI * 2) + 1) % 1;
      const r = Math.hypot(x, z);
      return {
        progress,
        lateral: r - radius,
        surface: Math.abs(r - radius) <= half ? 'asphalt' : 'grass',
        dirX: x / (r || 1),
        dirZ: z / (r || 1),
        tx: Math.cos(Math.atan2(x, z)),
        tz: -Math.sin(Math.atan2(x, z)),
        cx: Math.sin(Math.atan2(x, z)) * radius,
        cz: Math.cos(Math.atan2(x, z)) * radius,
        halfWidth: half,
        onDash: false,
      };
    },
    trackVisuals() {
      const road = [];
      for (let i = 0; i < 32; i++) {
        const pose = this.poseAt(i / 32);
        road.push({
          x: pose.x,
          z: pose.z,
          heading: pose.heading,
          halfWidth: half,
          visualOuterY: 0,
        });
      }
      return {
        grassRadius: radius + half + 8,
        road,
        edges: { inner: road.map((p) => ({ x: p.x, z: p.z })), outer: road.map((p) => ({ x: p.x, z: p.z })) },
        sand: [],
        dashes: [],
        startFinish: { x: 0, z: radius, heading: Math.PI / 2, width: half * 2, depth: 1 },
        gridMarks: [],
      };
    },
  };
}

test('createRace accepts a non-Luigi track and steps without throwing', () => {
  const track = ovalTrack();
  const race = createRace(
    [{ playerId: 'a', name: 'Ada', characterId: 'mario' }],
    0,
    track,
  );
  assert.equal(race.track, track);
  assert.equal(race.entities.filter((e) => e.kind === 'box').length, 2);
  race.phase = 'racing';
  race.startedAt = 0;
  applyDrive(race, { playerId: 'a', steer: 0.2, gas: true, drift: false, seq: 1 }, 10);
  for (let i = 0; i < 30; i++) stepRace(race, 0.05, 10 + i * 50);
  assert.ok(Number.isFinite(race.karts[0].x));
  assert.ok(Number.isFinite(race.karts[0].speed));
  assert.equal(typeof track.trackVisuals().grassRadius, 'number');
});

function rectanglePlan() {
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
    grid: {
      frontMeters: 2.3,
      rowMeters: 3,
      colOffset: 1.6,
      columns: 2,
    },
    grassMargin: 6,
  };
}

test('createTrack compiles a short rectangle and a race can step it', () => {
  const luigiAt = poseAt(0.1);
  const track = createTrack(rectanglePlan(), {
    id: 'rect',
    itemBoxProgress: [0.25, 0.75],
  });

  assert.equal(Object.isFrozen(track), true);
  assert.equal(track.id, 'rect');
  assert.equal(track.PERIM, 160);
  assert.notEqual(track.PERIM, PERIM);
  assert.equal(track.HALF, 5);
  assert.deepEqual([...track.itemBoxProgress], [0.25, 0.75]);
  assert.equal(Object.isFrozen(track.itemBoxProgress), true);
  const start = track.poseAt(0);
  assert.equal(start.x, 0);
  assert.equal(start.z, -20);
  assert.equal(start.halfWidth, 5);
  assert.deepEqual(poseAt(0.1), luigiAt);
  assert.equal(luigiNs.poseAt, poseAt);
  assert.equal(luigiNs.HALF, HALF);
  assert.equal(luigiNs.PERIM, PERIM);
  assert.equal(luigiNs.itemBoxProgress, itemBoxProgress);
  assert.equal(luigiNs.luigiCircuit.poseAt, poseAt);

  assert.throws(
    () => createTrack(rectanglePlan(), {
      perimRange: [190, 245],
      itemBoxProgress: [0.5],
    }),
    /PERIM 160/,
  );

  const race = createRace(
    [{ playerId: 'a', name: 'Ada', characterId: 'mario' }],
    0,
    track,
  );
  assert.equal(race.track, track);
  const boxes = race.entities.filter((entity) => entity.kind === 'box');
  assert.equal(boxes.length, 2);
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
});

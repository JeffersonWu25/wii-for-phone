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
    itemBoxSites: Object.freeze([
      Object.freeze({ progress: 0.25, stack: 1 }),
      Object.freeze({ progress: 0.75, stack: 1 }),
    ]),
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
      const outer = [];
      const inner = [];
      for (let i = 0; i < 32; i++) {
        const pose = this.poseAt(i / 32);
        const nx = Math.cos(pose.heading);
        const nz = -Math.sin(pose.heading);
        outer.push({ x: pose.x + nx * half, z: pose.z + nz * half });
        inner.push({ x: pose.x - nx * half, z: pose.z - nz * half });
      }
      return {
        grassRadius: radius + half + 8,
        mesh: {
          positions: new Float32Array(0),
          normals: new Float32Array(0),
          uvs: new Float32Array(0),
          indices: new Uint32Array(0),
          groups: [],
        },
        atlas: { width: 1, height: 1, rgba: new Uint8ClampedArray([0, 0, 0, 0]) },
        curbInnerAtlas: { width: 1, height: 1, rgba: new Uint8ClampedArray([0, 0, 0, 0]) },
        curbOuterAtlas: { width: 1, height: 1, rgba: new Uint8ClampedArray([0, 0, 0, 0]) },
        outline: {
          inner,
          outer,
          sand: [],
          dashes: [],
          stripe: { x: 0, z: radius, heading: Math.PI / 2, width: half * 2, depth: 1 },
        },
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
  assert.equal(
    race.entities.filter((e) => e.kind === 'box').length,
    track.itemBoxSites.reduce((sum, site) => sum + 5 * site.stack, 0),
  );
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
      { id: 'b', seg: 'loop', x: 0, z: 20, halfWidth: 5 },
      { id: 'c', seg: 'loop', x: 40, z: 20, halfWidth: 5 },
      { id: 'd', seg: 'loop', x: 40, z: -20, halfWidth: 5 },
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
    itemBoxProgress: [0.25, 0.75],
  };
}

test('createTrack compiles a short rectangle and a race can step it', () => {
  const luigiAt = poseAt(0.1);
  const track = createTrack(rectanglePlan(), { id: 'rect' });

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
    () => createTrack(rectanglePlan(), { perimRange: [190, 245] }),
    /PERIM 160/,
  );
  assert.throws(
    () => createTrack(rectanglePlan(), { requireStartGrid: true }),
    /start straight/,
  );

  const race = createRace(
    [{ playerId: 'a', name: 'Ada', characterId: 'mario' }],
    0,
    track,
  );
  assert.equal(race.track, track);
  const boxes = race.entities.filter((entity) => entity.kind === 'box');
  assert.equal(boxes.length, track.itemBoxSites.reduce((sum, site) => sum + 5 * site.stack, 0));
  for (let i = 0; i < track.itemBoxSites.length; i++) {
    const pose = track.poseAt(track.itemBoxSites[i].progress);
    const mid = boxes.find((box) => box.columnKey === `${i}:2` && box.tier === 0);
    assert.ok(mid);
    assert.ok(Math.abs(mid.x - pose.x) < 1e-9);
    assert.ok(Math.abs(mid.z - pose.z) < 1e-9);
  }

  race.phase = 'racing';
  race.startedAt = 0;
  applyDrive(race, { playerId: 'a', steer: 0.2, gas: true, drift: false, seq: 1 }, 10);
  for (let i = 0; i < 30; i++) stepRace(race, 0.05, 10 + i * 50);
  assert.ok(Number.isFinite(race.karts[0].x));
  assert.ok(Number.isFinite(race.karts[0].speed));
  assert.equal(typeof track.trackVisuals().grassRadius, 'number');
});

test('createTrack freezes sites derived from one list and rejects two lists', () => {
  const plan = rectanglePlan();
  const fromSites = createTrack(plan, {
    itemBoxSites: [{ progress: 1.25, stack: 2 }],
  });
  assert.deepEqual([...fromSites.itemBoxProgress], [0.25]);
  assert.deepEqual(
    fromSites.itemBoxSites.map((site) => ({ progress: site.progress, stack: site.stack })),
    [{ progress: 0.25, stack: 2 }],
  );
  assert.equal(Object.isFrozen(fromSites.itemBoxSites), true);
  assert.equal(Object.isFrozen(fromSites.itemBoxSites[0]), true);
  assert.equal(Object.isFrozen(fromSites.itemBoxProgress), true);

  const fromProgress = createTrack(plan, { itemBoxProgress: [-0.25, 0.5] });
  assert.deepEqual(
    fromProgress.itemBoxSites.map((site) => ({ progress: site.progress, stack: site.stack })),
    [{ progress: 0.75, stack: 1 }, { progress: 0.5, stack: 1 }],
  );

  const sitesOnly = { ...plan };
  delete sitesOnly.itemBoxProgress;
  sitesOnly.itemBoxSites = [{ progress: 0.1, stack: 2 }];
  const overridden = createTrack(sitesOnly, { itemBoxProgress: [0.4] });
  assert.deepEqual(
    overridden.itemBoxSites.map((site) => ({ progress: site.progress, stack: site.stack })),
    [{ progress: 0.4, stack: 1 }],
  );

  assert.throws(
    () => createTrack(plan, {
      itemBoxSites: [{ progress: 0.2, stack: 1 }],
      itemBoxProgress: [0.2],
    }),
    /both itemBoxSites and itemBoxProgress/,
  );
  assert.throws(
    () => createTrack({ ...plan, itemBoxSites: [{ progress: 0.2, stack: 1 }] }),
    /both itemBoxSites and itemBoxProgress/,
  );
  assert.throws(() => createTrack(plan, { itemBoxProgress: [] }), /non-empty/);
  assert.throws(
    () => createTrack(plan, { itemBoxSites: [{ progress: 0.2, stack: 3 }] }),
    /stack must be 1 or 2/,
  );
  assert.throws(
    () => createTrack(plan, { itemBoxSites: [{ progress: Number.NaN, stack: 1 }] }),
    /finite/,
  );
  const bare = { ...plan };
  delete bare.itemBoxProgress;
  assert.throws(() => createTrack(bare), /itemBoxSites or itemBoxProgress/);
});

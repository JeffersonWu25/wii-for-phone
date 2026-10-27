import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF, PERIM, createTrack, itemBoxProgress, poseAt } from './track.js';
import * as luigiNs from './track.js';
import { LUIGI_PLAN } from './tracks/luigi-circuit-plan.js';
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
        y: 0,
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
        y: 0,
        normal: { x: 0, y: 1, z: 0 },
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
  const home = track.poseAt(0);
  assert.equal(home.y, 0);
  assert.equal('visualOuterY' in home, false);
  const contact = track.sampleTrack(home.x, home.z);
  assert.equal(contact.y, 0);
  assert.deepEqual(contact.normal, { x: 0, y: 1, z: 0 });
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
    () => createTrack(rectanglePlan(), { perimRange: LUIGI_PLAN.perimRange }),
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

test('a sand feather starts at the lip and reaches full depth past the ramp', () => {
  const plan = rectanglePlan();
  plan.sandBands = [{ from: 'a', u0: 0, to: 'b', u1: 0, depth: 10, feather: 8 }];
  const track = createTrack(plan, { id: 'feather' });
  const pose = track.poseAt(0.125);
  const rightX = Math.cos(pose.heading);
  const rightZ = -Math.sin(pose.heading);
  const mid = track.sampleTrack(pose.x - rightX * (pose.halfWidth + 4), pose.z - rightZ * (pose.halfWidth + 4));
  const edgePose = track.poseAt(2 / track.PERIM);
  const edge = track.sampleTrack(
    edgePose.x - Math.cos(edgePose.heading) * (edgePose.halfWidth + 4),
    edgePose.z + Math.sin(edgePose.heading) * (edgePose.halfWidth + 4),
  );
  assert.equal(mid.surface, 'sand');
  assert.equal(edge.surface, 'grass');
});

test('compile rejects visualOuterY and a non-finite bank', () => {
  const legacy = rectanglePlan();
  legacy.waypoints[0] = { ...legacy.waypoints[0], visualOuterY: 0.9 };
  assert.throws(
    () => createTrack(legacy),
    /a: visualOuterY was replaced by centerY and bankOuterY/,
  );
  const bad = rectanglePlan();
  bad.waypoints[1] = { ...bad.waypoints[1], bankOuterY: Number.NaN };
  assert.throws(() => createTrack(bad), /b: bankOuterY must be finite/);
});

test('a steep bank shoulders wider than 8 m and still meets the inner lip', () => {
  const bank = 3;
  const half = 5;
  const plan = rectanglePlan();
  plan.waypoints = [
    { id: 'a', seg: 'start', x: 0, z: -80, halfWidth: half, centerY: bank, bankOuterY: bank },
    { id: 'b', seg: 'loop', x: 0, z: 80, halfWidth: half, centerY: bank, bankOuterY: bank },
    { id: 'c', seg: 'loop', x: 200, z: 80, halfWidth: half },
    { id: 'd', seg: 'loop', x: 200, z: -80, halfWidth: half },
  ];
  const track = createTrack(plan, { id: 'steep' });
  const pose = track.poseAt(80 / track.PERIM);
  assert.ok(Math.abs(pose.x) < 1e-6 && Math.abs(pose.z) < 1e-6, `pose ${pose.x},${pose.z}`);
  const rightX = Math.cos(pose.heading);
  const rightZ = -Math.sin(pose.heading);
  const at = (lateral) => track.sampleTrack(pose.x + rightX * lateral, pose.z + rightZ * lateral);
  const lip = at(-half);
  const near = at(half + 8);
  const far = at(half + 30);
  assert.equal(lip.surface, 'asphalt');
  assert.ok(Math.abs(lip.y - 0) < 1e-6, `inner lip ${lip.y}`);
  assert.ok(near.y > 1, `8 m past the lip is still on the berm (${near.y})`);
  assert.ok(Math.abs(far.y - lip.y) < 1e-3, `past the berm ${far.y}`);
  assert.ok(near.y > far.y + 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { luigiCircuit as luigi } from './track.js';
import { createRace, stepRace, applyUseItem } from './race.js';
import { presentation } from './items.js';
import { syncEntities } from './entity-mesh.js';

test('item presentation stays data-driven from the registry', () => {
  assert.deepEqual(presentation('mushroom'), { label: 'Mushroom', color: '#e23b3b' });
  assert.equal(presentation('not-an-item'), null);
});

test('a self-buff item activates from the kart slot without race.js knowing the id', () => {
  const race = createRace(
    [{ playerId: 'p', name: 'P', characterId: 'mario' }],
    0,
    luigi,
  );
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  kart.itemPrimary = 'mushroom';
  applyUseItem(race, { playerId: 'p' });
  assert.equal(kart.itemPrimary, null);
  assert.ok(kart.modifiers.speed > 0);
  stepRace(race, 0.05, 50);
  assert.ok(kart.speedMul >= 1);
});

test('green shell guide moves the entity without race.js naming the guide', () => {
  const race = createRace(
    [{ playerId: 'p', name: 'P', characterId: 'mario' }],
    0,
    luigi,
  );
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  parkOnAsphalt(kart);
  kart.itemPrimary = 'green_shell';
  const before = race.entities.length;
  applyUseItem(race, { playerId: 'p' });
  const shell = race.entities.find((entity) => entity.kind === 'shell');
  assert.ok(shell, 'shell spawned');
  assert.equal(race.entities.length, before + 1);
  const x0 = shell.x;
  const z0 = shell.z;
  stepRace(race, 0.05, 50);
  assert.ok(Math.hypot(shell.x - x0, shell.z - z0) > 1, 'GUIDES.straight advanced the shell');
});

function parkOnAsphalt(kart) {
  const pose = luigi.poseAt(0.05);
  kart.x = pose.x;
  kart.z = pose.z;
  kart.facing = pose.heading;
  kart.progress = 0.05;
  kart.surface = 'asphalt';
  kart.y = pose.y;
}

function apexPose() {
  let bestT = 0;
  let best = luigi.poseAt(0);
  for (let i = 0; i <= 360; i++) {
    const t = i / 360;
    const pose = luigi.poseAt(t);
    if (pose.y > best.y) {
      best = pose;
      bestT = t;
    }
  }
  return { ...best, t: bestT };
}

test('a banana keeps the kart height and a shell takes the road', () => {
  const race = createRace(
    [{ playerId: 'p', name: 'P', characterId: 'mario' }],
    0,
    luigi,
  );
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  parkOnAsphalt(kart);
  kart.y = 0.4;
  kart.itemPrimary = 'banana';
  applyUseItem(race, { playerId: 'p' });
  const peel = race.entities.find((entity) => entity.kind === 'banana');
  assert.equal(peel.y, 0.4);
  stepRace(race, 0.05, 50);
  assert.equal(peel.y, 0.4);

  kart.y = 0.4;
  kart.itemPrimary = 'green_shell';
  applyUseItem(race, { playerId: 'p' });
  const shell = race.entities.find((entity) => entity.kind === 'shell');
  assert.equal(shell.y, 0.4);
  assert.equal(shell.progress, kart.progress);
  shell.vx = 0;
  shell.vz = 0;
  shell.y = 5;
  stepRace(race, 0.05, 100);
  const home = luigi.sampleTrack(shell.x, shell.z, shell.progress);
  assert.ok(Math.abs(shell.y - home.y) < 1e-6, `shell y ${shell.y}`);
  assert.notEqual(shell.y, 5);
});

test('a shell stays on wide asphalt and retires off the road', () => {
  const race = createRace(
    [{ playerId: 'p', name: 'P', characterId: 'mario' }],
    0,
    luigi,
  );
  race.phase = 'racing';
  race.startedAt = 0;
  const kart = race.karts[0];
  parkOnAsphalt(kart);
  kart.itemPrimary = 'green_shell';
  applyUseItem(race, { playerId: 'p' });
  const shell = race.entities.find((entity) => entity.kind === 'shell');
  const apex = apexPose();
  const lateral = (luigi.HALF + apex.halfWidth) / 2;
  shell.x = apex.x + Math.cos(apex.heading) * lateral;
  shell.z = apex.z - Math.sin(apex.heading) * lateral;
  shell.progress = apex.t;
  shell.vx = 0;
  shell.vz = 0;
  const onRoad = luigi.sampleTrack(shell.x, shell.z, shell.progress);
  assert.equal(onRoad.surface, 'asphalt');
  assert.ok(Math.abs(onRoad.lateral) > luigi.HALF);
  stepRace(race, 0.05, 50);
  assert.equal(race.entities.some((entity) => entity.id === shell.id), true);
  assert.ok(Math.abs(shell.y - onRoad.y) < 1e-6);

  shell.x = apex.x + Math.cos(apex.heading) * (apex.halfWidth + 14);
  shell.z = apex.z - Math.sin(apex.heading) * (apex.halfWidth + 14);
  const off = luigi.sampleTrack(shell.x, shell.z, shell.progress);
  assert.notEqual(off.surface, 'asphalt');
  stepRace(race, 0.05, 100);
  assert.equal(race.entities.some((entity) => entity.id === shell.id), false);
});

test('item meshes hover above the sampled surface', () => {
  const scene = new THREE.Scene();
  const pool = new Map();
  syncEntities(scene, pool, [
    { id: 1, kind: 'box', x: 0, y: 0.45, z: 0, cooldown: 0 },
    { id: 2, kind: 'banana', x: 1, y: 0.2, z: 0 },
    { id: 3, kind: 'shell', x: 2, y: 0.9, z: 0, color: '#3ddc4a' },
  ], 0);
  assert.equal(pool.get(1).userData.hover, 1.15);
  assert.ok(Math.abs(pool.get(1).position.y - 1.6) < 1e-6);
  assert.equal(pool.get(2).userData.hover, 0.28);
  assert.ok(Math.abs(pool.get(2).position.y - 0.48) < 1e-6);
  assert.equal(pool.get(3).userData.hover, 0.42);
  assert.ok(Math.abs(pool.get(3).position.y - 1.32) < 1e-6);
});

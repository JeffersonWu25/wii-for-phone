import test from 'node:test';
import assert from 'node:assert/strict';
import { luigiCircuit as luigi } from './track.js';
import { createRace, stepRace, applyUseItem } from './race.js';
import { presentation } from './items.js';

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
}

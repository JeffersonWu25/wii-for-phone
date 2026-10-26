import test from 'node:test';
import assert from 'node:assert/strict';
import { luigiCircuit as luigi } from './track.js';
import { CHARACTERS, characterById, playableCharacters } from './characters.js';
import { createRace, stepRace, applyDrive } from './race.js';

test('every roster character carries positive speed turn drift boost stats', () => {
  for (const character of CHARACTERS) {
    for (const key of ['speed', 'turn', 'drift', 'boost']) {
      assert.ok(character.stats[key] > 0, `${character.id}.${key}`);
    }
  }
  assert.equal(playableCharacters().length, 4);
});

test('heavier stats reach a higher asphalt top speed under identical host tuning', () => {
  function topSpeed(characterId) {
    const race = createRace(
      [{ playerId: 'p', name: 'P', characterId }],
      0,
      luigi,
    );
    race.phase = 'racing';
    race.startedAt = 0;
    const kart = race.karts[0];
    let now = 0;
    for (let i = 0; i < 240; i++) {
      now += 50;
      applyDrive(race, { playerId: 'p', steer: 0, gas: true, drift: false, seq: i }, now);
      stepRace(race, 0.05, now);
    }
    return kart.speed;
  }

  const bowser = topSpeed('bowser');
  const toad = topSpeed('toad');
  assert.ok(bowser > toad + 1, `bowser ${bowser} should beat toad ${toad}`);
  assert.equal(characterById('bowser').stats.speed > characterById('toad').stats.speed, true);
});

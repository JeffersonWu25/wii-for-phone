import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redTarget, findLock, LOCK_RANGE } from './shells.js';
import { buildTrack } from './track.js';

const track = buildTrack();

test('redTarget is the id one place ahead, null for 1st', () => {
  const race = { standings: ['a', 'b', 'c'] };
  assert.equal(redTarget(race, 'c'), 'b');
  assert.equal(redTarget(race, 'a'), null);
});

test('findLock picks only karts ahead within LOCK_RANGE and never the owner', () => {
  const at = (id, s) => {
    const f = track.frameAt(s);
    return { id, s, x: f.x, z: f.z };
  };
  const race = { karts: [at('o', 50), at('ahead', 50 + LOCK_RANGE - 3), at('far', 50 + LOCK_RANGE + 10), at('behind', 45)] };
  const shell = { owner: 'o', ...at('shell', 50) };
  assert.equal(findLock(shell, race, track), 'ahead');
  race.karts = race.karts.filter((k) => k.id !== 'ahead');
  assert.equal(findLock(shell, race, track), null);
});

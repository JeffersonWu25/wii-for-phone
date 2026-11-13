import test from 'node:test';
import assert from 'node:assert/strict';
import { CUP_POINTS, cupPodium, cupStandings, placePoints } from './cup.js';

const race = (...ids) => ids.map((playerId, i) => ({ playerId, name: playerId.toUpperCase(), color: '#fff', place: i + 1 }));

test('points table follows 12-racer Mario Kart', () => {
  assert.deepEqual(CUP_POINTS, [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(placePoints(1), 15);
  assert.equal(placePoints(4), 9);
  assert.equal(placePoints(13), 0);
});

test('standings add points across races', () => {
  const s = cupStandings([race('a', 'b', 'c'), race('b', 'a', 'c')]);
  assert.deepEqual(s.map((r) => [r.playerId, r.points, r.rank]), [['b', 27, 1], ['a', 27, 2], ['c', 20, 3]]);
});

test('a tie goes to the better place in the latest race', () => {
  const s = cupStandings([race('a', 'b'), race('b', 'a')]);
  assert.deepEqual(s.map((r) => r.playerId), ['b', 'a']);
  assert.equal(s[0].points, s[1].points);
});

test('standings after one race are just that race', () => {
  const s = cupStandings([race('a', 'b', 'c', 'd')]);
  assert.deepEqual(s.map((r) => r.points), [15, 12, 10, 9]);
});

test('podium is the top three', () => {
  const p = cupPodium([race('a', 'b', 'c', 'd')]);
  assert.deepEqual(p.map((r) => r.playerId), ['a', 'b', 'c']);
  assert.equal(cupPodium([race('a', 'b')]).length, 2);
});

test('no races gives no standings', () => {
  assert.deepEqual(cupStandings([]), []);
});

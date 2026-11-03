import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redTarget, findLock, fireShell, stepShell, GREEN_MAX_BOUNCES, LOCK_RANGE } from './shells.js';
import { createRace } from './race.js';
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

// ── Walls ────────────────────────────────────────────────────────────────────

const ids = ['a', 'b', 'c'];
function wallRace() {
  const race = createRace(track, ids.map((id) => ({ id, name: id, color: 0 })), { seed: 3 });
  race.standings = [...ids].reverse(); // c is 1st, a is last
  race.karts.forEach((k) => { k.place = race.standings.indexOf(k.id) + 1; });
  return race;
}
function put(kart, s, lateral = 0) {
  const fr = track.frameAt(s);
  Object.assign(kart, { s, lateral, x: fr.x + fr.rx * lateral, z: fr.z + fr.rz * lateral, h: fr.h, speed: 0, vx: 0, vz: 0 });
}
const bounceEvents = (race, sh) => race.events.filter((e) => e.type === 'bounce' && e.entityId === sh.id).length;

test('a red shell pursuing a kart hugging the wall is not spent by wall contacts without reflections', () => {
  const race = wallRace();
  const [a, b] = race.karts;
  const s = 200;
  const lim = track.surfaceAt(s + 8, 0).limitR;
  put(a, s, 0);
  a.speed = 20;
  put(b, s + 8, lim - 0.1);
  race.standings = ['b', 'a', 'c'];
  const sh = fireShell(race, a, 'red', { dir: 'forward', angle: 0 }, track);
  assert.equal(sh.target, 'b');
  for (let i = 0; i < 60; i++) {
    sh.age += 1 / 60;
    assert.equal(stepShell(sh, race, track, 1 / 60), true, `alive at step ${i}`);
  }
  assert.equal(bounceEvents(race, sh), sh.bounces, 'one bounce event per counted reflection');
});

test('a green shell counts one bounce per reflection while running along a wall', () => {
  const race = wallRace();
  const a = race.karts[0];
  put(a, 200, 0);
  const sh = fireShell(race, a, 'green', { dir: 'forward', angle: 0.25 }, track);
  let alive = true;
  for (let i = 0; i < 150 && alive; i++) {
    sh.age += 1 / 60;
    alive = stepShell(sh, race, track, 1 / 60);
  }
  assert.ok(sh.bounces >= 1);
  assert.equal(bounceEvents(race, sh), sh.bounces);
  assert.equal(alive, sh.bounces <= GREEN_MAX_BOUNCES);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResults, buildStatus, countdownLabel, countdownLights, cssColor, fitMinimap, ordinal, playerColor, startTick, statusKey } from './hud.js';

test('player colors are distinct and wrap', () => {
  const colors = Array.from({ length: 8 }, (_, i) => playerColor(i));
  assert.equal(new Set(colors).size, 8);
  assert.equal(playerColor(8), playerColor(0));
  assert.equal(cssColor(playerColor(0)), '#e8423a');
});

test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4].map(ordinal), ['1st', '2nd', '3rd', '4th']);
});

test('countdown lights fill 0..5 over three seconds, then go, then off', () => {
  const r = (phase, countdown, goTimer = 0) => ({ phase, countdown, goTimer });
  assert.equal(countdownLights(r('countdown', 3)), 0);
  assert.equal(countdownLights(r('countdown', 2.7)), 1);
  assert.equal(countdownLights(r('countdown', 1.5)), 3);
  assert.equal(countdownLights(r('countdown', 0.01)), 5);
  assert.equal(countdownLights(r('racing', 0, 0.5)), 'go');
  assert.equal(countdownLights(r('racing', 0, 0)), null);
  assert.deepEqual([3, 2.2, 1.1, 0.1].map((c) => countdownLabel(r('countdown', c))), ['3', '3', '2', '1']);
  assert.equal(countdownLabel(r('racing', 0, 0.9)), 'GO!');
  assert.equal(countdownLabel(r('racing', 0, 0)), null);
});

test('minimap fits samples inside the padded box, centered', () => {
  const samples = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 50 }, { x: 0, z: 50 }];
  const { project, path } = fitMinimap(samples, 200, 200, 10, 1);
  const pts = samples.map((p) => project(p.x, p.z));
  for (const [x, y] of pts) assert.ok(x >= 10 - 1e-9 && x <= 190 + 1e-9 && y >= 10 && y <= 190);
  assert.equal(pts[0][0], 10);
  assert.equal(pts[2][0], 190);
  assert.equal(pts[0][1] + pts[2][1], 200); // vertically centered
  assert.ok(path.startsWith('M10.0 ') && path.endsWith('Z'));
});

test('start tick is perpendicular to the heading', () => {
  const [x1, y1, x2, y2] = startTick((x, z) => [x, z], { x: 10, z: 10, h: 0 }, 5);
  assert.deepEqual([x1, x2], [10, 10]);
  assert.equal(Math.abs(y2 - y1), 10);
});

function fakeRace() {
  return {
    phase: 'racing',
    laps: 3,
    karts: [
      { id: 'a', name: 'Ada', lap: 0, place: 2, finished: false, finishTime: null, lapTimes: [] },
      { id: 'b', name: 'Bo', lap: 3, place: 1, finished: true, finishTime: 123.4, lapTimes: [45, 40, 38.4] },
    ],
  };
}

test('status payload shows the current 1-based lap, capped at the lap count', () => {
  const css = { a: '#111111', b: '#222222' };
  const s = buildStatus(fakeRace(), css);
  assert.equal(s.type, 'kart_status');
  assert.equal(s.phase, 'racing');
  assert.deepEqual(s.players.a, { lap: 1, laps: 3, place: 2, color: '#111111', finished: false });
  assert.equal(s.players.b.lap, 3);
  assert.equal(statusKey(s), statusKey(buildStatus(fakeRace(), css)));
  const moved = fakeRace();
  moved.karts[0].place = 1;
  assert.notEqual(statusKey(s), statusKey(buildStatus(moved, css)));
});

test('results are ordered by place with DNF as null time', () => {
  const race = fakeRace();
  const { type, results } = buildResults(race, { a: '#111111', b: '#222222' });
  assert.equal(type, 'kart_results');
  assert.deepEqual(results.map((r) => r.playerId), ['b', 'a']);
  assert.deepEqual(results[0], { playerId: 'b', name: 'Bo', place: 1, time: 123.4, color: '#222222', bestLap: 38.4 });
  assert.equal(results[1].time, null);
  assert.equal(results[1].bestLap, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrack } from './index.js';
import { createRace, stepRace } from '../race.js';
import { KART_RADIUS } from '../physics.js';

const track = loadTrack('coconut-coast');
const sunny = loadTrack('sunny-meadow');
const sc = track.shortcuts[0];
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const INSIDE = -6.5; // main line hugging the inside of the bend, the fastest road line
const LOOK = 16; // m of world distance the scripted driver aims ahead

// Steers toward the point `LOOK` m ahead on the lateral line `target(s)` of the main frame.
function drive(kart, target) {
  let s = kart.s;
  let tx;
  let tz;
  for (let i = 0; i < 80; i++) {
    s += 1;
    const fr = track.frameAt(s);
    const lat = target(s);
    tx = fr.x + fr.rx * lat;
    tz = fr.z + fr.rz * lat;
    if (Math.hypot(tx - kart.x, tz - kart.z) >= LOOK) break;
  }
  return { steer: Math.max(-1, Math.min(1, wrapAngle(Math.atan2(tz - kart.z, tx - kart.x) - kart.h) * 2.2)), throttle: 1 };
}

// The two main-line routes the shortcut skips: the fast inside line all the way round, or the road's center through the skipped stretch.
const mainLine = () => INSIDE;
const centerLine = (s) => (s >= sc.s0 - 4 && s <= sc.s1 ? 0 : INSIDE);
const viaShortcut = (s) => (s >= sc.s0 - 4 && s <= sc.s1 ? sc.lateralAt(s) : INSIDE);

// Three laps from the grid; reports lap times, wrong-way flags, wall contacts on the path and the surfaces seen.
function run(target, laps = 3) {
  const race = createRace(track, [{ id: 'k', color: 0xff0000, name: 'K' }]);
  race.laps = laps;
  const kart = race.karts[0];
  const seen = new Set();
  let wrongWay = false;
  let pathWalls = 0;
  let touching = false;
  for (let i = 0; i < 60 * 400 && race.phase !== 'finished'; i++) {
    stepRace(race, { k: drive(kart, target) }, 1 / 60, track);
    if (race.phase !== 'racing') continue;
    wrongWay ||= kart.wrongWay;
    const onPath = kart.s >= sc.s0 && kart.s <= sc.s1 && Math.abs(kart.lateral - sc.lateralAt(kart.s)) < sc.width / 2;
    const surf = track.surfaceAt(kart.s, kart.lateral);
    const hit =
      kart.lateral <= -(surf.limitL - KART_RADIUS) + 1e-6 ||
      (surf.fence && (Math.abs(kart.lateral - (surf.fence.lo - KART_RADIUS)) < 1e-6 || Math.abs(kart.lateral - (surf.fence.hi + KART_RADIUS)) < 1e-6));
    if (onPath) {
      seen.add(kart.surface);
      if (hit && !touching) pathWalls++;
    }
    touching = hit;
  }
  return { race, lapTimes: kart.lapTimes, wrongWay, pathWalls, seen, kart };
}

test('the shortcut leaves in palms, rejoins in sandy and is 8 m wide', () => {
  assert.equal(track.shortcuts.length, 1);
  assert.equal(sc.id, 'sand');
  assert.equal(track.frameAt(sc.s0 + 0.01).section, 'palms');
  assert.equal(track.frameAt(sc.s1 - 0.01).section, 'sandy');
  assert.ok(sc.samples.length > 100);
  for (const p of sc.samples) assert.equal(p.halfWidth, 4);
  const seg = sc.samples.slice(1).map((p, i) => Math.hypot(p.x - sc.samples[i].x, p.z - sc.samples[i].z));
  assert.ok(Math.max(...seg) < 0.51 && Math.min(...seg) > 0.45, 'evenly spaced samples');
});

test('surfaceAt says shortcut on the path and road on the main road beside it', () => {
  for (let s = sc.s0 + 20; s < sc.s1 - 15; s += 7) {
    const c = sc.lateralAt(s);
    for (const off of [-3, 0, 3]) assert.equal(track.surfaceAt(s, c + off).kind, 'shortcut', `s=${s} off=${off}`);
    assert.equal(track.surfaceAt(s, 0).kind, 'road');
    assert.equal(track.surfaceAt(s, -6).kind, 'road');
  }
  assert.equal(track.surfaceAt(sc.s0 - 40, -12).kind, 'sand', 'before it leaves the left edge is slow sand');
  assert.equal(track.surfaceAt(sc.s1 + 5, -9).kind, 'road');
});

test('the hard limit is open where the shortcut leaves and rejoins and fenced between', () => {
  const leave = sc.s0 + 6;
  const rejoin = sc.s1 - 6;
  for (const s of [leave, rejoin]) {
    const surf = track.surfaceAt(s, 0);
    assert.equal(surf.fence, null, `no fence at s=${s}`);
    for (let lat = -8; lat >= sc.lateralAt(s); lat -= 0.5) assert.notEqual(track.surfaceAt(s, lat).kind, 'wall', `lat=${lat}`);
  }
  const mid = (sc.s0 + sc.s1) / 2;
  const f = track.surfaceAt(mid, 0).fence;
  assert.ok(f && f.hi - f.lo > 1);
  assert.equal(track.surfaceAt(mid, (f.lo + f.hi) / 2).kind, 'wall');
  assert.ok(track.surfaceAt(mid, 0).limitL > -sc.lateralAt(mid), 'outer edge is beyond the path');
  assert.equal(track.surfaceAt(mid, -track.surfaceAt(mid, 0).limitL - 0.5).kind, 'wall');
});

test('project and terrainHeight stay sane on the path', () => {
  let hint = sc.s0;
  for (const p of sc.samples) {
    const q = track.project(p.x, p.z, hint);
    const g = track.project(p.x, p.z);
    assert.ok(Math.abs(q.s - g.s) < 0.05, `hinted ${q.s} vs global ${g.s}`);
    assert.ok(q.s >= hint - 0.5, 'progress only moves forward along the path');
    hint = q.s;
    assert.ok(Math.abs(track.terrainHeight(p.x, p.z) - p.y) < 0.05, 'ground is flat under the path');
    assert.ok(Math.abs(track.surfaceAt(q.s, q.lateral).y - p.y) < 0.05);
  }
  assert.ok(sc.samples.at(-1).y < 0.01 && sc.samples[0].y > 5);
});

test('a kart driven along the shortcut completes laps, never goes wrong-way and never hits a wall on the path', () => {
  const r = run(viaShortcut);
  assert.equal(r.lapTimes.length, 3, 'three counted laps');
  assert.ok(r.kart.finished);
  assert.equal(r.wrongWay, false);
  assert.equal(r.pathWalls, 0);
  assert.ok(r.seen.has('shortcut') && !r.seen.has('sand') && !r.seen.has('grass'), [...r.seen].join());
  for (const t of r.lapTimes) assert.ok(t > 30 && t < 70, `lap ${t}`);
});

test('the shortcut saves 1.0 to 1.5 s against the main line at top speed', () => {
  const short = run(viaShortcut).lapTimes;
  // Laps 2 and 3 start at speed, so they show the route difference alone. Lap times are whole frames (1/60 s): average the two.
  const saved = (route) => {
    const t = run(route).lapTimes;
    return ((t[1] - short[1]) + (t[2] - short[2])) / 2;
  };
  const inside = saved(mainLine);
  const center = saved(centerLine);
  console.log(`# saved vs inside line ${inside.toFixed(3)} s, vs road center ${center.toFixed(3)} s`);
  assert.ok(inside >= 1.0 && inside <= 1.5, `saves ${inside.toFixed(3)} s on the inside line`);
  assert.ok(center >= 1.0 && center <= 1.5, `saves ${center.toFixed(3)} s on the road center`);
});

test('the shortcut is shorter than the main line it skips', () => {
  const along = (lat) => {
    let len = 0;
    let prev = track.frameAt(sc.s0);
    for (let s = sc.s0 + 0.5; s <= sc.s1 + 1e-9; s += 0.5) {
      const a = { x: prev.x + prev.rx * lat, z: prev.z + prev.rz * lat };
      const fr = track.frameAt(s);
      len += Math.hypot(fr.x + fr.rx * lat - a.x, fr.z + fr.rz * lat - a.z);
      prev = fr;
    }
    return len;
  };
  assert.ok(sc.length < along(INSIDE) - 20, `shortcut ${sc.length.toFixed(1)} m, inside line ${along(INSIDE).toFixed(1)} m`);
  console.log(`# shortcut ${sc.length.toFixed(1)} m vs main ${along(0).toFixed(1)} m (center), ${along(INSIDE).toFixed(1)} m (inside line)`);
});

test('Sunny Meadow has no shortcut and its surfaces are unchanged', () => {
  assert.deepEqual(sunny.shortcuts, []);
  assert.ok(sunny.samples.every((p) => p.scW === 0));
  for (let s = 0; s < sunny.length; s += 13) assert.equal(sunny.surfaceAt(s, 0).fence, null);
});

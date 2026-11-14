// Acceptance tests for the Clover Meadows mechanics engine (rubric R1-R7). Test names start with "R<n>.<m>";
// score.mjs turns pass/fail per name into points. Fixtures are small inline tracks, not the Clover layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTrack, grass, hard } from '../track.js';
import { loadTrack } from '../tracks/index.js';
import { createKart, stepKart, KART_RADIUS, TOP_SPEED, BOOST_TIME } from '../physics.js';
import { createRace, stepRace } from '../race.js';
import { autopilotInput } from '../autopilot.js';

// Dynamic so a candidate without obstacles.js still scores R1-R5.
const obstaclesMod = await import('../obstacles.js').catch(() => null);

const DT = 1 / 60;
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const KART_DIR = fileURLToPath(new URL('..', import.meta.url));

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Closed loop: 400 m straight 'a' + 200 m straight 'b' (dish), U-turn, 600 m back, U-turn. 20 m road, grass runoff.
function fixture({ dish = 0, patches = [], ramps = [], obstacles = [], shortcuts, edges } = {}) {
  const side = edges ?? { left: grass(12), right: grass(12) };
  const w = 20;
  return buildTrack({
    id: 'fixture',
    name: 'Fixture',
    pieces: [
      { tag: 'a', kind: 'straight', length: 400, width: w, ...side },
      { tag: 'b', kind: 'straight', length: 200, width: w, dish, ...side },
      { tag: 'c', kind: 'arc', turn: 'right', angle: 180, radius: 60, width: w, left: grass(12), right: grass(12) },
      { tag: 'd', kind: 'straight', length: 600, width: w, left: grass(12), right: grass(12) },
      { tag: 'e', kind: 'arc', turn: 'right', angle: 180, radius: 60, width: w, left: grass(12), right: grass(12) },
    ],
    elevation: { points: [] },
    boostPads: [],
    itemRows: [],
    ramps,
    patches,
    obstacles,
    shortcuts,
    grid: { cols: 2, colGap: 8, rowGap: 8 },
  });
}

function placeKart(kart, track, s, lateral = 0, speed = 0) {
  const fr = track.frameAt(s);
  Object.assign(kart, {
    s,
    lateral,
    x: fr.x + fr.rx * lateral,
    y: track.heightAt(s, lateral),
    z: fr.z + fr.rz * lateral,
    h: fr.h,
    speed,
    vx: Math.cos(fr.h) * speed,
    vz: Math.sin(fr.h) * speed,
    surface: track.surfaceAt(s, lateral).kind,
  });
  return kart;
}

function kartOn(track, s, lateral = 0, speed = 0) {
  return placeKart(createKart({ id: 'k', color: 1 }), track, s, lateral, speed);
}

// Steps a kart `seconds` with a constant input, returning the per-step trace.
function drive(track, kart, input, seconds) {
  const trace = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepKart(kart, input, DT, track);
    trace.push({ s: kart.s, lateral: kart.lateral, speed: kart.speed, h: kart.h, surface: kart.surface, airborne: kart.airborne, y: kart.y, boost: kart.boost, x: kart.x, z: kart.z });
  }
  return trace;
}

const slipAngle = (k) => Math.abs(wrapAngle(Math.atan2(k.vz, k.vx) - k.h));

// ── R1 No regressions ────────────────────────────────────────────────────────

// Solo autopilot lap 1 times recorded on base commit c42a427 before any change.
const BASE_LAP = { 'sunny-meadow': 36.883333333332466, 'coconut-coast': 50.833333333331666 };

function firstLapTime(id) {
  const track = loadTrack(id);
  const race = createRace(track, [{ id: 'a', color: 1, name: 'A' }]);
  let guard = 0;
  while (race.karts[0].lapTimes.length < 1 && guard++ < 60 * 400) {
    stepRace(race, { a: autopilotInput(track, race.karts[0]) }, DT, track);
  }
  return race.karts[0].lapTimes[0];
}

test('R1.1 Sunny Meadow autopilot lap time within 1% of base', () => {
  const t = firstLapTime('sunny-meadow');
  assert.ok(Math.abs(t - BASE_LAP['sunny-meadow']) / BASE_LAP['sunny-meadow'] <= 0.01, `lap ${t} vs ${BASE_LAP['sunny-meadow']}`);
});

test('R1.2 Coconut Coast autopilot lap time within 1% of base', () => {
  const t = firstLapTime('coconut-coast');
  assert.ok(Math.abs(t - BASE_LAP['coconut-coast']) / BASE_LAP['coconut-coast'] <= 0.01, `lap ${t} vs ${BASE_LAP['coconut-coast']}`);
});

// The pre-existing kart tests (as of the base commit), run in a child process.
const EXISTING = ['cup', 'hud', 'itemModels', 'items', 'physics', 'race', 'shells', 'track', 'scene/itemsView', 'scene/views', 'tracks/coconutCoast', 'tracks/shortcut'].map(
  (n) => `${KART_DIR}${n}.test.mjs`,
);

test('R1.3 every pre-existing kart test passes', () => {
  try {
    execFileSync(process.execPath, ['--test', ...EXISTING], { stdio: 'pipe', timeout: 240000 });
  } catch (e) {
    assert.fail(`existing kart tests failed:\n${String(e.stdout).split('\n').filter((l) => /^# (pass|fail)|not ok/.test(l)).join('\n')}`);
  }
});

// ── R2 Dish ──────────────────────────────────────────────────────────────────

const DISH = 1;
const dished = fixture({ dish: DISH });
const flat = fixture();
const HW = 10;
const MID_B = 500; // middle of the dished piece (400..600), beyond the 20 m blends

test('R2.1 dish: centre is `dish` below both edges, surfaceAt().y agrees', () => {
  for (const s of [470, 500, 530]) {
    const c = dished.heightAt(s, 0);
    for (const edgeLat of [HW, -HW]) {
      const d = dished.heightAt(s, edgeLat) - c;
      assert.ok(Math.abs(d - DISH) < 0.01, `s=${s} depth ${d}`);
    }
    assert.ok(Math.abs(dished.surfaceAt(s, 0).y - c) < 1e-6);
    assert.ok(Math.abs(dished.surfaceAt(s, 3).y - dished.heightAt(s, 3)) < 1e-6);
    // outside the road the offset is 0
    assert.ok(Math.abs(dished.heightAt(s, HW + 0.5) - dished.heightAt(s, HW)) < 0.01);
  }
});

test('R2.2 dish profile is parabolic (quarter-width point 0.75 dish below the edge)', () => {
  for (const lat of [HW / 2, -HW / 2]) {
    const below = dished.heightAt(MID_B, HW) - dished.heightAt(MID_B, lat);
    assert.ok(Math.abs(below - 0.75 * DISH) <= 0.05 * 0.75 * DISH, `lat ${lat}: ${below}`);
  }
});

test('R2.3 dish normal lateral slope matches the numeric derivative', () => {
  const fr = dished.frameAt(MID_B);
  for (const lat of [4, -6, 8]) {
    const e = 0.01;
    const numeric = (dished.heightAt(MID_B, lat + e) - dished.heightAt(MID_B, lat - e)) / (2 * e);
    const n = dished.surfaceAt(MID_B, lat);
    const analytic = -(n.nx * fr.rx + n.nz * fr.rz) / n.ny;
    assert.ok(Math.abs(numeric) > 0.03, `numeric slope ${numeric} (dish missing?)`);
    assert.ok(Math.abs(analytic - numeric) <= 0.05 * Math.abs(numeric), `lat ${lat}: normal slope ${analytic} vs numeric ${numeric}`);
  }
});

test('R2.4 dish blends in and out without jumps', () => {
  const depth = (s) => dished.heightAt(s, HW) - dished.heightAt(s, 0);
  assert.ok(depth(300) < 0.01, 'no dish well before the piece');
  assert.ok(depth(MID_B) > DISH - 0.01, 'no dish in the piece');
  let prev = depth(360);
  for (let s = 360.5; s <= 640; s += 0.5) {
    const d = depth(s);
    assert.ok(Math.abs(d - prev) <= 0.15, `depth jumps ${prev} -> ${d} at s=${s}`);
    prev = d;
  }
  assert.ok(depth(640) < 0.01, 'no dish after the piece');
});

// Autopilot kart through 'b'. Returns time spent between s=380 and s=600 and the worst y error.
function passDish(track) {
  const kart = kartOn(track, 20, 0, 0);
  let t = 0;
  let tIn = null;
  let tOut = null;
  let worst = 0;
  while (tOut == null && t < 60) {
    stepKart(kart, autopilotInput(track, kart), DT, track);
    t += DT;
    if (tIn == null && kart.s >= 380) tIn = t;
    if (kart.s >= 600) tOut = t;
    if (kart.s >= 400 && kart.s <= 600) worst = Math.max(worst, Math.abs(kart.y - track.heightAt(kart.s, kart.lateral)), kart.airborne ? 99 : 0);
  }
  return { time: tOut - tIn, worst };
}

test('R2.5 autopilot through a dished piece stays on the surface with no extra slowdown', () => {
  const a = passDish(dished);
  const b = passDish(flat);
  assert.ok(a.worst < 0.02, `y off surface by ${a.worst}`);
  assert.ok(a.time <= b.time * 1.02, `dished ${a.time} vs flat ${b.time}`);
});

// ── R3 Patches ───────────────────────────────────────────────────────────────

const PATCH_DEFS = [
  { id: 'g1', kind: 'grass', piece: 'a', at: 120, lateral: 0, length: 60, width: 12, seed: 7 },
  { id: 'm1', kind: 'mud', piece: 'a', at: 300, lateral: 0, length: 60, width: 12, seed: 3 },
];
const patched = fixture({ patches: PATCH_DEFS });
const pt = (patch, def, r, theta) => ({ s: patch.s + Math.cos(theta) * r * (def.length / 2), lateral: def.lateral + Math.sin(theta) * r * (def.width / 2) });
const ANGLES = Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2);

test('R3.1 patches: resolved s, hit inside the 70% inner ellipse (patchAt and surfaceAt kind)', () => {
  assert.equal(patched.patches.length, 2);
  for (const def of PATCH_DEFS) {
    const patch = patched.patches.find((p) => p.id === def.id);
    assert.ok(Math.abs(patch.s - def.at) < 0.5, `resolved s ${patch.s}`);
    for (const r of [0, 0.4, 0.69]) {
      for (const th of ANGLES) {
        const p = pt(patch, def, r, th);
        assert.equal(patched.patchAt(p.s, p.lateral)?.id, def.id, `${def.id} r=${r} th=${th} patchAt`);
        assert.equal(patched.surfaceAt(p.s, p.lateral).kind, def.kind, `${def.id} r=${r} th=${th} kind`);
      }
    }
  }
});

test('R3.2 patches: miss outside 125%', () => {
  for (const def of PATCH_DEFS) {
    const patch = patched.patches.find((p) => p.id === def.id);
    for (const th of ANGLES) {
      const p = pt(patch, def, 1.27, th);
      assert.equal(patched.patchAt(p.s, p.lateral), null, `${def.id} th=${th} patchAt`);
      if (Math.abs(p.lateral) < HW - 0.1) assert.equal(patched.surfaceAt(p.s, p.lateral).kind, 'road', `${def.id} th=${th} kind`);
    }
  }
});

// Boundary radius (normalised) along each angle, found by bisection between the guaranteed hit and miss radii.
function boundary(track, def) {
  const patch = track.patches.find((p) => p.id === def.id);
  return ANGLES.map((th) => {
    let lo = 0.69;
    let hi = 1.27;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const p = pt(patch, def, mid, th);
      if (track.patchAt(p.s, p.lateral)) lo = mid;
      else hi = mid;
    }
    return lo;
  });
}

test('R3.3 patch boundary is irregular (radius varies >= 10%) and within 70-125%', () => {
  for (const def of PATCH_DEFS) {
    const r = boundary(patched, def);
    const mean = r.reduce((a, b) => a + b) / r.length;
    assert.ok((Math.max(...r) - Math.min(...r)) / mean >= 0.1, `${def.id} spread ${(Math.max(...r) - Math.min(...r)) / mean}`);
    assert.ok(Math.min(...r) >= 0.69 && Math.max(...r) <= 1.26, `${def.id} range ${Math.min(...r)}..${Math.max(...r)}`);
  }
});

test('R3.4 patch boundary is deterministic per seed and differs between seeds', () => {
  const def = PATCH_DEFS[0];
  const again = fixture({ patches: PATCH_DEFS });
  assert.deepEqual(boundary(again, def), boundary(patched, def));
  const other = fixture({ patches: [{ ...def, seed: 99 }] });
  const a = boundary(patched, def);
  const b = boundary(other, def);
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 0.01), 'seed has no effect');
});

test('R3.5 grass patch drops top speed like grass runoff', () => {
  const track = fixture({ patches: [{ id: 'big', kind: 'grass', piece: 'a', at: 250, lateral: 0, length: 400, width: 18, seed: 1 }] });
  const onPatch = kartOn(track, 120, 0, 20);
  const onRunoff = kartOn(track, 120, 15, 20);
  assert.equal(onPatch.surface, 'grass');
  const a = drive(track, onPatch, { steer: 0 }, 4);
  const b = drive(track, onRunoff, { steer: 0 }, 4);
  assert.ok(a.every((t) => t.surface === 'grass') && b.every((t) => t.surface === 'grass'));
  assert.ok(onRunoff.speed < 0.6 * TOP_SPEED, `runoff speed ${onRunoff.speed}`);
  assert.ok(Math.abs(onPatch.speed - onRunoff.speed) <= 0.05 * onRunoff.speed, `patch ${onPatch.speed} vs runoff ${onRunoff.speed}`);
});

test('R3.6 patches never override walls or shortcuts', () => {
  const walled = fixture({
    edges: { left: hard(), right: hard() },
    patches: [{ id: 'w', kind: 'mud', piece: 'a', at: 200, lateral: 8, length: 60, width: 14, seed: 2 }],
  });
  const wp = walled.patches[0];
  assert.equal(walled.surfaceAt(wp.s, 8).kind, 'mud', 'patch works on the road');
  assert.equal(walled.surfaceAt(wp.s, 11).kind, 'wall', 'wall beyond the road edge stays a wall');
  const sc = fixture({
    shortcuts: [{ id: 'sc', width: 8, profile: [{ piece: 'a', at: 100, lateral: -18 }, { piece: 'a', at: 300, lateral: -18 }] }],
    patches: [{ id: 's', kind: 'grass', piece: 'a', at: 200, lateral: -16, length: 60, width: 14, seed: 2 }],
  });
  const sp = sc.patches[0];
  assert.equal(sc.surfaceAt(sp.s, -18).kind, 'shortcut', 'shortcut stays a shortcut');
  assert.equal(sc.surfaceAt(sp.s, -12).kind, 'wall', 'fence stays a wall');
});

// ── R4 Mud ───────────────────────────────────────────────────────────────────

const MUD = { id: 'mud', kind: 'mud', piece: 'a', at: 330, lateral: 0, length: 500, width: 28, seed: 1 };
const muddy = fixture({ patches: [MUD] });
const plain = fixture();

test('R4.1 mud top speed is at least 0.85 x road top speed', () => {
  const m = kartOn(muddy, 180, 0, 18);
  const r = kartOn(plain, 180, 0, 18);
  const tm = drive(muddy, m, { steer: 0 }, 4);
  drive(plain, r, { steer: 0 }, 4);
  assert.ok(tm.every((t) => t.surface === 'mud'), 'kart left the mud');
  assert.ok(m.speed >= 0.85 * r.speed, `mud ${m.speed} vs road ${r.speed}`);
});

function fullSteer(track, seconds = 1) {
  const kart = kartOn(track, 200, -6, 18);
  const h0 = kart.h;
  const trace = drive(track, kart, { steer: 1, throttle: 1 }, seconds);
  return { kart, trace, turned: Math.abs(wrapAngle(kart.h - h0)), slip: slipAngle(kart) };
}

test('R4.2 mud: heading change under full steer is at most 0.6 x road', () => {
  const m = fullSteer(muddy);
  const r = fullSteer(plain);
  assert.ok(m.trace.every((t) => t.surface === 'mud'), 'kart left the mud');
  assert.ok(m.turned <= 0.6 * r.turned, `mud ${m.turned} vs road ${r.turned}`);
});

test('R4.3 mud: lateral slip under full steer is at least 2 x road', () => {
  const m = fullSteer(muddy);
  const r = fullSteer(plain);
  assert.ok(m.trace.every((t) => t.surface === 'mud'), 'kart left the mud');
  assert.ok(m.slip >= 2 * r.slip, `mud ${m.slip} vs road ${r.slip}`);
});

test('R4.4 drift charge does not build on mud', () => {
  const road = kartOn(plain, 200, -6, 18);
  drive(plain, road, { steer: 1, throttle: 1, drift: true }, 1.5);
  assert.ok(road.drift.charge > 1, `sanity: road charge ${road.drift.charge}`);
  const mud = kartOn(muddy, 200, -6, 18);
  const tr = drive(muddy, mud, { steer: 1, throttle: 1, drift: true }, 1.5);
  assert.ok(tr.every((t) => t.surface === 'mud'), 'kart left the mud');
  assert.ok(mud.drift.charge < 1e-6 && mud.drift.level === 0, `mud charge ${mud.drift.charge} level ${mud.drift.level}`);
});

// ── R5 Ramps ─────────────────────────────────────────────────────────────────

const RAMP = { piece: 'a', at: 150, lateral: 0, length: 8, width: 6 };
const GRASS_UNDER = { id: 'under', kind: 'grass', piece: 'a', at: 190, lateral: 0, length: 80, width: 20, seed: 4 };
const rampTrack = fixture({ ramps: [RAMP] });
const rampOverGrass = fixture({ ramps: [RAMP], patches: [GRASS_UNDER] });

// Drives from 12 m before the ramp at ~20 m/s until shortly after the kart lands; records the flight.
function jump(track, speed = 20, seconds = 6) {
  const kart = kartOn(track, 138, 0, speed);
  const out = { takeoff: null, landing: null, trace: [], maxBoost: 0 };
  let prevAir = false;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepKart(kart, { steer: 0 }, DT, track);
    const row = { s: kart.s, y: kart.y, surf: track.heightAt(kart.s, kart.lateral), airborne: kart.airborne, speed: kart.speed, boost: kart.boost, vy: kart.vy, x: kart.x, z: kart.z, i };
    out.trace.push(row);
    if (kart.airborne && !prevAir && !out.takeoff) out.takeoff = row;
    if (out.takeoff && !out.landing) out.maxBoost = Math.max(out.maxBoost, kart.boost);
    if (!kart.airborne && prevAir && !out.landing) out.landing = row;
    if (out.landing && i > out.landing.i + 18) break;
    prevAir = kart.airborne;
  }
  return out;
}

test('R5.1 a kart at 20 m/s crossing a ramp goes airborne above the surface', () => {
  const j = jump(rampTrack);
  assert.ok(j.takeoff, 'never airborne');
  const peak = Math.max(...j.trace.filter((r) => r.airborne).map((r) => r.y - r.surf));
  assert.ok(peak > 0.3, `peak height above surface ${peak}`);
  assert.ok(j.takeoff.vy > 0, `vy at takeoff ${j.takeoff.vy}`);
});

test('R5.2 ramp jump at 20 m/s clears 14 to 40 m of ground', () => {
  const j = jump(rampTrack);
  assert.ok(j.takeoff && j.landing, 'no takeoff or landing');
  const d = Math.hypot(j.landing.x - j.takeoff.x, j.landing.z - j.takeoff.z);
  assert.ok(d >= 14 && d <= 40, `flight distance ${d}`);
});

test('R5.3 a ramp grants a pad boost', () => {
  const j = jump(rampTrack);
  assert.ok(j.takeoff, 'never airborne');
  assert.ok(j.maxBoost >= BOOST_TIME - 0.3, `max boost ${j.maxBoost}`);
});

test('R5.4 a grass patch under the flight does not slow the kart', () => {
  const j = jump(rampOverGrass);
  assert.ok(j.takeoff && j.landing, 'no takeoff or landing');
  assert.ok(j.landing.speed >= j.takeoff.speed * 0.97, `landing ${j.landing.speed} vs takeoff ${j.takeoff.speed}`);
  const air = j.trace.filter((r) => r.airborne);
  assert.ok(air.every((r) => r.speed >= j.takeoff.speed * 0.97), 'slowed in the air');
});

test('R5.5 landing is smooth: never below the surface, airborne clears, y settles on the surface', () => {
  const j = jump(rampTrack);
  assert.ok(j.takeoff && j.landing, 'no takeoff or landing');
  for (const r of j.trace) assert.ok(r.y >= r.surf - 1e-6, `y ${r.y} below surface ${r.surf} at s=${r.s}`);
  const after = j.trace.slice(j.landing.i);
  assert.ok(after.every((r) => !r.airborne), 'airborne again right after landing');
  assert.ok(Math.abs(after.at(-1).y - after.at(-1).surf) < 0.05);
  for (let i = 1; i < j.trace.length; i++) assert.ok(Math.abs(j.trace[i].y - j.trace[i - 1].y) < 1.0, 'y teleports');
});

test('R5.6 below 8 m/s a ramp does not launch', () => {
  const kart = kartOn(rampTrack, 143, 0, 7.9);
  const tr = drive(rampTrack, kart, { steer: 0, throttle: 0 }, 3);
  assert.ok(tr.every((t) => !t.airborne), 'launched at low speed');
  assert.ok(tr.some((t) => t.s > 146), 'sanity: kart reached the ramp');
});

// ── R6 / R7 Obstacles ────────────────────────────────────────────────────────

const COW_STATIC = { id: 'cowS', kind: 'cow', piece: 'a', at: 250, from: 0, to: 0, period: 6, phase: 0 };
const COW_MOVING = { id: 'cowM', kind: 'cow', piece: 'a', at: 250, from: -8, to: 8, period: 8, phase: 0 };
const COW_PAUSE = { id: 'cowP', kind: 'cow', piece: 'a', at: 250, from: -8, to: 8, period: 8, phase: 0, pause: 1 };
const COW_PHASED = { ...COW_MOVING, id: 'cowQ', phase: 1.3 };
const GATE = { id: 'gate', kind: 'blades', piece: 'a', at: 250, period: 5, phase: 0.7, blockFraction: 0.4 };

const cowTrack = fixture({ obstacles: [COW_STATIC] });
const movingTrack = fixture({ obstacles: [COW_MOVING] });
const pauseTrack = fixture({ obstacles: [COW_PAUSE, COW_PHASED] });
const gateTrack = fixture({ obstacles: [GATE] });
const get = (track, id, t) => track.obstaclesAt(t).find((o) => o.id === id);
const times = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

test('R6.1 obstaclesAt is deterministic, matches the road frame, stays within from/to, repeats each period', () => {
  const ts = times(0, 24, 0.37);
  const first = ts.map((t) => pauseTrack.obstaclesAt(t));
  const reversed = [...ts].reverse().map((t) => pauseTrack.obstaclesAt(t)).reverse();
  assert.deepEqual(first, reversed, 'depends on query order');
  assert.deepEqual(first, ts.map((t) => pauseTrack.obstaclesAt(t)), 'not repeatable');
  for (const t of ts) {
    const c = get(pauseTrack, 'cowP', t);
    assert.ok(c.lateral >= -8 - 1e-6 && c.lateral <= 8 + 1e-6, `lateral ${c.lateral} at t=${t}`);
    assert.ok(Math.abs(c.s - 250) < 0.5 && c.radius > 0);
    const fr = pauseTrack.frameAt(c.s);
    assert.ok(Math.hypot(c.x - (fr.x + fr.rx * c.lateral), c.z - (fr.z + fr.rz * c.lateral)) < 0.05, 'x,z disagree with s,lateral');
    assert.ok(Math.abs(get(pauseTrack, 'cowP', t + 8).lateral - c.lateral) < 1e-6, 'does not repeat after one period');
  }
  assert.ok(ts.some((t) => Math.abs(get(pauseTrack, 'cowP', t).lateral - get(pauseTrack, 'cowQ', t).lateral) > 0.5), 'phase has no effect');
});

test('R6.2 a cow walks between from and to and idles `pause` s at each end; no pause means no idling', () => {
  const dt = 0.01;
  const lat = times(0, 8, dt).map((t) => get(pauseTrack, 'cowP', t).lateral);
  const atEnd = lat.filter((l) => Math.abs(Math.abs(l) - 8) < 1e-6).length * dt;
  assert.ok(Math.min(...lat) < -7.9 && Math.max(...lat) > 7.9, 'does not reach both ends');
  assert.ok(lat.some((l) => Math.abs(l) < 1), 'does not cross the middle');
  assert.ok(atEnd >= 1.8, `idle at ends ${atEnd}s per period, want >= 2 x pause`);
  assert.ok(atEnd <= 8 * 0.8, 'never moves');
  const free = times(0, 8, dt).map((t) => get(movingTrack, 'cowM', t).lateral);
  assert.ok(free.filter((l) => Math.abs(Math.abs(l) - 8) < 1e-6).length * dt < 0.4, 'idles without a pause');
});

test('R6.3 a static cow (from === to) does not move', () => {
  const c0 = get(cowTrack, 'cowS', 0);
  for (const t of times(0, 20, 0.5)) {
    const c = get(cowTrack, 'cowS', t);
    assert.ok(Math.hypot(c.x - c0.x, c.z - c0.z) < 1e-9 && Math.abs(c.lateral - c0.lateral) < 1e-9 && Math.abs(c.s - c0.s) < 1e-9);
  }
});

test('R6.4 blade gate: blocking fraction equals blockFraction +/- 0.02, repeats each period', () => {
  const ts = times(0, 5, 0.005).slice(0, -1);
  const frac = ts.filter((t) => get(gateTrack, 'gate', t).blocking).length / ts.length;
  assert.ok(Math.abs(frac - 0.4) <= 0.02, `blocking fraction ${frac}`);
  for (const t of times(0.1, 12, 0.13)) {
    assert.equal(get(gateTrack, 'gate', t).blocking, get(gateTrack, 'gate', t + 5).blocking, `period at t=${t}`);
  }
  const angles = times(0, 5, 0.25).map((t) => get(gateTrack, 'gate', t).angle);
  assert.ok(angles.every(Number.isFinite) && new Set(angles.map((a) => a.toFixed(3))).size > 3, 'blade angle does not rotate');
});

// ── Obstacle collision runs ──

function startRace(track) {
  const race = createRace(track, [{ id: 'a', color: 1, name: 'A' }]);
  let g = 0;
  while (race.phase === 'countdown' && g++ < 400) stepRace(race, {}, DT, track);
  return race;
}

// Runs a kart straight at obstacle `id` from `gap` m before it at 20 m/s, starting at race time `time0`.
// With `avoid`, once the speed collapses (a hit registered) the kart steers around at lateral 6.
function ram(track, { id, time0, seconds = 5, avoid = false, gap = 22 }) {
  const race = startRace(track);
  const kart = race.karts[0];
  const o0 = get(track, id, time0);
  placeKart(kart, track, o0.s - gap, 0, 20);
  race.time = time0;
  const trace = [];
  let v0 = null;
  let hitAt = null;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const px = kart.x;
    const pz = kart.z;
    const input = avoid && hitAt != null ? { ...autopilotInput(track, kart, { lateral: 6 }), throttle: 1 } : { steer: 0, throttle: 1 };
    stepRace(race, { a: input }, DT, track);
    const o = get(track, id, race.time);
    const row = { t: race.time, s: kart.s, lateral: kart.lateral, speed: kart.speed, x: kart.x, z: kart.z, step: Math.hypot(kart.x - px, kart.z - pz), o };
    row.dist = Math.hypot(kart.x - o.x, kart.z - o.z);
    trace.push(row);
    if (v0 == null && (o.kind === 'blades' ? o.s - kart.s <= 2.5 : row.dist <= KART_RADIUS + o.radius + 1)) v0 = { i, speed: kart.speed };
    if (v0 && hitAt == null && kart.speed < 0.9 * v0.speed) hitAt = i;
  }
  return { trace, v0, hitAt };
}

// First time >= from at which `pred` holds for the obstacle `id`.
const firstTime = (track, id, from, pred) => times(from, from + 40, 0.005).find((t) => pred(get(track, id, t)));
// [start, end] of the first closed (or open) stretch of the gate starting at or after `from`.
function gateWindow(closed, from) {
  const on = (t) => get(gateTrack, 'gate', t).blocking === closed;
  const a = times(from, from + 20, 0.005).find((t) => on(t) && !on(t - 0.005));
  const b = times(a, a + 10, 0.005).find((t) => !on(t));
  return [a, b];
}

const ARRIVE = 0.95; // s the kart needs to cover the 22 m gap
const minSpeedAfter = (run, steps = 40) => Math.min(...run.trace.slice(run.v0.i, run.v0.i + steps).map((r) => r.speed));
const overlaps = (run) => run.trace.filter((r) => r.dist < KART_RADIUS + r.o.radius - 0.1).length;

const memo = {};
const cache = (k, f) => (memo[k] ??= f());
const staticCow = () => cache('static', () => ram(cowTrack, { id: 'cowS', time0: 1 }));
const movingCow = () =>
  cache('moving', () => {
    const tCross = firstTime(movingTrack, 'cowM', 1.5, (o) => Math.abs(o.lateral) < 0.2);
    return ram(movingTrack, { id: 'cowM', time0: tCross - ARRIVE });
  });
const closedGate = () =>
  cache('closed', () => {
    const [a, b] = gateWindow(true, 1.5);
    return ram(gateTrack, { id: 'gate', time0: (a + b) / 2 - ARRIVE });
  });
const openGate = () =>
  cache('open', () => {
    const [a, b] = gateWindow(false, 1.5);
    return ram(gateTrack, { id: 'gate', time0: (a + b) / 2 - 0.2 - ARRIVE, seconds: 1.8 });
  });

function assertHitHard(run, what) {
  assert.ok(run.v0, `${what}: kart never reached the obstacle`);
  assert.ok(minSpeedAfter(run) <= 0.5 * run.v0.speed, `${what}: speed ${run.v0.speed} -> min ${minSpeedAfter(run)}`);
}

test('R6.5 kart rammed into a static cow loses >= 50% speed and never overlaps it', () => {
  assert.ok(obstaclesMod?.collideObstacles, 'obstacles.js does not export collideObstacles');
  const run = staticCow();
  assertHitHard(run, 'static cow');
  assert.equal(overlaps(run), 0, 'kart overlaps the cow at the end of a step');
});

test('R6.6 kart rammed into a walking cow loses >= 50% speed and never overlaps it', () => {
  assert.ok(obstaclesMod?.collideObstacles, 'obstacles.js does not export collideObstacles');
  const run = movingCow();
  assertHitHard(run, 'moving cow');
  assert.equal(overlaps(run), 0, 'kart overlaps the cow at the end of a step');
});

test('R6.7 a closed blade gate stops the kart (>= 50% speed lost) and is never passed while closed', () => {
  assert.ok(obstaclesMod?.collideObstacles, 'obstacles.js does not export collideObstacles');
  const run = closedGate();
  assertHitHard(run, 'closed gate');
  const gs = run.trace[0].o.s;
  for (let i = 1; i < run.trace.length; i++) {
    const r = run.trace[i];
    if (r.o.blocking && run.trace[i - 1].s < gs) assert.ok(r.s <= gs + 0.25, `kart at s=${r.s} past closed gate s=${gs} at t=${r.t}`);
  }
});

test('R6.8 a kart reaching an open gate passes untouched', () => {
  assert.ok(obstaclesMod?.collideObstacles, 'obstacles.js does not export collideObstacles');
  const run = openGate();
  const gs = run.trace[0].o.s;
  assert.ok(run.trace.at(-1).s > gs + 3, `kart stopped at s=${run.trace.at(-1).s}, gate ${gs}`);
  assert.ok(Math.min(...run.trace.map((r) => r.speed)) >= 0.97 * 20, `speed dipped to ${Math.min(...run.trace.map((r) => r.speed))}`);
});

// ── R7 Feel ──

// After the hit registered the kart is back at >= 60% top speed within 2.5 s of the contact, with no second hit.
function assertRecovers(run, what) {
  assert.ok(run.hitAt != null, `${what}: no hit registered`);
  const t0 = run.trace[run.hitAt].t;
  const post = run.trace.filter((r, i) => i >= run.hitAt && r.t <= t0 + 2.5);
  const iMin = post.reduce((m, r, i) => (r.speed < post[m].speed ? i : m), 0);
  assert.ok(post.slice(iMin).some((r) => r.speed >= 0.6 * TOP_SPEED), `${what}: best speed within 2.5 s is ${Math.max(...post.slice(iMin).map((r) => r.speed))}`);
  for (let i = iMin + 1; i < post.length; i++) {
    const p = post[i - 1].speed;
    assert.ok(p < 2 || (p - post[i].speed) / p < 0.2, `${what}: second hit at t=${post[i].t} (${p} -> ${post[i].speed})`);
  }
}

test('R7.1 after hitting a cow the kart is driving again within 2.5 s and is not re-hit', () => {
  assertRecovers(ram(cowTrack, { id: 'cowS', time0: 1, seconds: 6, avoid: true }), 'static cow');
});

test('R7.2 after hitting a closed gate the kart is driving again within 2.5 s and is not re-hit', () => {
  const [, b] = gateWindow(true, 1.5);
  assertRecovers(ram(gateTrack, { id: 'gate', time0: b - 0.05 - ARRIVE, seconds: 6, avoid: true }), 'closed gate');
});

test('R7.3 collision response is continuous: no step moves the kart more than 2 m', () => {
  const runs = [staticCow(), movingCow(), closedGate(), ram(cowTrack, { id: 'cowS', time0: 1, seconds: 6, avoid: true })];
  for (const run of runs) {
    assert.ok(run.v0, 'kart never reached the obstacle');
    assert.ok(Math.max(...run.trace.map((r) => r.step)) <= 2, `max step ${Math.max(...run.trace.map((r) => r.step))} m`);
  }
});

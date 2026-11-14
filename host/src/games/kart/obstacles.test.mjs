// Review-fix regressions: gate vs bypass, airborne karts, mud slides, patch wrap, ground look edits, windmill sail/gate sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, grass } from './track.js';
import { loadTrack } from './tracks/index.js';
import { createKart, stepKart } from './physics.js';
import { createRace } from './race.js';
import { collideObstacles, bladeState, cowPose } from './obstacles.js';
import { applyLook, FRAG_BODY } from './scene/ground.js';
import { LOOK } from './scene/clover/world.js';
import { HUB_RISE, ARCH_HALF } from './scene/clover/windmill.js';

const DT = 1 / 60;
const side = { left: grass(12), right: grass(12) };
const GATE = { id: 'gate', kind: 'blades', piece: 'a', at: 250, period: 5, phase: 0.7, blockFraction: 0.4 }; // closed at t = 0
const MUD = { id: 'mud', kind: 'mud', piece: 'a', at: 330, lateral: 0, length: 200, width: 28, seed: 1 };
const WRAP = { id: 'wrap', kind: 'grass', piece: 'a', at: 5, lateral: 0, length: 30, width: 12, seed: 4 };

const fixture = (extra = {}) =>
  buildTrack({
    id: 'fixture',
    name: 'Fixture',
    pieces: [
      { tag: 'a', kind: 'straight', length: 400, width: 20, ...side },
      { tag: 'c', kind: 'arc', turn: 'right', angle: 180, radius: 60, width: 20, ...side },
      { tag: 'd', kind: 'straight', length: 400, width: 20, ...side },
      { tag: 'e', kind: 'arc', turn: 'right', angle: 180, radius: 60, width: 20, ...side },
    ],
    elevation: { points: [] },
    boostPads: [],
    itemRows: [],
    grid: { cols: 2, colGap: 8, rowGap: 8 },
    ...extra,
  });

function kartOn(track, s, lateral, speed) {
  const k = createKart({ id: 'k', color: 1 });
  const fr = track.frameAt(s);
  Object.assign(k, {
    s, lateral, x: fr.x + fr.rx * lateral, y: track.heightAt(s, lateral), z: fr.z + fr.rz * lateral, h: fr.h, speed,
    vx: Math.cos(fr.h) * speed, vz: Math.sin(fr.h) * speed, surface: track.surfaceAt(s, lateral).kind,
  });
  return k;
}

function gateRace(track, kart) {
  const race = createRace(track, [{ id: 'a', color: 1, name: 'A' }]);
  race.karts[0] = kart;
  race.time = 0;
  return race;
}

test('bypass kart passes a closed gate untouched; a main-line kart (airborne or not) is stopped', () => {
  const track = fixture({ obstacles: [GATE] });
  assert.ok(bladeState(GATE, 0).blocking);
  const bypass = kartOn(track, 249.8, -30, 20);
  collideObstacles(gateRace(track, bypass), track);
  assert.equal(bypass.speed, 20);
  for (const airborne of [false, true]) {
    const main = kartOn(track, 249.8, 0, 20);
    main.airborne = airborne;
    collideObstacles(gateRace(track, main), track);
    assert.ok(main.speed <= 10, `airborne=${airborne} speed ${main.speed}`);
  }
});

test('an airborne kart that comes to a stop still lands', () => {
  const track = fixture();
  const k = kartOn(track, 100, 0, 0);
  Object.assign(k, { airborne: true, air: { dist: 0, len: 20, peak: 1.6 } });
  for (let i = 0; i < 10 * 60 && k.airborne; i++) stepKart(k, { steer: 0, throttle: 0 }, DT, track);
  assert.equal(k.airborne, false);
});

test('a kart already sliding loses the slide on entering mud and gets no boost', () => {
  const track = fixture({ patches: [MUD] });
  const k = kartOn(track, 100, 0, 20);
  for (let i = 0; i < 30; i++) stepKart(k, { steer: 0.35, throttle: 1, drift: true }, DT, track);
  assert.ok(k.drift.sliding && k.surface === 'road', 'not sliding on the road');
  const into = kartOn(track, 330, 0, 20); // same slide, now over certain mud
  into.drift = k.drift;
  into.h = k.h;
  stepKart(into, { steer: 0.35, throttle: 1, drift: true }, DT, track);
  assert.equal(into.surface, 'mud');
  assert.equal(into.drift.sliding, false);
  assert.equal(into.drift.level, 0);
  assert.equal(into.boost, 0);
  for (let i = 0; i < 60; i++) stepKart(into, { steer: 0.35, throttle: 1, drift: true }, DT, track);
  assert.equal(into.drift.sliding, false, 'restarted a slide in mud');
});

test('patchAt wraps across s = 0', () => {
  const track = fixture({ patches: [WRAP] });
  for (const s of [track.length - 4, track.length - 1, 0.5, 12]) assert.equal(track.patchAt(s, 0)?.id, 'wrap', `s=${s}`);
  assert.equal(track.patchAt(track.length - 40, 0), null);
});

test('ground look edits each match the shared shader exactly once', () => {
  const out = applyLook(FRAG_BODY, LOOK);
  assert.notEqual(out, FRAG_BODY);
  assert.equal(applyLook(FRAG_BODY, null), FRAG_BODY);
  assert.throws(() => applyLook('a a', { edits: [['a', 'b']] }), /2 times/);
  assert.throws(() => applyLook('a', { edits: [['x', 'y']] }), /0 times/);
  assert.equal(applyLook('a', { edits: [['a', '$&$&']] }), '$&$&', 'replacement must be literal');
});

test('cowPose stays finite when pause >= period / 2', () => {
  const o = { from: -8, to: 8, period: 8, phase: 0, pause: 5 };
  for (let t = 0; t < 16; t += 0.1) assert.ok(Number.isFinite(cowPose(o, t).lateral));
});

test('Clover blade gate: rotor never stops; a sail tip is inside the arch exactly while blocking', () => {
  const track = loadTrack('clover-meadows');
  const o = track.obstacles.find((x) => x.kind === 'blades');
  const t0 = track.pieceRange('tunnel').s0;
  const reach = track.frameAt(t0 + 12).y + HUB_RISE - track.frameAt(o.s - 3.6).y - 0.5; // as buildBlades
  const arch = ARCH_HALF(track.frameAt(t0 + 25).halfWidth);
  const tipIn = (angle) => [0, 1, 2, 3].some((k) => {
    const a = angle + (k * Math.PI) / 2;
    return Math.cos(a) > 0 && Math.abs(reach * Math.sin(a)) <= arch;
  });
  let mismatched = 0;
  let prev = bladeState(o, -0.005).angle;
  for (let t = 0; t < 2 * o.period; t += 0.005) {
    const g = bladeState(o, t);
    assert.ok(Math.abs(g.angle - prev - (Math.PI / 2 / o.period) * 0.005) < 1e-9, 'rotor speed not constant');
    prev = g.angle;
    const u = (((t + o.phase) / o.period) % 1 + 1) % 1;
    if (Math.min(Math.abs(u - o.blockFraction), u, 1 - u) < 0.003) continue; // edge samples
    if (tipIn(g.angle) !== g.blocking) mismatched++;
  }
  assert.equal(mismatched, 0);
  const span = 2 * Math.asin(arch / reach) * (180 / Math.PI);
  assert.ok(Math.abs(span / 90 - o.blockFraction) <= 0.1 * o.blockFraction, `sail span ${span} deg vs ${o.blockFraction * 90}`);
  assert.ok(o.blockFraction >= 0.25 && o.blockFraction <= 0.45 && o.period >= 3 && o.period <= 5);
});

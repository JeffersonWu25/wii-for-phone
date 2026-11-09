import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track.js';
import { createRace, stepRace } from './race.js';
import { KART_RADIUS, BOOST_TIME } from './physics.js';
import {
  BOX_RESPAWN, ITEM_ODDS, ROLL_TIME, aimFromInput, createBoxes, mulberry32, pushEvent, rollItem, stepItems, useItem,
} from './items.js';

const track = buildTrack();
const DT = 1 / 60;
const ENTRANTS = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, color: i }));

const newRace = (seed = 7, entrants = ENTRANTS) => createRace(track, entrants, { seed });

// Advances race time and items only (no driving), like stepRace does.
function tick(race, seconds, inputs = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    race.time += DT;
    stepItems(race, inputs, DT, track);
  }
}

function moveTo(kart, x, z) {
  Object.assign(kart, { x, z });
  const p = track.project(x, z, kart.s);
  kart.s = p.s;
  kart.lateral = p.lateral;
  kart.y = track.surfaceAt(p.s, p.lateral).y;
}

const onBox = (race, kart, box) => moveTo(kart, box.x, box.z);
const events = (race, type) => race.events.filter((e) => e.type === type);
const seq = (...kinds) => {
  let i = 0;
  return () => kinds[i++ % kinds.length];
};

// Puts kart on the road facing down the track, speed given, at s.
function place(kart, s, lateral = 0, speed = 0) {
  const fr = track.frameAt(s);
  Object.assign(kart, { x: fr.x + fr.rx * lateral, z: fr.z + fr.rz * lateral, h: fr.h, s, lateral, y: track.heightAt(s, lateral), speed, vx: fr.fx * speed, vz: fr.fz * speed });
}

// ── Track data ───────────────────────────────────────────────────────────────

test('track exposes two item rows of four laterals', () => {
  assert.equal(track.itemRows.length, 2);
  for (const row of track.itemRows) assert.deepEqual(row.laterals, [-4.5, -1.5, 1.5, 4.5]);
  assert.equal(track.itemRows[0].s, 80);
});

// ── Boxes: stack, pickup, respawn ────────────────────────────────────────────

test('boxes: four per row, exactly one stacked per row, seed-determined', () => {
  const a = createBoxes(track, mulberry32(3));
  const b = createBoxes(track, mulberry32(3));
  assert.equal(a.length, 8);
  assert.deepEqual(a, b);
  for (const r of [0, 1]) assert.equal(a.filter((x) => x.row === r && x.stacked).length, 1);
  assert.ok(a.every((x) => x.ready && Number.isFinite(x.y)));
});

test('race.rng is a seeded mulberry32 in [0,1)', () => {
  const r1 = newRace(5);
  const r2 = newRace(5);
  const xs = Array.from({ length: 50 }, () => r1.rng());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => r2.rng()));
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(xs, Array.from({ length: 50 }, () => newRace(6).rng()));
});

test('driving into a normal box breaks it, fills main hidden, and respawns after BOX_RESPAWN', () => {
  const race = newRace();
  const box = race.boxes.find((b) => !b.stacked);
  const kart = race.karts[0];
  onBox(race, kart, box);
  tick(race, DT);
  assert.equal(box.ready, false);
  assert.ok(kart.item.main);
  assert.equal(kart.item.reserve, null);
  assert.ok(kart.item.rollMain > ROLL_TIME - 0.1);
  assert.equal(events(race, 'box_break').length, 1);
  assert.equal(events(race, 'pickup')[0].kartId, 'a');
  moveTo(kart, box.x, box.z + 30);
  tick(race, BOX_RESPAWN - 0.1);
  assert.equal(box.ready, false);
  tick(race, 0.2);
  assert.equal(box.ready, true);
});

test('pickup radius is KART_RADIUS + 0.7', () => {
  const race = newRace();
  const box = race.boxes.find((b) => !b.stacked);
  const kart = race.karts[0];
  moveTo(kart, box.x + KART_RADIUS + 0.75, box.z);
  tick(race, DT);
  assert.equal(box.ready, true);
  moveTo(kart, box.x + KART_RADIUS + 0.65, box.z);
  tick(race, DT);
  assert.equal(box.ready, false);
});

test('slots: normal box fills main, then reserve, then nothing but still breaks', () => {
  const race = newRace();
  const kart = race.karts[0];
  const boxes = race.boxes.filter((b) => b.row === 0 && !b.stacked);
  onBox(race, kart, boxes[0]);
  tick(race, DT);
  onBox(race, kart, boxes[1]);
  race.pickupAt = {};
  tick(race, DT);
  assert.ok(kart.item.main && kart.item.reserve);
  assert.ok(kart.item.rollReserve > 0);
  const before = { ...kart.item };
  onBox(race, kart, boxes[2]);
  race.pickupAt = {};
  tick(race, DT);
  assert.equal(boxes[2].ready, false);
  assert.equal(kart.item.main, before.main);
  assert.equal(kart.item.reserve, before.reserve);
});

test('stacked box fills both slots, the reserve landing 0.3 s after the main', () => {
  const race = newRace();
  const kart = race.karts[0];
  const box = race.boxes.find((b) => b.stacked);
  onBox(race, kart, box);
  tick(race, DT);
  assert.ok(kart.item.main && kart.item.reserve);
  assert.ok(Math.abs(kart.item.rollReserve - kart.item.rollMain - 0.3) < 1e-9);
});

test('a kart takes from the same row at most once per second', () => {
  const race = newRace();
  const kart = race.karts[0];
  const [b0, b1] = race.boxes.filter((b) => b.row === 0 && !b.stacked);
  onBox(race, kart, b0);
  tick(race, DT);
  onBox(race, kart, b1);
  tick(race, 0.5);
  assert.equal(b1.ready, true);
  tick(race, 0.6);
  assert.equal(b1.ready, false);
});

test('when the stacked box respawns, the row re-rolls which box is stacked', () => {
  let changed = false;
  for (let seed = 1; seed < 30 && !changed; seed++) {
    const race = newRace(seed);
    const box = race.boxes.find((b) => b.row === 0 && b.stacked);
    onBox(race, race.karts[0], box);
    tick(race, BOX_RESPAWN + 0.1);
    assert.equal(race.boxes.filter((b) => b.row === 0 && b.stacked).length, 1);
    changed = !box.stacked;
  }
  assert.ok(changed, 'some seed moved the stack');
});

// ── Roll timing, odds ────────────────────────────────────────────────────────

test('rollItem blends odds by place: 1st never red, last never banana, a lone kart is treated as 1st', () => {
  const draw = (place, n) => {
    const rng = mulberry32(11);
    const seen = new Set();
    for (let i = 0; i < 4000; i++) seen.add(rollItem(place, n, rng));
    return seen;
  };
  assert.equal(draw(1, 4).has('red'), false);
  assert.equal(draw(4, 4).has('banana'), false);
  assert.equal(draw(1, 1).has('red'), false);
  assert.ok(draw(2, 4).has('red') && draw(2, 4).has('banana'));
  assert.deepEqual(Object.keys(ITEM_ODDS.first).sort(), ['banana', 'green', 'mushroom', 'red']);
});

test('rollItem frequency matches the weights at the ends', () => {
  const rng = mulberry32(2);
  const count = { banana: 0, green: 0, red: 0, mushroom: 0 };
  for (let i = 0; i < 20000; i++) count[rollItem(1, 4, rng)]++;
  assert.ok(Math.abs(count.banana / 20000 - 0.5) < 0.02);
  assert.ok(Math.abs(count.green / 20000 - 0.4) < 0.02);
  assert.ok(Math.abs(count.mushroom / 20000 - 0.1) < 0.02);
});

test('a roll timer counts down to zero and use is refused until then', () => {
  const race = newRace();
  const kart = race.karts[0];
  kart.item.main = 'banana';
  kart.item.rollMain = ROLL_TIME;
  tick(race, 0.5, { a: { useItem: true } });
  assert.equal(kart.item.main, 'banana');
  assert.equal(race.entities.length, 0);
  tick(race, ROLL_TIME);
  assert.equal(kart.item.rollMain, 0);
  tick(race, DT, { a: { useItem: true } });
  assert.equal(kart.item.main, null);
});

// ── Use ──────────────────────────────────────────────────────────────────────

test('use consumes main and moves the reserve up with its remaining roll time', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 10);
  Object.assign(kart.item, { main: 'banana', rollMain: 0, reserve: 'green', rollReserve: 0.8 });
  assert.equal(useItem(race, kart, {}, track), true);
  assert.deepEqual(kart.item, { main: 'green', reserve: null, rollMain: 0.8, rollReserve: 0 });
  assert.equal(useItem(race, kart, {}, track), false);
  assert.equal(events(race, 'use').length, 1);
});

test('a hit kart cannot use an item', () => {
  const race = newRace();
  const kart = race.karts[0];
  Object.assign(kart.item, { main: 'mushroom', rollMain: 0 });
  kart.hit = { kind: 'spin', t: 1, total: 1.2 };
  assert.equal(useItem(race, kart, {}, track), false);
  assert.equal(kart.item.main, 'mushroom');
});

test('aim mapping: aimY thresholds pick the zone, steer scales the angle', () => {
  const rad = (d) => (d * Math.PI) / 180;
  assert.equal(aimFromInput({ aimY: 0.6, steer: 1 }).dir, 'backward');
  assert.ok(Math.abs(aimFromInput({ aimY: 0.6, steer: 1 }).angle - rad(30)) < 1e-9);
  assert.ok(Math.abs(aimFromInput({ aimY: 1, steer: -0.5 }).angle + rad(15)) < 1e-9);
  const up = aimFromInput({ aimY: -0.6, steer: 1 });
  assert.equal(up.dir, 'forward');
  assert.ok(Math.abs(up.angle - rad(15)) < 1e-9);
  const neutral = aimFromInput({ aimY: 0.5, steer: 0 });
  assert.equal(neutral.dir, 'forward');
  assert.equal(neutral.angle, 0);
  assert.equal(aimFromInput(undefined).zone, 'neutral');
});

test('mushroom: boost, level 0, and the mushroom timer', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 10);
  kart.boostLevel = 2;
  Object.assign(kart.item, { main: 'mushroom', rollMain: 0 });
  useItem(race, kart, {}, track);
  assert.equal(kart.boost, BOOST_TIME);
  assert.equal(kart.boostLevel, 0);
  assert.equal(kart.mushroom, BOOST_TIME);
});

test('banana: neutral drops it 2 m behind on the ground', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 12);
  Object.assign(kart.item, { main: 'banana', rollMain: 0 });
  useItem(race, kart, { aimY: 0 }, track);
  const [b] = race.entities;
  assert.equal(b.kind, 'banana');
  assert.equal(b.state, 'ground');
  assert.equal(b.owner, 'a');
  assert.ok(Math.abs(Math.hypot(b.x - kart.x, b.z - kart.z) - 2) < 1e-9);
  assert.ok(Math.abs(b.y - track.surfaceAt(b.s, b.lateral).y) < 1e-9);
});

test('banana: aimed backward tosses it ~6 m back, forward throws it ahead and it lands on the surface', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 10);
  Object.assign(kart.item, { main: 'banana', rollMain: 0, reserve: 'banana', rollReserve: 0 });
  useItem(race, kart, { aimY: 1 }, track);
  const back = race.entities[0];
  assert.equal(back.state, 'air');
  tick(race, 1);
  assert.equal(back.state, 'ground');
  const dist = Math.hypot(back.x - kart.x, back.z - kart.z);
  assert.ok(dist > 4 && dist < 9, `toss ${dist}`);
  assert.ok(Math.cos(kart.h) * (back.x - kart.x) + Math.sin(kart.h) * (back.z - kart.z) < 0, 'behind');

  useItem(race, kart, { aimY: -1 }, track);
  const fwd = race.entities[1];
  const ahead = (e) => Math.cos(kart.h) * (e.x - kart.x) + Math.sin(kart.h) * (e.z - kart.z);
  assert.equal(fwd.state, 'air');
  assert.ok(fwd.vy > 0);
  tick(race, 1);
  assert.equal(fwd.state, 'ground');
  assert.ok(ahead(fwd) > 10, `ahead ${ahead(fwd)}`);
  assert.ok(Math.abs(fwd.y - track.surfaceAt(fwd.s, fwd.lateral).y) < 1e-9);
});

test('shells fire through shells.js: forward and backward with steer angle', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 10);
  Object.assign(kart.item, { main: 'green', rollMain: 0, reserve: 'red', rollReserve: 0 });
  useItem(race, kart, { aimY: 0 }, track);
  useItem(race, kart, { aimY: 1 }, track);
  const [g, r] = race.entities;
  assert.deepEqual([g.kind, r.kind], ['green', 'red']);
  assert.ok(g.vx * Math.cos(kart.h) + g.vz * Math.sin(kart.h) > 30);
  assert.ok(r.vx * Math.cos(kart.h) + r.vz * Math.sin(kart.h) < -30);
});

// ── Hits ─────────────────────────────────────────────────────────────────────

test('a banana in the road spins out the kart that drives into it, and is removed', () => {
  const race = newRace();
  const [a, b] = race.karts;
  place(a, 200, 0, 10);
  Object.assign(a.item, { main: 'banana', rollMain: 0 });
  useItem(race, a, {}, track);
  const banana = race.entities[0];
  place(b, 200, 0, 0);
  moveTo(b, banana.x, banana.z);
  tick(race, DT);
  assert.equal(b.hit?.kind, 'spin');
  assert.equal(race.entities.length, 0);
  const hit = events(race, 'hit')[0];
  assert.equal(hit.kartId, 'b');
  assert.equal(hit.kind, 'spin');
});

test('the owner is immune to their own banana for 0.3 s, then not', () => {
  const race = newRace();
  const a = race.karts[0];
  place(a, 200, 0, 0);
  Object.assign(a.item, { main: 'banana', rollMain: 0 });
  useItem(race, a, {}, track);
  const banana = race.entities[0];
  moveTo(a, banana.x, banana.z);
  tick(race, 0.2);
  assert.equal(a.hit, null);
  tick(race, 0.2);
  assert.equal(a.hit?.kind, 'spin');
});

test('a shell tumbles the kart it hits and a hit or immune kart is passed through', () => {
  const race = newRace();
  const [a, b] = race.karts;
  place(a, 10, 0, 0);
  place(b, 40, 0, 0);
  Object.assign(a.item, { main: 'green', rollMain: 0 });
  useItem(race, a, {}, track);
  tick(race, 1.2);
  assert.equal(b.hit?.kind, 'tumble');
  assert.equal(race.entities.length, 0);

  const race2 = newRace();
  const [c, d] = race2.karts;
  place(c, 10, 0, 0);
  place(d, 40, 0, 0);
  d.invuln = 5;
  Object.assign(c.item, { main: 'green', rollMain: 0 });
  useItem(race2, c, {}, track);
  tick(race2, 1.2);
  assert.equal(d.hit, null);
  assert.equal(race2.entities.length, 1, 'shell flew through');
});

test('shell meets shell: both break; shell meets banana: both break; two bananas do not', () => {
  const race = newRace();
  const mk = (kind, owner, x, z, age = 1) => ({ id: `t${race.entitySeq++}`, kind, owner, x, y: 0, z, vx: 0, vy: 0, vz: 0, s: 0, lateral: 0, age, state: kind === 'banana' ? 'ground' : 'moving', bounces: 0, target: null });
  place(race.karts[0], 200, 0, 0);
  const fr = track.frameAt(500);
  const at = (dx) => [fr.x + fr.fx * dx, fr.z + fr.fz * dx];
  const g1 = mk('green', 'a', ...at(0));
  const g2 = mk('green', 'b', ...at(0.5));
  const ban = mk('banana', 'c', ...at(30));
  const shell3 = mk('red', 'c', ...at(30.4));
  const far = mk('banana', 'a', ...at(60));
  const far2 = mk('banana', 'b', ...at(60.2));
  race.entities.push(g1, g2, ban, shell3, far, far2);
  race.time += DT;
  stepItems(race, {}, 0, track); // dt 0: nothing moves, only collisions resolve
  assert.deepEqual(race.entities.map((e) => e.id), [far.id, far2.id]);
  assert.equal(events(race, 'entity_break').length, 4);
});

test('owner shells fired in the same moment do not break each other', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 0);
  Object.assign(kart.item, { main: 'green', rollMain: 0, reserve: 'green', rollReserve: 0 });
  useItem(race, kart, {}, track);
  useItem(race, kart, {}, track);
  tick(race, DT);
  assert.equal(race.entities.length, 2);
});

// ── Events ───────────────────────────────────────────────────────────────────

test('pushEvent numbers events from 1 and keeps the last 64', () => {
  const race = newRace();
  for (let i = 0; i < 100; i++) pushEvent(race, { type: 'use', i });
  assert.equal(race.events.length, 64);
  assert.equal(race.eventSeq, 100);
  assert.equal(race.events[0].seq, 37);
  assert.equal(race.events.at(-1).seq, 100);
  assert.ok(race.events.every((e, i, a) => i === 0 || e.seq === a[i - 1].seq + 1));
});

// ── Through the race loop ────────────────────────────────────────────────────

test('stepRace runs items: a driving kart picks up a box and the same seed gives the same item', () => {
  const run = (seed) => {
    const race = newRace(seed);
    race.phase = 'racing';
    const box = race.boxes.find((b) => !b.stacked);
    onBox(race, race.karts[0], box);
    stepRace(race, {}, DT, track);
    return race.karts[0].item.main;
  };
  assert.ok(run(9));
  assert.equal(run(9), run(9));
});

test('a mushroom use through stepRace speeds the kart past normal top speed', () => {
  const race = newRace();
  race.phase = 'racing';
  const kart = race.karts[0];
  place(kart, 10, 0, 22);
  Object.assign(kart.item, { main: 'mushroom', rollMain: 0 });
  for (let i = 0; i < 60; i++) stepRace(race, { a: { useItem: i === 0 } }, DT, track);
  assert.ok(kart.speed > 24, `speed ${kart.speed}`);
});

// ── Review fixes ─────────────────────────────────────────────────────────────

test('pickup.got is false when every slot is already full, stacked or not', () => {
  const race = newRace();
  const kart = race.karts[0];
  Object.assign(kart.item, { main: 'banana', reserve: 'green', rollMain: 0, rollReserve: 0 });
  const stacked = race.boxes.find((b) => b.row === 0 && b.stacked);
  const plain = race.boxes.find((b) => b.row === 0 && !b.stacked);
  onBox(race, kart, stacked);
  tick(race, DT);
  race.pickupAt = {};
  onBox(race, kart, plain);
  tick(race, DT);
  assert.deepEqual(events(race, 'pickup').map((e) => e.got), [false, false]);
  assert.equal(kart.item.main, 'banana');
  assert.equal(kart.item.reserve, 'green');
});

test('pickup.got is true when a slot was filled', () => {
  const race = newRace();
  const kart = race.karts[0];
  Object.assign(kart.item, { main: 'banana', rollMain: 0 });
  onBox(race, kart, race.boxes.find((b) => b.row === 0 && !b.stacked));
  tick(race, DT);
  assert.equal(events(race, 'pickup')[0].got, true);
  assert.ok(kart.item.reserve);
});

test('a use press while the slot is rolling or the kart is hit or finished is dropped, not buffered', () => {
  const race = newRace();
  const kart = race.karts[0];
  Object.assign(kart.item, { main: 'banana', rollMain: 0 });
  kart.hit = { kind: 'spin', t: 1, total: 1.2 };
  tick(race, DT, { a: { useItem: true } });
  assert.equal(kart.item.main, 'banana');
  kart.hit = null;
  tick(race, DT);
  assert.equal(kart.item.main, 'banana', 'the earlier press is not replayed');
  kart.finished = true;
  tick(race, DT, { a: { useItem: true } });
  assert.equal(kart.item.main, 'banana');
  assert.equal(race.entities.length, 0);
});

test('a mushroom never shortens a running drift boost nor drops its level', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 20);
  Object.assign(kart.item, { main: 'mushroom', rollMain: 0 });
  Object.assign(kart, { boost: BOOST_TIME + 1, boostLevel: 3 });
  useItem(race, kart, {}, track);
  assert.equal(kart.boost, BOOST_TIME + 1);
  assert.equal(kart.boostLevel, 3);
  assert.equal(kart.mushroom, BOOST_TIME);
});

test('a thrown banana lands inside the road corridor', () => {
  const race = newRace();
  const kart = race.karts[0];
  place(kart, 200, 0, 20);
  kart.h += 1.2; // aim hard to the side so the arc would leave the road
  Object.assign(kart.item, { main: 'banana', rollMain: 0 });
  useItem(race, kart, { aimY: -1, steer: 1 }, track);
  tick(race, 3);
  const b = race.entities.find((e) => e.kind === 'banana');
  assert.equal(b.state, 'ground');
  const surf = track.surfaceAt(b.s, b.lateral);
  assert.ok(b.lateral <= surf.limitR + 1e-6 && b.lateral >= -surf.limitL - 1e-6, `lateral ${b.lateral}`);
});

test('entities pass through a finished kart', () => {
  const race = newRace();
  const kart = race.karts[1];
  place(kart, 300, 0, 0);
  kart.finished = true;
  race.entities.push({ id: 'e9', kind: 'banana', owner: 'a', x: kart.x, y: kart.y, z: kart.z, vx: 0, vy: 0, vz: 0, s: kart.s, lateral: 0, age: 1, state: 'ground', bounces: 0, target: null });
  tick(race, DT);
  assert.equal(kart.hit ?? null, null);
  assert.equal(race.entities.length, 1);
});

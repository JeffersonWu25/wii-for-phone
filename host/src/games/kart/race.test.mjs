import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from './track.js';
import { createRace, stepRace, formatTime, RACE_LAPS } from './race.js';
import { autopilotInput } from './autopilot.js';

const track = buildTrack();
const DT = 1 / 60;
const ENTRANTS = [
  { id: 'a', name: 'A', color: 0xff0000 },
  { id: 'b', name: 'B', color: 0x00ff00 },
  { id: 'c', name: 'C', color: 0x0000ff },
  { id: 'd', name: 'D', color: 0xffff00 },
];

function autopilotInputs(race) {
  return Object.fromEntries(race.karts.map((k) => [k.id, autopilotInput(track, k)]));
}

function startRace(entrants = ENTRANTS) {
  const race = createRace(track, entrants);
  while (race.phase === 'countdown') stepRace(race, {}, DT, track);
  return race;
}

test('formatTime renders m:ss.cc', () => {
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(75.456), '1:15.46');
  assert.equal(formatTime(9.99), '0:09.99');
});

test('countdown freezes the karts for 3 s, then racing starts', () => {
  const race = createRace(track, ENTRANTS);
  const start = race.karts.map((k) => [k.x, k.z]);
  let t = 0;
  while (race.phase === 'countdown') {
    stepRace(race, { a: { steer: 0 } }, DT, track);
    t += DT;
    if (race.phase === 'countdown') assert.equal(race.karts[0].speed, 0);
  }
  assert.ok(Math.abs(t - 3) < 0.05, `countdown lasted ${t}`);
  assert.equal(race.phase, 'racing');
  assert.ok(race.goTimer > 0);
  race.karts.forEach((k, i) => assert.deepEqual([k.x, k.z], start[i]));
  stepRace(race, { a: { steer: 0 } }, DT, track);
  assert.ok(race.karts[0].speed > 0);
});

test('an autopilot completes 3 laps and the race finishes', () => {
  const race = startRace();
  let guard = 0;
  while (race.phase !== 'finished' && guard++ < 60 * 400) stepRace(race, autopilotInputs(race), DT, track);
  assert.equal(race.phase, 'finished');
  assert.equal(race.finishOrder.length, ENTRANTS.length);
  for (const k of race.karts) {
    assert.equal(k.lap, RACE_LAPS);
    assert.equal(k.lapTimes.length, RACE_LAPS);
    assert.ok(k.finished && k.finishTime > 0);
    for (const lt of k.lapTimes) assert.ok(lt > 35 && lt < 60, `lap time ${lt}`);
  }
  assert.deepEqual([...race.standings], [...race.finishOrder]);
});

test('teleporting past checkpoints does not count a lap', () => {
  const race = startRace([ENTRANTS[0]]);
  const kart = race.karts[0];
  for (let i = 0; i < 300; i++) stepRace(race, autopilotInputs(race), DT, track);
  assert.ok(kart.started);
  assert.equal(kart.lap, 0);
  // Jump from the first gates to just before the line, skipping 3..7.
  const fr = track.frameAt(track.length - 3);
  Object.assign(kart, { x: fr.x, z: fr.z, h: fr.h, s: fr.s, lateral: 0, speed: 20, vx: fr.fx * 20, vz: fr.fz * 20 });
  for (let i = 0; i < 600; i++) stepRace(race, autopilotInputs(race), DT, track);
  assert.equal(kart.lap, 0, 'lap should not count');
  assert.ok(kart.nextCheckpoint <= 4);
});

test('wrong-way driving is flagged after a second', () => {
  const race = startRace([ENTRANTS[0]]);
  const kart = race.karts[0];
  kart.h += Math.PI;
  kart.vx = Math.cos(kart.h) * 5;
  kart.vz = Math.sin(kart.h) * 5;
  kart.speed = 5;
  for (let i = 0; i < 40; i++) stepRace(race, { a: { steer: 0 } }, DT, track);
  assert.equal(kart.wrongWay, false);
  for (let i = 0; i < 60; i++) stepRace(race, { a: { steer: 0 } }, DT, track);
  assert.equal(kart.wrongWay, true);
});

test('a stuck kart stays where it is: no respawn', () => {
  const race = startRace([ENTRANTS[0]]);
  const kart = race.karts[0];
  for (let i = 0; i < 60 * 12; i++) stepRace(race, autopilotInputs(race), DT, track);
  // Pin the kart against the right wall facing it.
  const fr = track.frameAt(kart.s);
  const lim = track.surfaceAt(kart.s, 0).limitR - 0.9;
  Object.assign(kart, { x: fr.x + fr.rx * lim, z: fr.z + fr.rz * lim, h: Math.atan2(fr.rz, fr.rx), speed: 0, vx: 0, vz: 0, s: fr.s });
  for (let i = 0; i < 60 * 6; i++) stepRace(race, { a: { steer: 0 } }, DT, track);
  assert.ok(kart.lateral > lim - 1, `lateral ${kart.lateral}`);
  assert.ok(Math.abs(kart.s - fr.s) < 5, `s moved ${kart.s - fr.s}`);
});

test('driving the wrong way keeps the flag and never respawns', () => {
  const race = startRace([ENTRANTS[0]]);
  const kart = race.karts[0];
  for (let i = 0; i < 60 * 8; i++) stepRace(race, autopilotInputs(race), DT, track);
  kart.h += Math.PI;
  kart.vx = Math.cos(kart.h) * 5;
  kart.vz = Math.sin(kart.h) * 5;
  kart.speed = 5;
  let flagged = false;
  let jumped = false;
  let prev = kart.s;
  for (let i = 0; i < 60 * 8; i++) {
    stepRace(race, { a: { steer: 0 } }, DT, track);
    if (kart.wrongWay) flagged = true;
    if (Math.abs(kart.s - prev) > 2) jumped = true;
    prev = kart.s;
  }
  assert.ok(flagged, 'wrong-way flag should have shown');
  assert.ok(!jumped, 'kart should never be teleported');
});

test('finished karts coast to a stop', () => {
  const race = startRace([ENTRANTS[0], ENTRANTS[1]]);
  const [a, b] = race.karts;
  for (let i = 0; i < 60 * 3; i++) stepRace(race, autopilotInputs(race), DT, track);
  a.finished = true;
  const v0 = a.speed;
  for (let i = 0; i < 60; i++) stepRace(race, { a: { steer: 0 }, b: { steer: 0 } }, DT, track);
  assert.ok(a.speed < v0 - 2 && b.speed > a.speed, `a ${a.speed} b ${b.speed}`);
});

test('standings order karts by progress', () => {
  const race = startRace();
  const lead = race.karts[3];
  for (let i = 0; i < 60 * 8; i++) {
    const inputs = autopilotInputs(race);
    for (const k of race.karts) if (k !== lead) inputs[k.id] = { steer: 0, throttle: 0 };
    stepRace(race, inputs, DT, track);
  }
  assert.equal(race.standings[0], lead.id);
  assert.equal(lead.place, 1);
  for (let i = 1; i < race.karts.length; i++) {
    const a = race.karts.find((k) => k.id === race.standings[i - 1]);
    const b = race.karts.find((k) => k.id === race.standings[i]);
    assert.ok(a.progress >= b.progress);
  }
});

test('a new race carries the item state: boxes, entity list, event log, empty slots', () => {
  const race = createRace(track, ENTRANTS, { seed: 4 });
  assert.equal(race.boxes.length, 8);
  assert.deepEqual([race.entities, race.events, race.eventSeq], [[], [], 0]);
  for (const k of race.karts) assert.deepEqual(k.item, { main: null, reserve: null, rollMain: 0, rollReserve: 0 });
  assert.deepEqual(createRace(track, ENTRANTS, { seed: 4 }).boxes, race.boxes);
});

test('items stay frozen through the countdown and an autopilot lap with items picked up is deterministic', () => {
  const lap = (seed) => {
    const race = createRace(track, ENTRANTS, { seed });
    for (let i = 0; i < 60 * 40; i++) stepRace(race, autopilotInputs(race), DT, track);
    return race.karts.map((k) => k.item.main);
  };
  assert.deepEqual(lap(3), lap(3));
  assert.ok(lap(3).some(Boolean), 'someone picked up a box');
});

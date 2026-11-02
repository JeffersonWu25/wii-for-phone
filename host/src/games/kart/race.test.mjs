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
    stepRace(race, { a: { steer: 0, gas: true } }, DT, track);
    t += DT;
    if (race.phase === 'countdown') assert.equal(race.karts[0].speed, 0);
  }
  assert.ok(Math.abs(t - 3) < 0.05, `countdown lasted ${t}`);
  assert.equal(race.phase, 'racing');
  assert.ok(race.goTimer > 0);
  race.karts.forEach((k, i) => assert.deepEqual([k.x, k.z], start[i]));
  stepRace(race, { a: { steer: 0, gas: true } }, DT, track);
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
  for (let i = 0; i < 40; i++) stepRace(race, { a: { steer: 0, gas: true } }, DT, track);
  assert.equal(kart.wrongWay, false);
  for (let i = 0; i < 60; i++) stepRace(race, { a: { steer: 0, gas: true } }, DT, track);
  assert.equal(kart.wrongWay, true);
});

test('a stuck kart respawns at its last checkpoint', () => {
  const race = startRace([ENTRANTS[0]]);
  const kart = race.karts[0];
  for (let i = 0; i < 60 * 12; i++) stepRace(race, autopilotInputs(race), DT, track);
  assert.ok(kart.lastCheckpointIndex >= 1);
  const gateS = track.checkpoints[kart.lastCheckpointIndex].s;
  // Pin the kart against the right wall facing it.
  const fr = track.frameAt(kart.s);
  const lim = track.surfaceAt(kart.s, 0).limitR - 0.9;
  Object.assign(kart, { x: fr.x + fr.rx * lim, z: fr.z + fr.rz * lim, h: Math.atan2(fr.rz, fr.rx), speed: 0, vx: 0, vz: 0, s: fr.s });
  let respawned = false;
  for (let i = 0; i < 60 * 6 && !respawned; i++) {
    stepRace(race, { a: { steer: 0, gas: true } }, DT, track);
    if (Math.abs(kart.speed) < 1e-9 && kart.stuckTime === 0 && Math.abs(kart.s - gateS) < 1) respawned = true;
  }
  assert.ok(respawned, 'kart should be back at the checkpoint');
  assert.ok(Math.abs(kart.lateral) < 1e-6);
});

test('standings order karts by progress', () => {
  const race = startRace();
  const lead = race.karts[3];
  for (let i = 0; i < 60 * 8; i++) {
    const inputs = autopilotInputs(race);
    for (const k of race.karts) if (k !== lead) inputs[k.id] = { steer: 0, gas: false };
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

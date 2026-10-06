import { characterFor } from './characters.js';
import { HALF, poseAt, sampleTrack } from './track.js';

export const LAPS = 3;
export const CHECKPOINTS = 8;
export const STALE_MS = 400;
export const FINISH_GRACE_MS = 20000;
const GATE_WINDOW = 0.15;

const ACCEL = 22;
const COAST = 14;
const MAX_SPEED = 32;
const BOOST_SPEED = 42;
const TURN = 2.4;
const DRIFT_TURN = 3.3;
const DRIFT_CHARGE_RATE = 0.85;
const BOOST_TIME = 0.75;
const KART_RADIUS = 1.15;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function gridPose(index) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const pose = poseAt(1 - 0.012 - row * 0.016);
  const side = (col === 0 ? -1 : 1) * 1.6;
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  return {
    x: pose.x + rx * side,
    z: pose.z + rz * side,
    heading: pose.heading,
  };
}

export function createRace(players, now) {
  const karts = players.map((player, index) => {
    const pose = gridPose(index);
    const sample = sampleTrack(pose.x, pose.z);
    return {
      playerId: player.playerId,
      name: player.name,
      character: characterFor(index),
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      speed: 0,
      steer: 0,
      gas: false,
      drift: false,
      lastInputAt: 0,
      seq: -1,
      nextCheckpoint: 0,
      gateDelta: null,
      completedLaps: 0,
      finished: false,
      finishTimeMs: null,
      progress: sample.progress,
      driftCharge: 0,
      boostT: 0,
    };
  });
  return {
    phase: 'countdown',
    countdown: 3,
    startedAt: null,
    timeMs: 0,
    firstFinishAt: null,
    karts,
    results: null,
    _lastSec: null,
    _statusAt: 0,
    _introSent: false,
    _goSent: false,
    _sentFinish: false,
    _createdAt: now,
  };
}

export function applyDrive(race, msg, now) {
  const kart = race.karts.find((k) => k.playerId === msg.playerId);
  if (!kart || kart.finished) return;
  const seq = Number(msg.seq);
  if (Number.isFinite(seq) && seq < kart.seq) return;
  if (Number.isFinite(seq)) kart.seq = seq;
  const steer = Number(msg.steer);
  kart.steer = clamp(Number.isFinite(steer) ? steer : 0, -1, 1);
  kart.gas = !!msg.gas;
  kart.drift = !!msg.drift;
  kart.lastInputAt = now;
}

function liveInput(kart, now) {
  if (now - kart.lastInputAt > STALE_MS) {
    return { steer: 0, gas: false, drift: false };
  }
  return { steer: kart.steer, gas: kart.gas, drift: kart.drift };
}

export function noteProgress(kart, progress, onTrack, timeMs) {
  if (!onTrack || kart.finished) return;
  const gate = kart.nextCheckpoint / CHECKPOINTS;
  let delta = progress - gate;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  const prev = kart.gateDelta;
  kart.gateDelta = delta;
  kart.progress = progress;
  if (prev == null) return;
  if (prev < 0 && delta >= 0 && delta < GATE_WINDOW) {
    kart.nextCheckpoint = (kart.nextCheckpoint + 1) % CHECKPOINTS;
    if (kart.nextCheckpoint === 0) {
      kart.completedLaps += 1;
      if (kart.completedLaps >= LAPS) {
        kart.finished = true;
        kart.finishTimeMs = timeMs;
        kart.speed = 0;
      }
    }
  }
}

function contain(kart, sample) {
  if (Math.abs(sample.lateral) <= HALF) return sample;
  const overflow = Math.abs(sample.lateral) - HALF + 0.05;
  kart.x -= sample.dirX * overflow;
  kart.z -= sample.dirZ * overflow;
  const headingOut = Math.sin(kart.heading) * sample.dirX + Math.cos(kart.heading) * sample.dirZ;
  const movingOut = headingOut * Math.sign(sample.lateral || 1);
  if (movingOut > 0.05) {
    const along = Math.atan2(sample.tx, sample.tz);
    const flipped = wrapPi(along + Math.PI);
    const target = Math.abs(wrapPi(flipped - kart.heading)) < Math.abs(wrapPi(along - kart.heading))
      ? flipped
      : along;
    kart.heading += wrapPi(target - kart.heading) * 0.8;
    kart.speed *= 0.94;
  }
  return sampleTrack(kart.x, kart.z);
}

function separate(karts) {
  const min = KART_RADIUS * 2;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= min || dist < 1e-4) continue;
      const overlap = (min - dist) / 2;
      const nx = dx / dist;
      const nz = dz / dist;
      a.x += nx * overlap;
      a.z += nz * overlap;
      b.x -= nx * overlap;
      b.z -= nz * overlap;
      const push = (a.speed - b.speed) * 0.2;
      a.speed = Math.max(0, a.speed - push);
      b.speed = Math.max(0, b.speed + push);
    }
  }
}

function stepKart(kart, input, dt) {
  const drifting = input.drift && kart.speed > 5 && Math.abs(input.steer) > 0.15;
  const max = kart.boostT > 0 ? BOOST_SPEED : MAX_SPEED;
  const target = input.gas ? max : 0;
  if (kart.speed < target) kart.speed = Math.min(target, kart.speed + ACCEL * dt);
  else kart.speed = Math.max(target, kart.speed - COAST * dt);

  const pace = clamp(kart.speed / MAX_SPEED, 0, 1);
  const turn = drifting ? DRIFT_TURN : TURN * (1 - pace * 0.45);
  kart.heading += input.steer * turn * dt;

  if (drifting) kart.driftCharge = Math.min(1, kart.driftCharge + DRIFT_CHARGE_RATE * dt);
  if (!input.drift && kart.driftCharge >= 0.55) {
    kart.boostT = BOOST_TIME;
    kart.driftCharge = 0;
  } else if (!input.drift) {
    kart.driftCharge = Math.max(0, kart.driftCharge - dt * 0.8);
  }
  if (kart.boostT > 0) kart.boostT -= dt;

  kart.x += Math.sin(kart.heading) * kart.speed * dt;
  kart.z += Math.cos(kart.heading) * kart.speed * dt;
}

export function rankKarts(karts) {
  const finished = karts.filter((k) => k.finished).sort((a, b) => a.finishTimeMs - b.finishTimeMs);
  const racing = karts.filter((k) => !k.finished).sort((a, b) => {
    if (b.completedLaps !== a.completedLaps) return b.completedLaps - a.completedLaps;
    if (b.nextCheckpoint !== a.nextCheckpoint) return b.nextCheckpoint - a.nextCheckpoint;
    return b.progress - a.progress;
  });
  return [...finished, ...racing];
}

export function lapNumber(kart) {
  if (kart.finished) return LAPS;
  return Math.min(LAPS, kart.completedLaps + 1);
}

export function snapshot(race) {
  const ranked = rankKarts(race.karts);
  return {
    phase: race.phase,
    countdown: Math.max(0, Math.ceil(race.countdown)),
    results: race.results,
    players: ranked.map((kart, index) => ({
      playerId: kart.playerId,
      name: kart.name,
      place: index + 1,
      lap: lapNumber(kart),
      characterId: kart.character.id,
      characterName: kart.character.name,
      color: kart.character.css,
      finished: kart.finished,
    })),
  };
}

function finishRace(race) {
  race.phase = 'finished';
  const ranked = rankKarts(race.karts);
  race.results = ranked.map((kart, index) => ({
    playerId: kart.playerId,
    name: kart.name,
    place: index + 1,
    timeMs: kart.finishTimeMs,
    characterName: kart.character.name,
    color: kart.character.css,
  }));
}

export function stepRace(race, dt, now) {
  const step = Math.min(dt, 0.05);
  if (race.phase === 'countdown') {
    race.countdown -= step;
    if (race.countdown <= 0) {
      race.phase = 'racing';
      race.startedAt = now;
      race.countdown = 0;
    }
    return;
  }
  if (race.phase !== 'racing') return;

  race.timeMs = now - race.startedAt;
  for (const kart of race.karts) {
    if (kart.finished) continue;
    stepKart(kart, liveInput(kart, now), step);
    let sample = sampleTrack(kart.x, kart.z);
    sample = contain(kart, sample);
    const onTrack = sample.lateral > -HALF - 0.8 && sample.lateral < HALF + 1.6;
    noteProgress(kart, sample.progress, onTrack, race.timeMs);
    kart.progress = sample.progress;
    if (kart.finished && race.firstFinishAt == null) race.firstFinishAt = now;
  }
  separate(race.karts);

  const allDone = race.karts.every((k) => k.finished);
  const graceUp = race.firstFinishAt != null && now - race.firstFinishAt > FINISH_GRACE_MS;
  if (allDone || graceUp) finishRace(race);
}

export function takeBroadcast(race, now) {
  const out = [];
  if (!race._introSent) {
    race._introSent = true;
    race._lastSec = 3;
    out.push(snapshotMessage(race));
    out.push({ type: 'race_countdown', seconds: 3 });
  }
  if (race.phase === 'countdown') {
    const sec = Math.max(1, Math.ceil(race.countdown));
    if (sec !== race._lastSec) {
      race._lastSec = sec;
      out.push({ type: 'race_countdown', seconds: sec });
    }
  }
  if (race.phase === 'racing' && !race._goSent) {
    race._goSent = true;
    out.push({ type: 'race_go' });
  }
  if ((race.phase === 'racing' || race.phase === 'countdown') && now - race._statusAt > 250) {
    race._statusAt = now;
    out.push(snapshotMessage(race));
  }
  if (race.phase === 'finished' && !race._sentFinish) {
    race._sentFinish = true;
    out.push({ type: 'race_finished', results: race.results });
    out.push(snapshotMessage(race));
  }
  return out;
}

function snapshotMessage(race) {
  const shot = snapshot(race);
  return {
    type: 'race_status',
    lapsTotal: LAPS,
    phase: shot.phase,
    players: shot.players,
  };
}

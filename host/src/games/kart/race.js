import { characterFor } from './characters.js';
import { PERIM, PROGRESS_CONTINUITY, followTrack, gridPose, sampleTrack } from './track.js';

export const LAPS = 3;
export const CHECKPOINTS = 8;
export const STALE_MS = 400;
export const FINISH_GRACE_MS = 20000;
const GATE_WINDOW = PROGRESS_CONTINUITY + 0.05;

const ACCEL = 22;
const COAST = 14;
const MAX_SPEED = 32;
const BOOST_SPEED = 42;
const BOOST_GAP = BOOST_SPEED - MAX_SPEED;
const HOLD_RADIUS = 14;
const LOW_SPEED_TURN = 1.7;
const DRIFT_CHARGE_RATE = 0.85;
const CHARGE_TO_BOOST = 0.55;
const BOOST_TIME = 0.75;
const CHARGE_DECAY = 0.8;
const KART_RADIUS = 1.15;
const MIN_DRIFT_SPEED = 5;
const MIN_DRIFT_STEER = 0.15;
const SLIP_MAX = 0.45;
const SLIP_ACQUIRE = 8;
const SLIP_RECOVER = 12;
const DRIFT_YAW_BONUS = 0.35;
const ROLL_AT_FULL_SLIP = 0.30;
const ROLL_CLAMP = 0.40;

export const DEFAULT_TUNING = Object.freeze({
  speed: 1,
  turn: 1,
  drift: 1,
  boost: 1,
});

export const TUNING_LIMITS = Object.freeze({
  speed: Object.freeze({ min: 0.5, max: 1.8, step: 0.05 }),
  turn: Object.freeze({ min: 0.4, max: 2.2, step: 0.05 }),
  drift: Object.freeze({ min: 0, max: 2, step: 0.05 }),
  boost: Object.freeze({ min: 0, max: 2, step: 0.05 }),
});

const SURFACE_MUL = Object.freeze({ asphalt: 1, sand: 0.42, grass: 0.3 });
const DASH_CAP = 40;
const DASH_TIME = 0.6;
const MUSHROOM_CAP = 40;
const MUSHROOM_TIME = 1.35;

const MAX_TUNED_SPEED = Math.max(
  MAX_SPEED * TUNING_LIMITS.speed.max + BOOST_GAP * TUNING_LIMITS.speed.max * TUNING_LIMITS.boost.max,
  DASH_CAP * TUNING_LIMITS.speed.max,
  MUSHROOM_CAP * TUNING_LIMITS.speed.max,
);
if (!(PROGRESS_CONTINUITY < 1 / CHECKPOINTS)) {
  throw new Error('progress budget can skip a checkpoint');
}
if (MAX_TUNED_SPEED * 0.05 / PERIM > PROGRESS_CONTINUITY) {
  throw new Error('tuned step exceeds the progress budget');
}

const IDLE_PHASE = Object.freeze({ phase: 'idle', slip: 0 });

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function idlePhase(slip = 0) {
  return Object.freeze({ phase: 'idle', slip });
}

function driftingPhase(charge, slip) {
  return Object.freeze({
    phase: 'drifting',
    charge: clamp(charge, 0, 1),
    slip,
  });
}

function boostingPhase(remaining, slip) {
  return Object.freeze({
    phase: 'boosting',
    remaining: Math.max(0, remaining),
    slip,
  });
}

function tuningScales(tuning) {
  const scales = {};
  for (const key of Object.keys(TUNING_LIMITS)) {
    const { min, max } = TUNING_LIMITS[key];
    const raw = tuning?.[key];
    const fallback = DEFAULT_TUNING[key];
    scales[key] = clamp(Number.isFinite(raw) ? raw : fallback, min, max);
  }
  return scales;
}

function travelOf(facing, slip) {
  return wrapPi(facing - slip);
}

function rollOf(slip, charge) {
  const lean = 0.55 + 0.45 * clamp(charge, 0, 1);
  const roll = -slip * (ROLL_AT_FULL_SLIP / SLIP_MAX) * lean;
  return clamp(roll, -ROLL_CLAMP, ROLL_CLAMP);
}

function speedCap(phase, scales, kart) {
  const asphalt = MAX_SPEED * scales.speed;
  const turbo = phase?.phase === 'boosting'
    ? asphalt + BOOST_GAP * scales.speed * scales.boost
    : 0;
  const dash = kart?.dashRemaining > 0 ? DASH_CAP * scales.speed : 0;
  const shroom = kart?.mushroomRemaining > 0 ? MUSHROOM_CAP * scales.speed : 0;
  const want = Math.max(asphalt, turbo, dash, shroom);
  const surface = kart?.surface || 'asphalt';
  const mul = kart?.mushroomRemaining > 0 ? 1 : SURFACE_MUL[surface];
  if (mul == null) throw new Error(`unknown surface ${surface}`);
  return want * mul;
}

function raiseToCap(kart, scales) {
  const cap = speedCap(kart.driftPhase || IDLE_PHASE, scales, kart);
  if (kart.speed < cap) kart.speed = cap;
}

function easeSlip(slip, target, dt) {
  const rate = target === 0 ? SLIP_RECOVER : SLIP_ACQUIRE;
  return slip + (target - slip) * (1 - Math.exp(-rate * dt));
}

function slipTarget(input, scales) {
  if (!input.drift) return 0;
  const steer = input.steer;
  if (steer === 0) return 0;
  return Math.sign(steer) * SLIP_MAX * scales.drift * Math.min(1, Math.abs(steer));
}

function qualifying(input, speed) {
  return input.drift && speed > MIN_DRIFT_SPEED && Math.abs(input.steer) > MIN_DRIFT_STEER;
}

export function driftView(kart) {
  const phase = kart.driftPhase || IDLE_PHASE;
  const charge = phase.phase === 'drifting' ? phase.charge : 0;
  const slip = phase.slip || 0;
  return {
    phase: phase.phase,
    facing: kart.facing,
    travel: travelOf(kart.facing, slip),
    slip,
    roll: rollOf(slip, charge),
    charge,
    charged: phase.phase === 'drifting' && charge >= CHARGE_TO_BOOST,
    boost: phase.phase === 'boosting' ? phase.remaining : 0,
  };
}

function clearDriftPose(kart) {
  kart.driftPhase = IDLE_PHASE;
  kart.dashRemaining = 0;
  kart.mushroomRemaining = 0;
}

function stepDrift(phase, input, speed, dt, scales, kart) {
  const qualifies = qualifying(input, speed);
  const slipAim = slipTarget(input, scales);
  let slip = easeSlip(phase.slip || 0, slipAim, dt);
  let boostKick = 0;
  let next = phase;
  let yawScale = 1;

  if (phase.phase === 'boosting') {
    if (qualifies) {
      next = driftingPhase(Math.min(1, DRIFT_CHARGE_RATE * dt), slip);
      yawScale = 1 + DRIFT_YAW_BONUS * scales.drift;
      return { phase: next, yawScale, boostKick: 0 };
    }
    const remaining = phase.remaining - dt;
    if (remaining > 0) {
      next = boostingPhase(remaining, slip);
    } else {
      next = idlePhase(slip);
    }
    return { phase: next, yawScale: 1, boostKick: 0 };
  }

  if (phase.phase === 'idle') {
    if (qualifies) {
      next = driftingPhase(Math.min(1, DRIFT_CHARGE_RATE * dt), slip);
      yawScale = 1 + DRIFT_YAW_BONUS * scales.drift;
    } else {
      next = idlePhase(slip);
    }
    return { phase: next, yawScale, boostKick: 0 };
  }

  if (qualifies) {
    next = driftingPhase(Math.min(1, phase.charge + DRIFT_CHARGE_RATE * dt), slip);
    yawScale = 1 + DRIFT_YAW_BONUS * scales.drift;
    return { phase: next, yawScale, boostKick: 0 };
  }

  if (input.drift) {
    next = driftingPhase(phase.charge, slip);
    return { phase: next, yawScale: 1, boostKick: 0 };
  }

  if (phase.charge >= CHARGE_TO_BOOST) {
    const window = BOOST_TIME * scales.boost;
    if (window <= 0) {
      next = idlePhase(slip);
      return { phase: next, yawScale: 1, boostKick: 0 };
    }
    const preCap = speedCap(phase, scales, kart);
    const post = boostingPhase(Math.max(0, window - dt), slip);
    const postCap = speedCap(post, scales, kart);
    boostKick = Math.max(0, postCap - preCap);
    if (post.remaining > 0) next = post;
    else next = idlePhase(slip);
    return { phase: next, yawScale: 1, boostKick };
  }

  const charge = Math.max(0, phase.charge - CHARGE_DECAY * dt);
  next = charge > 0 ? driftingPhase(charge, slip) : idlePhase(slip);
  return { phase: next, yawScale: 1, boostKick: 0 };
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
      facing: pose.facing,
      speed: 0,
      steer: 0,
      appliedSteer: 0,
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
      surface: sample.surface,
      dashRemaining: 0,
      mushroomRemaining: 0,
      driftPhase: IDLE_PHASE,
      itemPresses: 0,
      coins: 0,
      itemPrimary: null,
      itemSecondary: null,
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
    tuning: { ...DEFAULT_TUNING },
  };
}

export function setTuning(race, partial) {
  if (!race.tuning) race.tuning = { ...DEFAULT_TUNING };
  for (const key of Object.keys(TUNING_LIMITS)) {
    const value = Number(partial?.[key]);
    if (!Number.isFinite(value)) continue;
    const { min, max } = TUNING_LIMITS[key];
    race.tuning[key] = clamp(value, min, max);
  }
}

export function applyUseItem(race, msg) {
  if (race.phase !== 'racing') return;
  const kart = race.karts.find((k) => k.playerId === msg.playerId);
  if (!kart || kart.finished) return;
  kart.itemPresses += 1;
  kart.mushroomRemaining = MUSHROOM_TIME;
  raiseToCap(kart, tuningScales(race.tuning));
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
        clearDriftPose(kart);
      }
    }
  }
}

function commitContact(kart, hit) {
  kart.x = hit.x;
  kart.z = hit.z;
  kart.surface = hit.surface;
  if (hit.dashEntered) kart.dashRemaining = Math.max(kart.dashRemaining || 0, DASH_TIME);
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

function stepKart(kart, input, dt, tuning) {
  if (kart.dashRemaining > 0) kart.dashRemaining = Math.max(0, kart.dashRemaining - dt);
  if (kart.mushroomRemaining > 0) kart.mushroomRemaining = Math.max(0, kart.mushroomRemaining - dt);
  const scales = tuningScales(tuning);
  const oldPhase = kart.driftPhase || IDLE_PHASE;
  const stepped = stepDrift(oldPhase, input, kart.speed, dt, scales, kart);

  const preCap = speedCap(oldPhase, scales, kart);
  const target = input.gas ? preCap : 0;
  if (kart.speed < target) kart.speed = Math.min(target, kart.speed + ACCEL * scales.speed * dt);
  else kart.speed = Math.max(target, kart.speed - COAST * dt);

  const pace = clamp(kart.speed / Math.max(preCap, 1e-6), 0, 1);
  const cornerTurn = (kart.speed / HOLD_RADIUS) * scales.turn;
  const low = LOW_SPEED_TURN * scales.turn * (1 - pace * 0.25);
  const turn = stepped.yawScale * Math.max(low, cornerTurn);
  const follow = 1 - Math.exp(-10 * dt);
  kart.appliedSteer += (input.steer - kart.appliedSteer) * follow;
  kart.facing += kart.appliedSteer * turn * dt;

  kart.driftPhase = stepped.phase;
  if (stepped.boostKick > 0) {
    const cap = speedCap(kart.driftPhase, scales, kart);
    kart.speed = Math.min(cap, kart.speed + stepped.boostKick);
  }

  const travel = travelOf(kart.facing, kart.driftPhase.slip || 0);
  kart.x += Math.sin(travel) * kart.speed * dt;
  kart.z += Math.cos(travel) * kart.speed * dt;
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

export function placeLabel(place) {
  const n = Math.max(1, place | 0);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function viewportOrderedPlayers(race) {
  const ranked = rankKarts(race.karts);
  const placeOf = new Map(ranked.map((kart, index) => [kart.playerId, index + 1]));
  return race.karts.map((kart) => {
    const place = placeOf.get(kart.playerId) || 1;
    return {
      playerId: kart.playerId,
      name: kart.name,
      place,
      placeText: placeLabel(place),
      lap: lapNumber(kart),
      coins: clamp(kart.coins | 0, 0, 10),
      itemPrimary: kart.itemPrimary ?? null,
      itemSecondary: kart.itemSecondary ?? null,
      x: kart.x,
      z: kart.z,
      progress: kart.progress,
      characterId: kart.character.id,
      characterName: kart.character.name,
      color: kart.character.css,
      finished: kart.finished,
    };
  });
}

export function snapshot(race) {
  return {
    phase: race.phase,
    countdown: Math.max(0, Math.ceil(race.countdown)),
    results: race.results,
    lapsTotal: LAPS,
    players: viewportOrderedPlayers(race),
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
    if (kart.finished) {
      if (kart.driftPhase?.phase !== 'idle' || kart.driftPhase?.slip) clearDriftPose(kart);
      continue;
    }
    const prevX = kart.x;
    const prevZ = kart.z;
    stepKart(kart, liveInput(kart, now), step, race.tuning);
    const hit = followTrack({
      x0: prevX,
      z0: prevZ,
      x1: kart.x,
      z1: kart.z,
      seedProgress: kart.progress,
    });
    commitContact(kart, hit);
    if (hit.dashEntered) raiseToCap(kart, tuningScales(race.tuning));
    noteProgress(kart, hit.progress, true, race.timeMs);
    kart.progress = hit.progress;
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

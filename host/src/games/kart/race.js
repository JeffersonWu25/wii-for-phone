// Race state machine — pure. Steps karts, tracks checkpoints / laps, standings, wrong-way flag.
import { createKart, stepKart, resolveKartCollisions } from './physics.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const RACE_LAPS = 3;
export const COUNTDOWN_SECONDS = 3;
export const GO_SECONDS = 1;
export const FINISH_GRACE = 30; // s after the first finisher before the race ends
const MAX_DT = 0.05;
const MAX_JUMP = 20; // m of s change per step still treated as driving; more is a projection glitch
const WRONG_WAY_DOT = -0.3;
const WRONG_WAY_SHOW = 1; // s

export function formatTime(sec) {
  const total = Math.max(0, Math.round(sec * 100));
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cs = total % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function createRace(track, entrants) {
  const slots = track.gridSlots(entrants.length);
  const karts = entrants.map((e, i) => ({
    ...createKart({ id: e.id, color: e.color, slot: slots[i] }),
    name: e.name,
    lap: 0, // completed laps
    started: false, // crossed the line once
    nextCheckpoint: 0,
    lapStart: 0,
    lapTimes: [],
    finished: false,
    finishTime: null,
    place: i + 1,
    wrongWay: false,
    wrongWayTime: 0,
    progress: slots[i].s - track.length,
  }));
  return {
    phase: 'countdown',
    time: 0,
    countdown: COUNTDOWN_SECONDS,
    goTimer: 0,
    laps: RACE_LAPS,
    karts,
    standings: karts.map((k) => k.id),
    finishOrder: [],
    resultsAt: null,
  };
}

// ── Step ─────────────────────────────────────────────────────────────────────

export function stepRace(race, inputsById, dt, track, tune) {
  dt = Math.min(dt, MAX_DT);
  if (race.phase === 'finished') return;

  if (race.phase === 'countdown') {
    race.countdown -= dt;
    if (race.countdown <= 0) {
      race.countdown = 0;
      race.phase = 'racing';
      race.goTimer = GO_SECONDS;
    }
    return;
  }

  race.time += dt;
  race.goTimer = Math.max(0, race.goTimer - dt);

  const prevS = [];
  for (const kart of race.karts) {
    const input = inputsById?.[kart.id] ?? {};
    prevS.push(kart.s);
    stepKart(kart, kart.finished ? { steer: 0, throttle: 0 } : input, dt, track);
  }
  resolveKartCollisions(race.karts);

  race.karts.forEach((kart, i) => {
    if (kart.finished) return;
    trackProgress(race, kart, prevS[i], track);
    watchWrongWay(kart, dt, track);
  });

  updateStandings(race);

  const firstFinish = race.finishOrder.length > 0;
  if (firstFinish && race.resultsAt == null) race.resultsAt = race.time + FINISH_GRACE;
  if (race.finishOrder.length === race.karts.length || (race.resultsAt != null && race.time >= race.resultsAt)) {
    race.phase = 'finished';
  }
}

function forwardDelta(track, from, to) {
  let d = to - from;
  d -= track.length * Math.round(d / track.length);
  return d;
}

function trackProgress(race, kart, prevS, track) {
  const delta = forwardDelta(track, prevS, kart.s);
  if (Math.abs(delta) > MAX_JUMP) return; // not a real move: no gates, no progress
  kart.progress += delta;
  if (delta <= 0) return;

  const gate = track.checkpoints[kart.nextCheckpoint];
  let d1 = (((gate.s - prevS) % track.length) + track.length) % track.length;
  if (d1 === 0) d1 = track.length;
  if (d1 > delta) return;

  kart.nextCheckpoint = (gate.index + 1) % track.checkpoints.length;
  if (gate.index !== 0) return;
  if (!kart.started) {
    kart.started = true;
    kart.lapStart = race.time;
    return;
  }
  kart.lap += 1;
  kart.lapTimes.push(race.time - kart.lapStart);
  kart.lapStart = race.time;
  if (kart.lap >= race.laps) {
    kart.finished = true;
    kart.finishTime = race.time;
    race.finishOrder.push(kart.id);
  }
}

function watchWrongWay(kart, dt, track) {
  const fr = track.frameAt(kart.s);
  const dot = Math.cos(kart.h) * fr.fx + Math.sin(kart.h) * fr.fz;
  if (Math.abs(kart.speed) > 1 && dot < WRONG_WAY_DOT) kart.wrongWayTime += dt;
  else kart.wrongWayTime = 0;
  kart.wrongWay = kart.wrongWayTime > WRONG_WAY_SHOW;
}

function updateStandings(race) {
  const order = [...race.karts].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return race.finishOrder.indexOf(a.id) - race.finishOrder.indexOf(b.id);
    return b.progress - a.progress;
  });
  order.forEach((k, i) => {
    k.place = i + 1;
  });
  race.standings = order.map((k) => k.id);
}

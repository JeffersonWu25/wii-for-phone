// Match wiring around the rally. The rally stays the authority for the ball.
// This module only opens hit windows, judges phone swings, and advances points.

import { judgeTiming } from './timing.js';
import { nextPoint, planShot, setGrip, swing, toss, view } from './rally.js';
import { getTuning } from './tuning.js';

const SERVE_LIMIT_MS = 8000;
const CALLED_HOLD_MS = 1200;
const DEFAULT_RTT_MS = 80;
const SERVE_CONTACT_MS = 450;
const DASH = '\u2013';
const G = 9.81;

export function createFlow(match) {
  return {
    match,
    seq: 0,
    open: null,
    phaseSeen: null,
    serveAt: 0,
    calledAt: null,
    faulted: false,
    rtt: new Map(),
    sentAt: new Map(),
    lastKey: null,
    swungIds: new Set(),
  };
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function openWindow(flow, kind, playerId, contactInMs, now) {
  flow.seq += 1;
  flow.open = { kind, playerId, contactInMs, windowId: flow.seq, at: now };
}

function reconcile(flow, now) {
  const { match, open } = flow;
  if (match.phase === 'serve') {
    if (!open || open.kind !== 'toss' || open.playerId !== match.serverId || open.contactInMs !== 0) {
      openWindow(flow, 'toss', match.serverId, 0, now);
    }
    return;
  }
  if (match.phase === 'toss') {
    if (!open || open.kind !== 'serve' || open.playerId !== match.serverId || open.contactInMs !== SERVE_CONTACT_MS) {
      openWindow(flow, 'serve', match.serverId, SERVE_CONTACT_MS, now);
    }
    return;
  }
  if ((match.phase === 'called' || match.phase === 'match') && flow.open) {
    flow.open = null;
  }
}

function notePhase(flow, now) {
  const phase = flow.match.phase;
  if (phase === flow.phaseSeen) return;
  if (phase === 'serve') {
    flow.serveAt = now;
    flow.faulted = false;
  }
  if (phase === 'called') flow.calledAt = now;
  flow.phaseSeen = phase;
}

export function launch(flow, args, now) {
  const plan = planShot(flow.match, args);
  const connected = swing(flow.match, args);
  if (!connected) return;
  if (flow.match.phase !== 'flight') return;
  // A ball that is already going into the net is not a return. Leaving the
  // window open let the other phone replace the point.
  if (plan.outcome === 'net') {
    flow.open = null;
    return;
  }
  const arrive = flow.match.shot && flow.match.shot.arriveIn;
  const contactMs = (arrive > 0 ? arrive : plan.flightTime) * 1000;
  openWindow(flow, 'rally', flow.match.receiverId, contactMs, now);
}

function faultServe(flow, now) {
  const playerId = flow.match.serverId;
  toss(flow.match, playerId);
  launch(flow, {
    playerId,
    power: 0.05,
    handed: 'right',
    shape: 'flat',
    apex: 0,
  }, now);
}

export function tennisMessage(flow) {
  const snap = view(flow.match);
  const hit = flow.open;
  return {
    type: 'tennis',
    phase: snap.phase,
    scoreText: `${snap.score.pointsA} ${DASH} ${snap.score.pointsB}`,
    gamesText: `${snap.score.gamesA} ${DASH} ${snap.score.gamesB}`,
    serverId: snap.serverId,
    receiverId: snap.receiverId,
    playing: [...flow.match.sideA, ...flow.match.sideB],
    window: hit
      ? {
          playerId: hit.playerId,
          windowId: hit.windowId,
          contactInMs: hit.contactInMs,
          kind: hit.kind,
        }
      : null,
  };
}

function mark(flow, now) {
  const msg = tennisMessage(flow);
  const hit = msg.window;
  const key = [
    msg.phase,
    msg.serverId,
    msg.receiverId,
    hit ? `${hit.windowId}|${hit.playerId}|${hit.kind}|${hit.contactInMs}` : '',
  ].join('~');
  if (key === flow.lastKey) return null;
  flow.lastKey = key;
  if (hit) flow.sentAt.set(hit.windowId, now);
  return msg;
}

export function begin(flow, now) {
  notePhase(flow, now);
  reconcile(flow, now);
  return mark(flow, now);
}

export function onPhone(flow, msg, now) {
  if (!msg || typeof msg !== 'object') return null;
  const match = flow.match;

  if (msg.type === 'window_ack') {
    const sent = flow.sentAt.get(msg.windowId);
    if (sent != null && msg.playerId != null) flow.rtt.set(msg.playerId, now - sent);
    return null;
  }

  if (msg.type === 'grip') {
    if (msg.hand === 'forehand' || msg.hand === 'backhand') setGrip(match, msg.playerId, msg.hand);
    return null;
  }

  if (msg.type === 'toss') {
    if (match.phase !== 'serve' || msg.playerId !== match.serverId) return null;
    toss(match, msg.playerId);
    notePhase(flow, now);
    reconcile(flow, now);
    return mark(flow, now);
  }

  if (msg.type !== 'swing') return null;
  const hit = flow.open;
  if (!hit || msg.windowId !== hit.windowId || msg.playerId !== hit.playerId) return null;

  if (hit.kind === 'serve' || hit.kind === 'rally') {
    if (hit.kind === 'serve') {
      if (match.phase !== 'toss' || msg.playerId !== match.serverId) return null;
    } else if (match.phase !== 'flight' || msg.playerId !== match.receiverId) {
      return null;
    }
    const rttMs = flow.rtt.has(msg.playerId) ? flow.rtt.get(msg.playerId) : DEFAULT_RTT_MS;
    const timing = judgeTiming({
      swingAfterRecvMs: finite(msg.swingAfterRecvMs, 0),
      contactInMs: hit.contactInMs,
      rttMs,
    });
    launch(flow, {
      playerId: msg.playerId,
      apex: finite(msg.apex, 0),
      hand: msg.hand,
      shape: msg.shape ?? 'flat',
      power: finite(msg.power, 0),
      handed: msg.handed ?? 'right',
      timing,
    }, now);
  } else {
    return null;
  }

  notePhase(flow, now);
  reconcile(flow, now);
  return mark(flow, now);
}

// Call after step(match, dt). Opens and closes windows, faults a held serve,
// and holds a called point for 1200 ms before the next one.
function serverGone(flow, disconnectedIds) {
  const id = flow.match.serverId;
  if (disconnectedIds instanceof Set) return disconnectedIds.has(id);
  return Array.isArray(disconnectedIds) && disconnectedIds.includes(id);
}

export function afterPhysics(flow, now, disconnectedIds) {
  notePhase(flow, now);
  reconcile(flow, now);
  cpuAct(flow, now);
  const faultNow = serverGone(flow, disconnectedIds) || now - flow.serveAt >= SERVE_LIMIT_MS;
  if (flow.match.phase === 'serve' && !flow.faulted && faultNow) {
    flow.faulted = true;
    faultServe(flow, now);
    notePhase(flow, now);
    reconcile(flow, now);
  }
  if (flow.match.phase === 'called' && flow.calledAt != null && now - flow.calledAt >= CALLED_HOLD_MS) {
    nextPoint(flow.match);
    notePhase(flow, now);
    reconcile(flow, now);
  }
  return mark(flow, now);
}

export function winnerNames(flow) {
  const match = flow.match;
  if (match.phase !== 'match' || (match.winnerSide !== 'A' && match.winnerSide !== 'B')) return null;
  const ids = match.winnerSide === 'A' ? match.sideA : match.sideB;
  return ids.map((id) => match.names.get(id));
}

function aiUnit() {
  const value = Number(getTuning().aiDifficulty);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function isCpu(id) {
  return id === 'cpu' || (typeof id === 'string' && /^cpu-[1-9]\d*$/.test(id));
}

function tossWaitMs(ai) {
  return 300 + (1 - ai) * 400;
}

function reactionMs(ai) {
  return 120 + (1 - ai) * 280;
}

// Even points are early. Odd points are late. Difficulty 1 is centered.
function pointTiming(match, ai) {
  const sign = match.pointIndex % 2 === 0 ? -1 : 1;
  return sign * (1 - ai) * 0.45;
}

function sideOfId(match, id) {
  if (match.sideA.includes(id)) return 'A';
  if (match.sideB.includes(id)) return 'B';
  return null;
}

function netBodyId(match, side) {
  const place = match.placement[side];
  if (!place) return null;
  if (place.solo) return `${place.solo}~partner`;
  return place.net;
}

function baselineBodyId(match, side) {
  const place = match.placement[side];
  if (!place) return null;
  return place.solo || place.back;
}

function withinReach(actor, ball, tuning) {
  if (!actor || !ball) return false;
  if (!(ball.y <= tuning.reachY)) return false;
  return Math.hypot(ball.x - actor.x, ball.z - actor.z) <= tuning.reach + 1e-6;
}

// Same choice swing makes: the net body on an unbounced ball it can reach,
// otherwise the baseline body.
function strikerId(match, playerId) {
  const tuning = getTuning();
  if (match.phase !== 'flight') return playerId;
  const side = sideOfId(match, playerId);
  if (!side) return playerId;
  if (match.shot?.serve) return baselineBodyId(match, side) || playerId;
  const net = netBodyId(match, side);
  const bounced = (match.flight?.bounces || 0) > 0;
  if (!bounced && tuning.volleyPriority && net && match.actors.has(net) && withinReach(match.actors.get(net), match.ball, tuning)) {
    return net;
  }
  return baselineBodyId(match, side) || playerId;
}

function strikerReady(match, playerId) {
  const id = strikerId(match, playerId);
  return withinReach(match.actors.get(id), match.ball, getTuning());
}

function chaseOver(match) {
  if (match.phase !== 'flight' || !match.flight || !match.shot) return false;
  const arrive = match.shot.arriveIn;
  const limit = arrive > 0 ? arrive : match.shot.flightTime;
  return limit > 0 && match.flight.t > limit + 0.05;
}

function opponentNetClose(match, playerId) {
  const side = sideOfId(match, playerId);
  if (!side) return false;
  const id = netBodyId(match, side === 'A' ? 'B' : 'A');
  const actor = id ? match.actors.get(id) : null;
  if (!actor) return false;
  return Math.abs(actor.z) <= 7;
}

function launchVelocity(y0, landY, flightTime, apex) {
  const T = flightTime;
  const H = apex - y0;
  if (!(T > 0) || !(H > 0.02) || !(apex > landY)) {
    const ay = -G;
    const vy = T > 0 ? (landY - y0) / T - 0.5 * ay * T : 0;
    return { vy, lift: 0 };
  }
  const rise = Math.max(0, H * (apex - landY));
  const vy = (2 / T) * (H + Math.sqrt(rise));
  const ay = -2 * (vy - (landY - y0) / T) / T;
  return { vy, lift: ay + G };
}

function ballHeightAtNet(ball, plan) {
  if (!ball || !plan || !(plan.flightTime > 0)) return Infinity;
  const solved = launchVelocity(ball.y, 0, plan.flightTime, plan.apex);
  const vz = (plan.landZ - ball.z) / plan.flightTime;
  if (!(Math.abs(vz) > 1e-8)) return ball.y;
  const t = -ball.z / vz;
  const ay = -G + solved.lift;
  return ball.y + solved.vy * t + 0.5 * ay * t * t;
}

function cpuShape(match, playerId, timing, power) {
  const plan = planShot(match, {
    playerId,
    power,
    timing,
    shape: 'flat',
    apex: 0,
    handed: 'right',
  });
  const height = ballHeightAtNet(match.ball, plan);
  if (opponentNetClose(match, playerId) && height < getTuning().reachY) return 'lob';
  if (height < 1.4) return 'slice';
  return 'flat';
}

// A CPU uses the same toss and the same launch as a phone. The reaction
// delay is the soonest swing. launch goes through swing, which misses when
// the body is short, so a rally swing waits until that body can reach the
// ball or the arrival has passed. A second swing in the same window does nothing.
export function cpuAct(flow, now) {
  notePhase(flow, now);
  const ai = aiUnit();
  const match = flow.match;

  if (match.phase === 'serve' && isCpu(match.serverId) && now - flow.serveAt >= tossWaitMs(ai)) {
    toss(match, match.serverId);
    notePhase(flow, now);
    reconcile(flow, now);
  }

  const hit = flow.open;
  if (!hit || !isCpu(hit.playerId)) return;
  if (hit.kind !== 'toss' && hit.kind !== 'serve' && hit.kind !== 'rally') return;
  if (flow.swungIds.has(hit.windowId)) return;
  const opened = Number.isFinite(hit.at) ? hit.at : now;
  if (!Number.isFinite(hit.at)) hit.at = opened;
  if (now - opened < reactionMs(ai)) return;
  if (hit.kind === 'toss') return;
  if (hit.kind === 'rally' && !strikerReady(match, hit.playerId) && !chaseOver(match)) return;

  flow.swungIds.add(hit.windowId);
  const timing = pointTiming(match, ai);
  const power = 0.55 + 0.3 * ai;
  if (hit.kind === 'serve') {
    launch(flow, {
      playerId: hit.playerId,
      power,
      timing,
      shape: 'flat',
      apex: 0.9,
      handed: 'right',
    }, now);
    return;
  }
  launch(flow, {
    playerId: hit.playerId,
    power,
    timing,
    shape: cpuShape(match, hit.playerId, timing, power),
    apex: 0,
    handed: 'right',
  }, now);
}

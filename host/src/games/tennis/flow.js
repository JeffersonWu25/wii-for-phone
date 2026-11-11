// Match wiring around the rally. The rally stays the authority for the ball.
// This module only opens hit windows, judges phone swings, and advances points.

import { judgeTiming } from './timing.js';
import { nextPoint, planShot, swing, toss, view } from './rally.js';

const SERVE_LIMIT_MS = 8000;
const CALLED_HOLD_MS = 1200;
const DEFAULT_RTT_MS = 80;
const SERVE_CONTACT_MS = 450;
const DASH = '\u2013';

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
  };
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function openWindow(flow, kind, playerId, contactInMs) {
  flow.seq += 1;
  flow.open = { kind, playerId, contactInMs, windowId: flow.seq };
}

function reconcile(flow) {
  const { match, open } = flow;
  if (match.phase === 'serve') {
    if (!open || open.kind !== 'toss' || open.playerId !== match.serverId || open.contactInMs !== 0) {
      openWindow(flow, 'toss', match.serverId, 0);
    }
    return;
  }
  if (match.phase === 'toss') {
    if (!open || open.kind !== 'serve' || open.playerId !== match.serverId || open.contactInMs !== SERVE_CONTACT_MS) {
      openWindow(flow, 'serve', match.serverId, SERVE_CONTACT_MS);
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

function launch(flow, args) {
  const plan = planShot(flow.match, args);
  swing(flow.match, args);
  if (flow.match.phase !== 'flight') return;
  // A ball that is already going into the net is not a return. Leaving the
  // window open let the other phone replace the point.
  if (plan.outcome === 'net') {
    flow.open = null;
    return;
  }
  openWindow(flow, 'rally', flow.match.receiverId, plan.flightTime * 1000);
}

function faultServe(flow) {
  const playerId = flow.match.serverId;
  toss(flow.match, playerId);
  launch(flow, {
    playerId,
    power: 0.05,
    handed: 'right',
    shape: 'flat',
    apex: 0,
  });
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
  reconcile(flow);
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

  if (msg.type === 'toss') {
    if (match.phase !== 'serve' || msg.playerId !== match.serverId) return null;
    toss(match, msg.playerId);
    notePhase(flow, now);
    reconcile(flow);
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
    });
  } else {
    return null;
  }

  notePhase(flow, now);
  reconcile(flow);
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
  reconcile(flow);
  const faultNow = serverGone(flow, disconnectedIds) || now - flow.serveAt >= SERVE_LIMIT_MS;
  if (flow.match.phase === 'serve' && !flow.faulted && faultNow) {
    flow.faulted = true;
    faultServe(flow);
    notePhase(flow, now);
    reconcile(flow);
  }
  if (flow.match.phase === 'called' && flow.calledAt != null && now - flow.calledAt >= CALLED_HOLD_MS) {
    nextPoint(flow.match);
    notePhase(flow, now);
    reconcile(flow);
  }
  return mark(flow, now);
}

export function winnerNames(flow) {
  const match = flow.match;
  if (match.phase !== 'match' || (match.winnerSide !== 'A' && match.winnerSide !== 'B')) return null;
  const ids = match.winnerSide === 'A' ? match.sideA : match.sideB;
  return ids.map((id) => match.names.get(id));
}

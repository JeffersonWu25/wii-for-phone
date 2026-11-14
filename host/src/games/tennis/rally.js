// Stepwise tennis rally. A swing solves a launch velocity so the integrated
// path peaks at the planned height and bounces on the planned point.
// Movement does not integrate a scratch ball: each frame solves the live
// parabola for a volley crossing and the post-bounce racket height.

import { getTuning } from './tuning.js';

export const COURT = {
  halfLength: 11.885,
  doublesHalfWidth: 5.485,
  singlesHalfWidth: 4.115,
  serviceFromNet: 6.4,
  netCenter: 0.914,
  netPost: 1.07,
};

const G = 9.81;
const BASELINE_Z = 11.185;
const SUBSTEP = 1 / 240;
const REST_V = 0.62;
const REST_H = 0.72;
const MIN_REBOUND = 3.2;
const TOSS_Y = 1.05;
const TOSS_VY = 5.65;
const TOSS_LIMIT = 1.3;
const SWING_SECONDS = 0.35;
const SWING_CONTACT = 0.42;
const STRUCK_SECONDS = 0.12;
const VOLLEY_Y = 1.15;
const GROUND_Y = 1.05;
const SEPARATION = 1.6;
const COLORS = ['#d4534b', '#3d74d6', '#2f9d57', '#e0a02e', '#8a4ad4', '#2a9eae'];
const POINT_NAMES = ['0', '15', '30', '40'];

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pointLabel(mine, theirs) {
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40';
    return mine > theirs ? 'Ad' : '40';
  }
  return POINT_NAMES[Math.min(mine, 3)];
}

function initialPlacement(ids) {
  if (ids.length === 1) return { solo: ids[0], back: ids[0], net: null };
  return { solo: null, back: ids[0], net: ids[1] };
}

function swapEnds(place) {
  if (place.solo) return;
  const back = place.back;
  place.back = place.net;
  place.net = back;
}

function positionFor(side, role) {
  if (role === 'net') {
    return side === 'A' ? { x: -2.4, z: -5.6 } : { x: 2.4, z: 5.6 };
  }
  const z = side === 'A' ? -BASELINE_Z : BASELINE_Z;
  return { x: 0, z };
}

function partnerIdFor(id) {
  return `${id}~partner`;
}

function ownerId(id) {
  return typeof id === 'string' && id.endsWith('~partner') ? id.slice(0, -8) : id;
}

function roleOf(place, id) {
  if (place.solo) return id === partnerIdFor(place.solo) ? 'net' : 'solo';
  return place.back === id ? 'back' : 'net';
}

function sideOf(match, id) {
  if (match.sideA.includes(id)) return 'A';
  if (match.sideB.includes(id)) return 'B';
  const owner = ownerId(id);
  if (owner !== id) {
    if (match.sideA.includes(owner)) return 'A';
    if (match.sideB.includes(owner)) return 'B';
  }
  return null;
}

function baselineId(match, side) {
  const place = match.placement[side];
  return place.solo || place.back;
}

function netId(match, side) {
  const place = match.placement[side];
  if (place.solo) return partnerIdFor(place.solo);
  return place.net;
}

function gamesNeeded(bestOf) {
  return Math.ceil(bestOf / 2);
}

function placeServer(match) {
  const side = match.servingSide;
  const ids = side === 'A' ? match.sideA : match.sideB;
  const index = Math.floor(match.gameNumber / 2) % ids.length;
  match.serverId = ids[index];
  if (ids.length === 1) {
    match.placement[side] = { solo: ids[0], back: ids[0], net: null };
  } else {
    const partner = ids[0] === match.serverId ? ids[1] : ids[0];
    match.placement[side] = { solo: null, back: match.serverId, net: partner };
  }
  const receiving = side === 'A' ? 'B' : 'A';
  const spot = match.placement[receiving];
  match.receiverId = spot.solo || spot.back;
}

function makeActor(side, role, controlledBy) {
  const pos = positionFor(side, role);
  return {
    x: pos.x,
    z: pos.z,
    vx: 0,
    vz: 0,
    speed: 0,
    homeX: pos.x,
    homeZ: pos.z,
    aimX: pos.x,
    aimZ: pos.z,
    travel: 0,
    grip: null,
    faceYaw: null,
    facePitch: null,
    struckLeft: 0,
    handed: 'right',
    controlledBy,
    cooldown: 0,
  };
}

function syncHomes(match) {
  for (const side of ['A', 'B']) {
    const place = match.placement[side];
    const ids = side === 'A' ? match.sideA : match.sideB;
    for (const id of ids) {
      const actor = match.actors.get(id);
      if (!actor) continue;
      const pos = positionFor(side, roleOf(place, id));
      actor.homeX = pos.x;
      actor.homeZ = pos.z;
    }
    if (place.solo) {
      const partner = match.actors.get(partnerIdFor(place.solo));
      if (!partner) continue;
      const pos = positionFor(side, 'net');
      partner.homeX = pos.x;
      partner.homeZ = pos.z;
    }
  }
}

function seatActors(match) {
  match.actors = new Map();
  for (const side of ['A', 'B']) {
    const ids = side === 'A' ? match.sideA : match.sideB;
    const place = match.placement[side];
    for (const id of ids) {
      match.actors.set(id, makeActor(side, roleOf(place, id), id));
    }
    if (!place.solo) continue;
    const partnerId = partnerIdFor(place.solo);
    match.actors.set(partnerId, makeActor(side, 'net', place.solo));
    if (!match.names.has(partnerId)) match.names.set(partnerId, match.names.get(place.solo));
    if (!match.colors.has(partnerId)) match.colors.set(partnerId, match.colors.get(place.solo));
  }
}

function swingTOf(match, id) {
  if (match.swingingId !== id || !(match.swingLeft > 0)) return -1;
  return clamp(1 - match.swingLeft / SWING_SECONDS, 0, 1);
}

function playerSpot(match, id, side) {
  const place = match.placement[side];
  const role = roleOf(place, id);
  const actor = match.actors.get(id);
  const home = positionFor(side, role);
  const swingT = swingTOf(match, id);
  const swinging = swingT >= 0;
  let hand = actor?.grip || 'forehand';
  if (swinging && (match.swingHand === 'forehand' || match.swingHand === 'backhand')) {
    hand = match.swingHand;
  }
  return {
    id,
    name: match.names.get(id),
    side,
    role,
    x: actor ? actor.x : home.x,
    z: actor ? actor.z : home.z,
    homeX: actor ? actor.homeX : home.x,
    homeZ: actor ? actor.homeZ : home.z,
    speed: actor ? actor.speed : 0,
    travel: actor ? actor.travel : 0,
    hand,
    handed: actor?.handed === 'left' ? 'left' : 'right',
    shape: swinging ? match.swingShape : null,
    swingT,
    faceYaw: actor ? actor.faceYaw : null,
    facePitch: actor ? actor.facePitch : null,
    struck: !!(actor && actor.struckLeft > 0),
    color: match.colors.get(id),
    swinging,
    controlledBy: actor?.controlledBy || id,
  };
}

function sideRoster(match, side) {
  const ids = side === 'A' ? match.sideA : match.sideB;
  const spots = ids.map((id) => playerSpot(match, id, side));
  const place = match.placement[side];
  if (place.solo) spots.push(playerSpot(match, partnerIdFor(place.solo), side));
  return spots;
}

export function createMatch({ players, sideA, sideB, bestOf }) {
  const sizeOk = (sideA.length === 1 && sideB.length === 1)
    || (sideA.length === 2 && sideB.length === 2)
    || (sideA.length === 1 && sideB.length === 2)
    || (sideA.length === 2 && sideB.length === 1);
  if (!sizeOk || !(bestOf === 1 || bestOf === 3 || bestOf === 5)) {
    throw new Error('Tennis match must be 1v1, 1v2, or 2v2 and best of 1, 3, or 5');
  }
  const names = new Map();
  for (const player of players) names.set(player.id, player.name);
  for (const id of [...sideA, ...sideB]) {
    if (!names.has(id)) throw new Error('Tennis match must be 1v1, 1v2, or 2v2 and best of 1, 3, or 5');
  }
  const colors = new Map();
  [...sideA, ...sideB].forEach((id, index) => {
    colors.set(id, COLORS[index % COLORS.length]);
  });
  const format = sideA.length === 2 && sideB.length === 2
    ? '2v2'
    : sideA.length === 1 && sideB.length === 1
      ? '1v1'
      : '1v2';
  const match = {
    names,
    colors,
    sideA: [...sideA],
    sideB: [...sideB],
    format,
    bestOf,
    gameNumber: 0,
    servingSide: 'A',
    pointIndex: 0,
    pointsA: 0,
    pointsB: 0,
    gamesA: 0,
    gamesB: 0,
    winnerSide: null,
    phase: 'serve',
    call: null,
    ball: null,
    flight: null,
    shot: null,
    swingingId: null,
    swingLeft: 0,
    swingHand: null,
    swingShape: null,
    tossT: 0,
    gameJustWon: false,
    placement: {
      A: initialPlacement(sideA),
      B: initialPlacement(sideB),
    },
    serverId: null,
    receiverId: null,
  };
  placeServer(match);
  seatActors(match);
  return match;
}

export function view(match) {
  const players = [...sideRoster(match, 'A'), ...sideRoster(match, 'B')];
  return {
    phase: match.phase,
    format: match.format,
    bestOf: match.bestOf,
    servingSide: match.servingSide,
    pointIndex: match.pointIndex,
    serverId: match.serverId,
    receiverId: match.receiverId,
    winnerSide: match.winnerSide,
    ball: match.ball
      ? {
          x: match.ball.x,
          y: match.ball.y,
          z: match.ball.z,
          vx: match.ball.vx,
          vy: match.ball.vy,
          vz: match.ball.vz,
          fast: match.ball.fast === true,
        }
      : null,
    players,
    score: {
      pointsA: pointLabel(match.pointsA, match.pointsB),
      pointsB: pointLabel(match.pointsB, match.pointsA),
      gamesA: match.gamesA,
      gamesB: match.gamesB,
    },
    call: match.call,
    flight: match.flight ? { bounces: match.flight.bounces, t: match.flight.t } : null,
  };
}

function shapedPower(power, sensitivity) {
  return clamp(0.18 + (power - 0.18) * sensitivity, 0, 1);
}

function rallyShape(shape, lobSlice) {
  if (shape === 'lob') {
    return {
      apex: 2.4 + (6.2 - 2.4) * lobSlice,
      flightTime: 1.05 + (1.45 - 1.05) * lobSlice,
    };
  }
  if (shape === 'slice') {
    return {
      apex: 2.4 + (1.25 - 2.4) * lobSlice,
      flightTime: 1.05 + (0.85 - 1.05) * lobSlice,
    };
  }
  return { apex: 2.4, flightTime: 1.05 };
}

// Early cross-court: side A forehand is -x, side A backhand is +x. Side B flips both.
// Late is the opposite sign. A centered swing stays on x = 0.
function rallyLandX(side, hand, timing, mag) {
  if (!(mag > 0) || !(timing < 0 || timing > 0)) return 0;
  let sign = hand === 'backhand' ? 1 : -1;
  if (side === 'B') sign = -sign;
  if (timing > 0) sign = -sign;
  return sign * mag;
}

export function planShot(match, swing) {
  const tuning = getTuning();
  const power = clamp(Number(swing.power ?? 0), 0, 1);
  const apexHit = clamp(Number(swing.apex ?? 0), 0, 1);
  const timing = clamp(Number(swing.timing ?? 0), -1, 1);
  const side = sideOf(match, swing.playerId);
  const toward = side === 'A' ? 1 : -1;
  if (match.phase === 'toss') {
    const fast = apexHit >= 0.85;
    const apex = fast ? 1.6 : 2.8;
    const flightTime = fast ? 0.62 : 0.95;
    if (power < 0.2) {
      return { outcome: 'net', landX: 0, landZ: 0, apex, flightTime, fast };
    }
    const deuce = match.pointIndex % 2 === 0;
    const boxSign = deuce ? 1 : -1;
    const xSign = side === 'A' ? boxSign : -boxSign;
    const landX = xSign * (2.0 + timing * 2.6);
    const landZ = toward * (3.2 + 1.4 * (1 - Math.abs(timing)));
    const wide = Math.abs(landX) > COURT.singlesHalfWidth;
    return { outcome: wide ? 'out' : 'in', landX, landZ, apex, flightTime, fast };
  }
  if (power < 0.18) {
    return { outcome: 'net', landX: 0, landZ: 0, apex: 1, flightTime: 0.4, fast: false };
  }
  const shaped = shapedPower(power, tuning.powerSensitivity);
  const depth = 2.5 + 8.2 * ((shaped - 0.18) / 0.82);
  const bodyId = strikerBody(match, swing.playerId, tuning);
  const hand = strokeHand(side, match.actors.get(bodyId), match.ball, swing.handed);
  const mag = Math.abs(timing) * (2.4 + 3.2 * shaped) * tuning.directionSensitivity;
  const landX = rallyLandX(side, hand, timing, mag);
  const landZ = toward * depth;
  const half = match.format === '1v1' ? COURT.singlesHalfWidth : COURT.doublesHalfWidth;
  const out = Math.abs(landX) > half || Math.abs(landZ) > COURT.halfLength;
  const shape = swing.shape === 'lob' || swing.shape === 'slice' ? swing.shape : 'flat';
  const flight = rallyShape(shape, tuning.lobSlice);
  return { outcome: out ? 'out' : 'in', landX, landZ, apex: flight.apex, flightTime: flight.flightTime, fast: false };
}

export function setGrip(match, playerId, hand) {
  const actor = match.actors?.get(playerId);
  if (!actor) return;
  if (hand === 'forehand' || hand === 'backhand') actor.grip = hand;
}

function inReach(match, playerId, tuning) {
  const actor = match.actors.get(playerId);
  const ball = match.ball;
  if (!actor || !ball) return false;
  if (!(ball.y <= tuning.reachY)) return false;
  return Math.hypot(ball.x - actor.x, ball.z - actor.z) <= tuning.reach + 1e-6;
}

function strokeHand(side, actor, ball, handed) {
  const who = handed === 'left' || handed === 'right'
    ? handed
    : (actor?.handed === 'left' ? 'left' : 'right');
  if (!actor || !ball) return 'forehand';
  const dx = (ball.x - actor.x) * (side === 'A' ? 1 : -1);
  const forehand = who === 'left' ? dx < 0.05 : dx > -0.05;
  return forehand ? 'forehand' : 'backhand';
}

function strikerBody(match, humanId, tuning) {
  if (inReach(match, humanId, tuning)) return humanId;
  const bounced = (match.flight?.bounces || 0) > 0;
  const partnerId = partnerIdFor(humanId);
  if (!bounced && tuning.volleyPriority && match.actors.has(partnerId) && inReach(match, partnerId, tuning)) {
    return partnerId;
  }
  return humanId;
}

export function toss(match, playerId) {
  if (match.phase !== 'serve' || playerId !== match.serverId) return;
  const server = playerSpot(match, playerId, match.servingSide);
  match.phase = 'toss';
  match.ball = {
    x: server.x,
    y: TOSS_Y,
    z: server.z,
    vx: 0,
    vy: TOSS_VY,
    vz: 0,
    lift: 0,
  };
  match.tossT = 0;
  match.swingingId = null;
  match.swingLeft = 0;
}

// Closed-form aim. y(t) = y0 + vy t + 1/2 (lift - G) t^2 peaks at `apex`
// and equals landY at t = flightTime. Horizontal speed is displacement / time.
function launchVelocity(y0, landY, flightTime, apex) {
  const T = flightTime;
  const H = apex - y0;
  if (!(H > 0.02) || !(apex > landY)) {
    const ay = -G;
    const vy = (landY - y0) / T - 0.5 * ay * T;
    return { vy, lift: 0 };
  }
  const rise = Math.max(0, H * (apex - landY));
  const vy = (2 / T) * (H + Math.sqrt(rise));
  const ay = -2 * (vy - (landY - y0) / T) / T;
  return { vy, lift: ay + G };
}

function receiverFor(match, hitterSide, plan, isServe) {
  const receiving = hitterSide === 'A' ? 'B' : 'A';
  const spot = match.placement[receiving];
  if (spot.solo) return spot.solo;
  if (isServe) return spot.back;
  if (Math.abs(plan.landZ) < COURT.serviceFromNet) return spot.net;
  return spot.back;
}

function beginSwing(match, bodyId, hand, input, isServe) {
  match.swingingId = bodyId;
  match.swingLeft = SWING_SECONDS * (1 - SWING_CONTACT);
  match.swingHand = hand;
  match.swingShape = isServe
    ? 'serve'
    : (input.shape === 'lob' || input.shape === 'slice' ? input.shape : 'flat');
  const actor = match.actors.get(bodyId);
  if (actor) actor.handed = input.handed === 'left' ? 'left' : 'right';
}

export function swing(match, input) {
  const tuning = getTuning();
  const playerId = input.playerId;
  const isServe = match.phase === 'toss';
  if (isServe) {
    if (playerId !== match.serverId) return false;
  } else if (match.phase === 'flight') {
    if (playerId !== match.receiverId) return false;
  } else {
    return false;
  }
  const hitterSide = sideOf(match, playerId);
  if (!hitterSide || !match.ball) return false;
  const human = match.actors.get(playerId);
  if (human?.cooldown > 0) return false;
  const bodyId = strikerBody(match, playerId, tuning);
  const body = match.actors.get(bodyId);
  if (body) body.handed = input.handed === 'left' ? 'left' : 'right';
  const hand = strokeHand(hitterSide, body, match.ball, input.handed);
  beginSwing(match, bodyId, hand, input, isServe);
  if (human) human.cooldown = tuning.swingCooldown;
  if (!inReach(match, bodyId, tuning)) return false;
  const plan = planShot(match, input);
  const ball = match.ball;
  if (ball.y < 0 && ball.y >= -0.02) ball.y = 0;
  if (plan.outcome === 'net') {
    const T = 0.35;
    const landY = 0.5;
    ball.vx = (0 - ball.x) / T;
    ball.vz = (0 - ball.z) / T;
    ball.vy = (landY - ball.y) / T + 0.5 * G * T;
    ball.lift = 0;
  } else {
    const solved = launchVelocity(ball.y, 0, plan.flightTime, plan.apex);
    ball.vx = (plan.landX - ball.x) / plan.flightTime;
    ball.vz = (plan.landZ - ball.z) / plan.flightTime;
    ball.vy = solved.vy;
    ball.lift = solved.lift;
  }
  ball.fast = plan.fast === true;
  const actor = match.actors.get(bodyId);
  if (actor) {
    const horizontal = Math.hypot(ball.vx, ball.vz);
    actor.faceYaw = Math.atan2(ball.vx, ball.vz);
    actor.facePitch = Math.atan2(ball.vy, horizontal);
    actor.struckLeft = STRUCK_SECONDS;
  }
  match.phase = 'flight';
  match.flight = { bounces: 0, t: 0 };
  match.call = null;
  match.shot = {
    outcome: plan.outcome,
    hitterSide,
    landX: plan.landX,
    landZ: plan.landZ,
    flightTime: plan.flightTime,
    serve: isServe,
    fast: plan.fast === true,
  };
  match.receiverId = receiverFor(match, hitterSide, plan, isServe);
  if (!isServe && plan.outcome !== 'net') {
    const chase = chooseContact(match, tuning);
    if (chase) match.receiverId = ownerId(chase.id);
  }
  return true;
}

function endPoint(match, scoringSide, call) {
  if (match.phase !== 'flight') return;
  match.call = call;
  if (scoringSide === 'A') match.pointsA += 1;
  else match.pointsB += 1;
  const a = match.pointsA;
  const b = match.pointsB;
  const hi = Math.max(a, b);
  const lead = Math.abs(a - b);
  if (hi >= 4 && lead >= 2) {
    if (a > b) match.gamesA += 1;
    else match.gamesB += 1;
    match.pointsA = 0;
    match.pointsB = 0;
    match.gameJustWon = true;
    const need = gamesNeeded(match.bestOf);
    if (match.gamesA >= need) match.winnerSide = 'A';
    else if (match.gamesB >= need) match.winnerSide = 'B';
  }
  match.phase = 'called';
}

// Roots of y + vy t + 1/2 ay t^2 = target. Same quadratic timeToGround uses.
function parabolaRoots(y, vy, ay, target) {
  const a = 0.5 * ay;
  const c = y - target;
  if (!(Math.abs(a) > 1e-12)) {
    if (!(Math.abs(vy) > 1e-8)) return [];
    return [-c / vy];
  }
  const disc = vy * vy - 4 * a * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-vy - s) / (2 * a), (-vy + s) / (2 * a)];
}

function timeToGround(y, vy, ay, h) {
  const roots = parabolaRoots(y, vy, ay, 0).filter((k) => k >= -1e-8 && k <= h + 1e-8);
  if (roots.length && Math.abs(0.5 * ay) > 1e-12) {
    return Math.min(...roots.map((k) => clamp(k, 0, h)));
  }
  if (Math.abs(vy) > 1e-8) {
    const k = -y / vy;
    if (k >= 0 && k <= h) return k;
  }
  return h;
}

function futureTimes(y, vy, ay, target) {
  return parabolaRoots(y, vy, ay, target)
    .filter((t) => t >= -1e-7)
    .map((t) => (t < 0 ? 0 : t));
}

function onReceiveSide(z, side) {
  return side === 'A' ? z <= 1e-4 : z >= -1e-4;
}

function nextBounceTime(ball, ay) {
  const times = futureTimes(ball.y, ball.vy, ay, 0).filter((t) => t > 1e-3);
  if (!times.length) return null;
  return Math.min(...times);
}

// Closed form. Volley is the pre-bounce y=1.15 crossing on the receiving side.
// Groundstroke applies one bounce, then the later rise through y=1.05.
function solveZones(ball, side, bounces, knownBounce) {
  const ay = -G + (ball.lift || 0);
  const tb = nextBounceTime(ball, ay);
  let volley = null;
  if ((bounces || 0) === 0) {
    const hits = futureTimes(ball.y, ball.vy, ay, VOLLEY_Y)
      .filter((t) => tb == null || t < tb - 1e-4)
      .map((t) => ({
        t,
        x: ball.x + ball.vx * t,
        z: ball.z + ball.vz * t,
        vy: ball.vy + ay * t,
      }))
      .filter((point) => onReceiveSide(point.z, side));
    if (hits.length) {
      hits.sort((a, b) => a.t - b.t);
      volley = hits.find((point) => point.vy <= 0.05) || hits[0];
    }
  }
  let ground = null;
  if ((bounces || 0) === 0 && tb != null) {
    const vyImpact = ball.vy + ay * tb;
    const vyR = Math.max(MIN_REBOUND, -vyImpact * REST_V);
    const vxR = ball.vx * REST_H;
    const vzR = ball.vz * REST_H;
    const xb = ball.x + ball.vx * tb;
    const zb = ball.z + ball.vz * tb;
    const ups = futureTimes(0, vyR, -G, GROUND_Y)
      .map((t) => ({ t, vy: vyR - G * t }))
      .filter((point) => point.vy > 0)
      .sort((a, b) => a.t - b.t);
    if (ups.length && onReceiveSide(zb + vzR * ups[0].t, side)) {
      const t = ups[0].t;
      ground = { t: tb + t, x: xb + vxR * t, z: zb + vzR * t };
    }
  } else if ((bounces || 0) >= 1) {
    const ups = futureTimes(ball.y, ball.vy, ay, GROUND_Y)
      .map((t) => ({
        t,
        x: ball.x + ball.vx * t,
        z: ball.z + ball.vz * t,
        vy: ball.vy + ay * t,
      }))
      .filter((point) => point.vy > 0 && onReceiveSide(point.z, side))
      .sort((a, b) => a.t - b.t);
    if (ups.length) ground = ups[0];
  }
  let bounce = null;
  if ((bounces || 0) === 0 && tb != null) {
    bounce = { t: tb, x: ball.x + ball.vx * tb, z: ball.z + ball.vz * tb };
  } else if ((bounces || 0) >= 1) {
    bounce = knownBounce
      ? { t: 0, x: knownBounce.x, z: knownBounce.z }
      : { t: 0, x: ball.x, z: ball.z };
  }
  return { volley, ground, bounce };
}

// Time to cover `dist` from rest: ramp to moveSpeed, then cruise. No braking.
function coverTime(dist, moveSpeed, accel) {
  if (!(dist > 1e-6)) return 0;
  const ramp = (moveSpeed * moveSpeed) / (2 * accel);
  if (dist <= ramp) return Math.sqrt((2 * dist) / accel);
  return moveSpeed / accel + (dist - ramp) / moveSpeed;
}

function spareTime(actor, point, tuning) {
  const dist = Math.hypot(point.x - actor.x, point.z - actor.z);
  return point.t - coverTime(dist, tuning.moveSpeed, tuning.accel) - tuning.interceptLead;
}

// Racket height only when it is within 1 m of the bounce. Otherwise the bounce.
function pointBesideBounce(racket, bounce) {
  if (racket && bounce && Math.hypot(racket.x - bounce.x, racket.z - bounce.z) <= 1) return racket;
  return bounce || racket || null;
}

function receivingSide(match) {
  if (!match.shot) return null;
  return match.shot.hitterSide === 'A' ? 'B' : 'A';
}

function chooseContact(match, tuning) {
  if (match.phase !== 'flight' || !match.ball || !match.shot) return null;
  const side = receivingSide(match);
  if (!side) return null;
  const ai = clamp(tuning.aiDifficulty, 0, 1);
  const delay = (1 - ai) * 0.35;
  if ((match.flight?.t || 0) < delay) return null;
  const serve = match.shot.serve === true;
  const zones = solveZones(match.ball, side, match.flight?.bounces || 0, match.flight?.bounce);
  const baseId = baselineId(match, side);
  const net = netId(match, side);
  const baseline = match.actors.get(baseId);
  const netBody = net ? match.actors.get(net) : null;
  // A volley is a crossing in front of the net player. A ball dropping behind them is a groundstroke.
  const volleyInFront = zones.volley && netBody
    && Math.abs(zones.volley.z) < Math.abs(netBody.homeZ) - 0.4;
  if (!serve && tuning.volleyPriority && volleyInFront) {
    const spare = spareTime(netBody, zones.volley, tuning);
    if (spare >= 0) {
      return finishContact(match, {
        id: net, spare, point: zones.volley, kind: 'volley',
      }, side, ai);
    }
  }
  if (!baseline) return null;
  const point = pointBesideBounce(zones.ground, zones.bounce);
  if (!point) return null;
  return finishContact(match, {
    id: baseId,
    spare: spareTime(baseline, point, tuning),
    point,
    kind: 'ground',
  }, side, ai);
}

function finishContact(match, option, side, ai) {
  const sign = match.pointIndex % 2 === 0 ? 1 : -1;
  const shift = (1 - ai) * 0.6 * sign;
  const spot = clampSide(match, side, option.point.x, option.point.z);
  const aim = clampSide(match, side, option.point.x + shift, option.point.z);
  return {
    id: option.id,
    side,
    kind: option.kind,
    t: option.point.t,
    x: spot.x,
    z: spot.z,
    aimX: aim.x,
    aimZ: aim.z,
    spare: option.spare,
  };
}

export function plannedContact(match) {
  return chooseContact(match, getTuning());
}

function onBounce(match) {
  const outcome = match.shot.outcome;
  const n = match.flight.bounces;
  if (n === 1 && outcome === 'out') {
    const other = match.shot.hitterSide === 'A' ? 'B' : 'A';
    endPoint(match, other, 'Out');
    return;
  }
  if (n === 1 && outcome === 'net') {
    const other = match.shot.hitterSide === 'A' ? 'B' : 'A';
    endPoint(match, other, 'Net');
    return;
  }
  if (n >= 2 && outcome === 'in') {
    endPoint(match, match.shot.hitterSide, null);
  }
}

function netTape(x) {
  const span = COURT.doublesHalfWidth;
  const u = span > 0 ? clamp(Math.abs(x) / span, 0, 1) : 0;
  return COURT.netCenter + (COURT.netPost - COURT.netCenter) * u;
}

function stopAtNet(match, h, prevZ, ay) {
  const ball = match.ball;
  const z1 = ball.z + ball.vz * h;
  const dz = z1 - prevZ;
  const f = dz === 0 ? 1 : clamp((0 - prevZ) / dz, 0, 1);
  const k = f * h;
  ball.x += ball.vx * k;
  ball.z = 0;
  ball.y += ball.vy * k + 0.5 * ay * k * k;
  ball.vy += ay * k;
  const other = match.shot.hitterSide === 'A' ? 'B' : 'A';
  endPoint(match, other, 'Net');
}

function advance(match, h) {
  const ball = match.ball;
  const ay = -G + ball.lift;
  if (match.flight) match.flight.t += h;
  const prevZ = ball.z;
  const y1 = ball.y + ball.vy * h + 0.5 * ay * h * h;
  const z1 = ball.z + ball.vz * h;

  if (match.phase === 'flight' && match.shot && (prevZ === 0 || prevZ * z1 <= 0)) {
    const outcome = match.shot.outcome;
    if (outcome === 'net') {
      stopAtNet(match, h, prevZ, ay);
      return;
    }
    if (!match.shot.serve && (outcome === 'in' || outcome === 'out')) {
      const dz = z1 - prevZ;
      const f = dz === 0 ? 1 : clamp((0 - prevZ) / dz, 0, 1);
      const k = f * h;
      const yAt = ball.y + ball.vy * k + 0.5 * ay * k * k;
      const xAt = ball.x + ball.vx * k;
      if (yAt < netTape(xAt)) {
        stopAtNet(match, h, prevZ, ay);
        return;
      }
    }
  }

  if (ballCanBounce(match) && ball.y > 0 && y1 <= 0) {
    const k = timeToGround(ball.y, ball.vy, ay, h);
    ball.x += ball.vx * k;
    ball.z += ball.vz * k;
    ball.vy += ay * k;
    ball.y = 0;
    const rebound = Math.max(MIN_REBOUND, -ball.vy * REST_V);
    ball.vy = rebound;
    ball.vx *= REST_H;
    ball.vz *= REST_H;
    ball.lift = 0;
    match.flight.bounces += 1;
    if (match.flight.bounces === 1) match.flight.bounce = { x: ball.x, z: ball.z };
    onBounce(match);
    const rem = h - k;
    if (rem > 1e-8 && ballStillGoing(match)) {
      ball.x += ball.vx * rem;
      ball.z += ball.vz * rem;
      ball.y += ball.vy * rem + 0.5 * (-G) * rem * rem;
      ball.vy += -G * rem;
    }
    return;
  }

  ball.x += ball.vx * h;
  ball.z = z1;
  ball.y = y1;
  ball.vy += ay * h;

  if (match.phase === 'flight' && match.shot.outcome === 'net' && match.flight.t >= match.shot.flightTime + 0.05) {
    const other = match.shot.hitterSide === 'A' ? 'B' : 'A';
    endPoint(match, other, 'Net');
  }
}

// Same clearing nextPoint uses when a point is about to be served again.
function resetServe(match) {
  match.phase = 'serve';
  match.call = null;
  match.ball = null;
  match.flight = null;
  match.shot = null;
  match.swingingId = null;
  match.swingLeft = 0;
  match.swingHand = null;
  match.swingShape = null;
  match.tossT = 0;
  placeServer(match);
  syncHomes(match);
  if (match.actors) {
    for (const actor of match.actors.values()) actor.travel = 0;
  }
}

function decaySwing(match, dt) {
  if (!(match.swingLeft > 0)) return;
  match.swingLeft -= dt;
  if (match.swingLeft <= 0) {
    match.swingLeft = 0;
    match.swingingId = null;
  }
}

// An out ball keeps bouncing after the call. A net stays where it stopped,
// and an in-point has already ended on its second bounce.
function ballStillGoing(match) {
  if (match.phase === 'toss' || match.phase === 'flight') return true;
  if (match.phase !== 'called' || match.call !== 'Out' || !match.ball || !match.flight) return false;
  if (match.flight.bounces >= 3) return false;
  if (match.ball.y <= 0 && !(match.ball.vy > 0)) return false;
  return true;
}

function ballCanBounce(match) {
  if (match.phase === 'flight') return true;
  return match.phase === 'called' && match.call === 'Out' && match.flight && match.flight.bounces < 3;
}

function moveActor(actor, target, dt, top, accel) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) {
    const speed = actor.speed;
    const drop = Math.min(speed, accel * dt);
    if (speed > 1e-8) {
      const scale = (speed - drop) / speed;
      actor.vx *= scale;
      actor.vz *= scale;
    } else {
      actor.vx = 0;
      actor.vz = 0;
    }
    actor.speed = Math.hypot(actor.vx, actor.vz);
    return;
  }
  const dirx = dx / dist;
  const dirz = dz / dist;
  // Stop short of the spot instead of skating through it. Same limit both ways.
  const want = Math.min(top, Math.sqrt(2 * accel * dist));
  let dvx = dirx * want - actor.vx;
  let dvz = dirz * want - actor.vz;
  const dv = Math.hypot(dvx, dvz);
  const maxDv = accel * dt;
  if (dv > maxDv && dv > 0) {
    const scale = maxDv / dv;
    dvx *= scale;
    dvz *= scale;
  }
  actor.vx += dvx;
  actor.vz += dvz;
  let speed = Math.hypot(actor.vx, actor.vz);
  if (speed > top) {
    actor.vx *= top / speed;
    actor.vz *= top / speed;
    speed = top;
  }
  actor.speed = speed;
  let mx = actor.vx * dt;
  let mz = actor.vz * dt;
  const toward = mx * dirx + mz * dirz;
  if (toward >= dist) {
    actor.x = target.x;
    actor.z = target.z;
    actor.travel += dist;
    actor.vx = 0;
    actor.vz = 0;
    actor.speed = 0;
    return;
  }
  actor.x += mx;
  actor.z += mz;
  actor.travel += Math.hypot(mx, mz);
}

function courtHalfWidth(match) {
  return match.format === '1v1' ? COURT.singlesHalfWidth : COURT.doublesHalfWidth;
}

function clampSide(match, side, x, z) {
  const half = courtHalfWidth(match);
  return {
    x: clamp(x, -half, half),
    z: side === 'A' ? clamp(z, -BASELINE_Z, 0) : clamp(z, 0, BASELINE_Z),
  };
}

function segmentClosest(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-8) return { x: ax, z: az, dist: Math.hypot(px - ax, pz - az) };
  const u = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  const x = ax + dx * u;
  const z = az + dz * u;
  return { x, z, dist: Math.hypot(px - x, pz - z) };
}

function pushApart(match, side, self, other) {
  let dx = self.x - other.x;
  let dz = self.z - other.z;
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-4) {
    dx = side === 'A' ? -1 : 1;
    dz = 0;
    dist = 1;
  }
  let spot = clampSide(match, side, other.x + (dx / dist) * SEPARATION, other.z + (dz / dist) * SEPARATION);
  if (Math.hypot(spot.x - other.x, spot.z - other.z) < SEPARATION - 0.05) {
    const sign = dx >= 0 ? 1 : -1;
    spot = clampSide(match, side, other.x + sign * SEPARATION, other.z);
  }
  return spot;
}

function movePlayers(match, dt, tuning) {
  if (!match.actors) return;
  syncHomes(match);
  for (const actor of match.actors.values()) {
    if (actor.struckLeft > 0) actor.struckLeft = Math.max(0, actor.struckLeft - dt);
    if (actor.cooldown > 0) actor.cooldown = Math.max(0, actor.cooldown - dt);
  }
  const chase = chooseContact(match, tuning);
  match.contact = chase;
  for (const [id, actor] of match.actors) {
    const side = sideOf(match, id);
    const holdStill = match.phase === 'match' || (match.phase === 'toss' && id === match.serverId);
    if (holdStill) {
      actor.vx = 0;
      actor.vz = 0;
      actor.speed = 0;
      actor.aimX = actor.x;
      actor.aimZ = actor.z;
      continue;
    }
    const mate = teammate(match, id);
    const chasing = chase && id === chase.id;
    let target = { x: actor.homeX, z: actor.homeZ };
    let top = tuning.walkSpeed;
    if (chasing) {
      target = { x: chase.aimX, z: chase.aimZ };
      top = tuning.moveSpeed;
    }
    if (!chasing && mate && side) {
      const mateId = teammateId(match, id);
      const mateAim = chase && chase.id === mateId
        ? { x: chase.aimX, z: chase.aimZ }
        : { x: mate.homeX, z: mate.homeZ };
      const mateMoving = (chase && chase.id === mateId) || mate.speed > 0.2;
      const near = segmentClosest(actor.x, actor.z, mate.x, mate.z, mateAim.x, mateAim.z);
      if (mateMoving && near.dist < SEPARATION) {
        target = pushApart(match, side, actor, { x: near.x, z: near.z });
        top = tuning.moveSpeed;
      }
    }
    actor.aimX = target.x;
    actor.aimZ = target.z;
    moveActor(actor, target, dt, top, tuning.accel);
  }
}

function teammateId(match, id) {
  const side = sideOf(match, id);
  if (!side) return null;
  const ids = side === 'A' ? [...match.sideA] : [...match.sideB];
  const place = match.placement[side];
  if (place.solo) ids.push(partnerIdFor(place.solo));
  return ids.find((candidate) => candidate !== id) || null;
}

function teammate(match, id) {
  const other = teammateId(match, id);
  return other ? match.actors.get(other) : null;
}

export function step(match, dt) {
  if (!(dt > 0)) return;
  const tuning = getTuning();
  decaySwing(match, dt);
  movePlayers(match, dt, tuning);
  if (!match.ball) return;

  if (match.phase === 'toss') {
    const room = TOSS_LIMIT - match.tossT;
    if (!(room > 0)) {
      resetServe(match);
      return;
    }
    let left = Math.min(dt, room);
    while (left > 1e-12) {
      const h = Math.min(SUBSTEP, left);
      advance(match, h);
      match.tossT += h;
      left -= h;
      if (match.phase !== 'toss') break;
    }
    if (match.phase === 'toss' && match.tossT >= TOSS_LIMIT - 1e-8) resetServe(match);
    return;
  }

  if (!ballStillGoing(match)) return;
  let left = dt;
  while (left > 1e-12) {
    const h = Math.min(SUBSTEP, left);
    advance(match, h);
    left -= h;
    if (!ballStillGoing(match)) break;
  }
}

export function nextPoint(match) {
  if (match.phase !== 'called') return;
  if (match.winnerSide) {
    match.phase = 'match';
    return;
  }
  if (match.gameJustWon) {
    match.gameNumber += 1;
    match.servingSide = match.gameNumber % 2 === 0 ? 'A' : 'B';
    const receiving = match.servingSide === 'A' ? 'B' : 'A';
    swapEnds(match.placement[receiving]);
    match.pointIndex = 0;
    match.gameJustWon = false;
  } else {
    match.pointIndex += 1;
  }
  resetServe(match);
}

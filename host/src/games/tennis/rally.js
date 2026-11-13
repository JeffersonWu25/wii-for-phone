// Stepwise tennis rally. A swing solves a launch velocity so the integrated
// path peaks at the planned height and bounces on the planned point.
// After that, step() only adds gravity (plus a constant lift) and integrates.

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
const TOP_SPEED = 11;
const WALK_SPEED = 4;
const ACCEL = 45;
const REACH = 1.75;
const REACH_Y = 3.2;
const STRUCK_SECONDS = 0.12;
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

function roleOf(place, id) {
  if (place.solo) return 'solo';
  return place.back === id ? 'back' : 'net';
}

function sideOf(match, id) {
  if (match.sideA.includes(id)) return 'A';
  if (match.sideB.includes(id)) return 'B';
  return null;
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

function makeActor(side, role) {
  const pos = positionFor(side, role);
  return {
    x: pos.x,
    z: pos.z,
    vx: 0,
    vz: 0,
    speed: 0,
    homeX: pos.x,
    homeZ: pos.z,
    travel: 0,
    grip: null,
    faceYaw: null,
    facePitch: null,
    struckLeft: 0,
    handed: 'right',
  };
}

function syncHomes(match) {
  for (const side of ['A', 'B']) {
    const ids = side === 'A' ? match.sideA : match.sideB;
    for (const id of ids) {
      const actor = match.actors.get(id);
      if (!actor) continue;
      const pos = positionFor(side, roleOf(match.placement[side], id));
      actor.homeX = pos.x;
      actor.homeZ = pos.z;
    }
  }
}

function seatActors(match) {
  match.actors = new Map();
  for (const side of ['A', 'B']) {
    const ids = side === 'A' ? match.sideA : match.sideB;
    for (const id of ids) {
      match.actors.set(id, makeActor(side, roleOf(match.placement[side], id)));
    }
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
  };
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
  const players = [
    ...match.sideA.map((id) => playerSpot(match, id, 'A')),
    ...match.sideB.map((id) => playerSpot(match, id, 'B')),
  ];
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

export function planShot(match, swing) {
  const power = clamp(Number(swing.power ?? 0), 0, 1);
  const apexHit = clamp(Number(swing.apex ?? 0), 0, 1);
  let timing = clamp(Number(swing.timing ?? 0), -1, 1);
  if ((swing.handed ?? 'right') === 'left') timing = -timing;
  const side = sideOf(match, swing.playerId);
  const meters = timing * (2.4 + 3.2 * power);
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
  const depth = 2.5 + 8.2 * ((power - 0.18) / 0.82);
  const landX = side === 'A' ? meters : -meters;
  const landZ = toward * depth;
  const half = match.format === '1v1' ? COURT.singlesHalfWidth : COURT.doublesHalfWidth;
  const out = Math.abs(landX) > half || Math.abs(landZ) > COURT.halfLength;
  const shape = swing.shape === 'lob' || swing.shape === 'slice' ? swing.shape : 'flat';
  const apex = shape === 'lob' ? 6.2 : shape === 'slice' ? 1.25 : 2.4;
  const flightTime = shape === 'lob' ? 1.45 : shape === 'slice' ? 0.85 : 1.05;
  return { outcome: out ? 'out' : 'in', landX, landZ, apex, flightTime, fast: false };
}

export function setGrip(match, playerId, hand) {
  const actor = match.actors?.get(playerId);
  if (!actor) return;
  if (hand === 'forehand' || hand === 'backhand') actor.grip = hand;
}

function inReach(match, playerId) {
  const actor = match.actors.get(playerId);
  const ball = match.ball;
  if (!actor || !ball) return false;
  if (!(ball.y <= REACH_Y)) return false;
  return Math.hypot(ball.x - actor.x, ball.z - actor.z) <= REACH + 1e-6;
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

function beginSwing(match, playerId, input, isServe) {
  const hand = input.hand === 'backhand' ? 'backhand' : 'forehand';
  match.swingingId = playerId;
  match.swingLeft = SWING_SECONDS * (1 - SWING_CONTACT);
  match.swingHand = hand;
  match.swingShape = isServe
    ? 'serve'
    : (input.shape === 'lob' || input.shape === 'slice' ? input.shape : 'flat');
  const actor = match.actors.get(playerId);
  if (actor) actor.handed = input.handed === 'left' ? 'left' : 'right';
}

export function swing(match, input) {
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
  beginSwing(match, playerId, input, isServe);
  if (!inReach(match, playerId)) return false;
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
  const actor = match.actors.get(playerId);
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
  };
  match.receiverId = receiverFor(match, hitterSide, plan, isServe);
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

function timeToGround(y, vy, ay, h) {
  const a = 0.5 * ay;
  const disc = vy * vy - 4 * a * y;
  if (disc >= 0 && Math.abs(a) > 1e-12) {
    const s = Math.sqrt(disc);
    const k1 = (-vy - s) / (2 * a);
    const k2 = (-vy + s) / (2 * a);
    const roots = [k1, k2].filter((k) => k >= -1e-8 && k <= h + 1e-8);
    if (roots.length) return Math.min(...roots.map((k) => clamp(k, 0, h)));
  }
  if (Math.abs(vy) > 1e-8) {
    const k = -y / vy;
    if (k >= 0 && k <= h) return k;
  }
  return h;
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

function advance(match, h) {
  const ball = match.ball;
  const ay = -G + ball.lift;
  if (match.flight) match.flight.t += h;
  const prevZ = ball.z;
  const y1 = ball.y + ball.vy * h + 0.5 * ay * h * h;
  const z1 = ball.z + ball.vz * h;

  if (match.phase === 'flight' && match.shot.outcome === 'net' && (prevZ === 0 || prevZ * z1 <= 0)) {
    const dz = z1 - prevZ;
    const f = dz === 0 ? 1 : clamp((0 - prevZ) / dz, 0, 1);
    const k = f * h;
    ball.x += ball.vx * k;
    ball.z = 0;
    ball.y += ball.vy * k + 0.5 * ay * k * k;
    ball.vy += ay * k;
    const other = match.shot.hitterSide === 'A' ? 'B' : 'A';
    endPoint(match, other, 'Net');
    return;
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

function moveActor(actor, target, dt, top = TOP_SPEED) {
  const dx = target.x - actor.x;
  const dz = target.z - actor.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) {
    const speed = actor.speed;
    const drop = Math.min(speed, ACCEL * dt);
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
  const want = Math.min(top, Math.sqrt(2 * ACCEL * dist));
  let dvx = dirx * want - actor.vx;
  let dvz = dirz * want - actor.vz;
  const dv = Math.hypot(dvx, dvz);
  const maxDv = ACCEL * dt;
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

// Run at the ball, but only on the receiver's own side of the net. A wide
// ball stays off the landing line; cutting there would meet the rebound.
function chaseTarget(match, actor, side) {
  const raw = match.ball
    ? { x: match.ball.x, z: match.ball.z }
    : match.shot
      ? { x: match.shot.landX, z: match.shot.landZ }
      : null;
  if (!raw) return { x: actor.homeX, z: actor.homeZ };
  const half = courtHalfWidth(match);
  const x = clamp(raw.x, -half, half);
  const z = side === 'A'
    ? clamp(raw.z, -BASELINE_Z, 0)
    : clamp(raw.z, 0, BASELINE_Z);
  return { x, z };
}

function movePlayers(match, dt) {
  if (!match.actors) return;
  syncHomes(match);
  const chaseId = match.phase === 'flight' ? match.receiverId : null;
  for (const [id, actor] of match.actors) {
    if (actor.struckLeft > 0) actor.struckLeft = Math.max(0, actor.struckLeft - dt);
    const hold = match.phase === 'match' || (match.phase === 'toss' && id === match.serverId);
    if (hold) {
      actor.vx = 0;
      actor.vz = 0;
      actor.speed = 0;
      continue;
    }
    const chasing = id === chaseId;
    const target = chasing
      ? chaseTarget(match, actor, sideOf(match, id))
      : { x: actor.homeX, z: actor.homeZ };
    moveActor(actor, target, dt, chasing ? TOP_SPEED : WALK_SPEED);
  }
}

export function step(match, dt) {
  if (!(dt > 0)) return;
  decaySwing(match, dt);
  movePlayers(match, dt);
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

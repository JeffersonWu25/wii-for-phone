// Items — pure. Item boxes, the 2-slot roulette, use dispatch, banana flight, entity-vs-kart hits.
// Shell flight lives in shells.js; hit physics in physics.js. No Math.random: everything draws from race.rng.
import { applyHit, BOOST_TIME, KART_RADIUS } from './physics.js';
import { fireShell, stepShell } from './shells.js';

// ── Tunables ─────────────────────────────────────────────────────────────────

export const BOX_RESPAWN = 1.5; // s
export const ROLL_TIME = 1.6; // s a freshly picked kind stays hidden
const RESERVE_DELAY = 0.3; // s the reserve lands after main on a stacked pickup
const PICKUP_RADIUS = KART_RADIUS + 0.7;
const ROW_COOLDOWN = 1.0; // s before a kart can take from the same row again
const BOX_HOVER = 1.0; // m, box centre above the surface
const HIT_RADIUS = KART_RADIUS + 0.5;
const OWNER_IMMUNE = 0.3; // s
const BREAK_DIST = 1.0; // m between shell and shell / banana
const MAX_EVENTS = 64;

const GRAVITY = 20; // m/s^2 for thrown bananas
const BANANA_DROP_BACK = 2; // m behind the kart
const BANANA_TOSS_SPEED = 12; // m/s horizontal, with TOSS_VY: lands ~6 m back
const BANANA_TOSS_VY = 5;
const BANANA_THROW_BOOST = 12; // m/s added to the kart's speed
const BANANA_THROW_VY = 6;
const AIM_THRESHOLD = 0.5;
const AIM_BACK_ANGLE = (30 * Math.PI) / 180;
const AIM_FORWARD_ANGLE = (15 * Math.PI) / 180;

// Odds (percent weights) for 1st and for last, blended linearly in between.
export const ITEM_ODDS = {
  first: { banana: 50, green: 40, red: 0, mushroom: 10 },
  last: { banana: 0, green: 15, red: 40, mushroom: 45 },
};
const KINDS = ['banana', 'green', 'red', 'mushroom'];

// ── RNG / events ─────────────────────────────────────────────────────────────

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Append-only log for the renderer; it remembers the last seq it consumed.
export function pushEvent(race, ev) {
  race.events.push({ seq: ++race.eventSeq, t: race.time, ...ev });
  if (race.events.length > MAX_EVENTS) race.events.splice(0, race.events.length - MAX_EVENTS);
}

// ── Odds ─────────────────────────────────────────────────────────────────────

export function rollItem(place, n, rng) {
  const t = n > 1 ? (place - 1) / (n - 1) : 0;
  const w = KINDS.map((k) => ITEM_ODDS.first[k] + (ITEM_ODDS.last[k] - ITEM_ODDS.first[k]) * t);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < KINDS.length; i++) {
    if (r < w[i]) return KINDS[i];
    r -= w[i];
  }
  return KINDS.find((k, i) => w[i] > 0);
}

// ── Boxes ────────────────────────────────────────────────────────────────────

// One box per (row, lateral). `stacked` marks the box with a second box on top; `ready` false while
// broken. y is the box centre; a stacked top box sits about 1.4 m above it. respawn counts down s.
export function createBoxes(track, rng) {
  const boxes = [];
  track.itemRows.forEach((row, r) => {
    const stacked = Math.floor(rng() * row.laterals.length);
    row.laterals.forEach((lateral, i) => {
      const fr = track.frameAt(row.s);
      boxes.push({
        id: `b${r}_${i}`,
        row: r,
        s: row.s,
        lateral,
        x: fr.x + fr.rx * lateral,
        y: track.heightAt(row.s, lateral) + BOX_HOVER,
        z: fr.z + fr.rz * lateral,
        stacked: i === stacked,
        ready: true,
        respawn: 0,
      });
    });
  });
  return boxes;
}

function stepBoxes(race, dt) {
  for (const box of race.boxes) {
    if (box.ready) continue;
    box.respawn -= dt;
    if (box.respawn > 0) continue;
    box.ready = true;
    box.respawn = 0;
    if (box.stacked) rerollStack(race, box.row);
  }
  for (const kart of race.karts) {
    if (kart.finished) continue;
    for (const box of race.boxes) {
      if (!box.ready || Math.hypot(kart.x - box.x, kart.z - box.z) > PICKUP_RADIUS) continue;
      const key = `${kart.id}:${box.row}`;
      if (race.time - (race.pickupAt[key] ?? -Infinity) < ROW_COOLDOWN) continue;
      race.pickupAt[key] = race.time;
      pickUp(race, kart, box);
    }
  }
}

function rerollStack(race, row) {
  const inRow = race.boxes.filter((b) => b.row === row);
  const pick = Math.floor(race.rng() * inRow.length);
  inRow.forEach((b, i) => {
    b.stacked = i === pick;
  });
}

function pickUp(race, kart, box) {
  box.ready = false;
  box.respawn = BOX_RESPAWN;
  const slots = kart.item;
  const roll = () => rollItem(kart.place, race.karts.length, race.rng);
  let got = null;
  if (box.stacked) {
    if (!slots.main) [slots.main, slots.rollMain] = [roll(), ROLL_TIME];
    if (!slots.reserve) [slots.reserve, slots.rollReserve] = [roll(), ROLL_TIME + RESERVE_DELAY];
    got = slots.main;
  } else if (!slots.main) {
    [slots.main, slots.rollMain] = [roll(), ROLL_TIME];
    got = slots.main;
  } else if (!slots.reserve) {
    [slots.reserve, slots.rollReserve] = [roll(), ROLL_TIME];
    got = slots.reserve;
  }
  pushEvent(race, { type: 'box_break', boxId: box.id, kartId: kart.id, x: box.x, y: box.y, z: box.z });
  pushEvent(race, { type: 'pickup', boxId: box.id, kartId: kart.id, stacked: box.stacked, got: got !== null });
}

// ── Use ──────────────────────────────────────────────────────────────────────

// Latest input -> { dir, angle } for throwing. aimY: -1 up ... +1 down.
export function aimFromInput(input) {
  const steer = Math.max(-1, Math.min(1, input?.steer || 0));
  const aimY = input?.aimY || 0;
  if (aimY > AIM_THRESHOLD) return { dir: 'backward', angle: steer * AIM_BACK_ANGLE, zone: 'back' };
  if (aimY < -AIM_THRESHOLD) return { dir: 'forward', angle: steer * AIM_FORWARD_ANGLE, zone: 'up' };
  return { dir: 'forward', angle: steer * AIM_FORWARD_ANGLE, zone: 'neutral' };
}

// Heading of an aim (backward angle swings toward the kart's right when positive).
const aimHeading = (kart, aim) => (aim.dir === 'backward' ? kart.h + Math.PI - aim.angle : kart.h + aim.angle);

// Consumes main, moves reserve up (with its roll time left). Returns false when nothing can be used.
export function useItem(race, kart, input, track) {
  const slots = kart.item;
  if (!slots.main || slots.rollMain > 0 || kart.hit || kart.finished) return false;
  const kind = slots.main;
  slots.main = slots.reserve;
  slots.rollMain = slots.rollReserve;
  slots.reserve = null;
  slots.rollReserve = 0;
  const aim = aimFromInput(input);
  pushEvent(race, { type: 'use', kartId: kart.id, kind, x: kart.x, y: kart.y, z: kart.z });

  if (kind === 'mushroom') {
    kart.boost = Math.max(kart.boost, BOOST_TIME);
    kart.boostLevel = 0;
    kart.mushroom = BOOST_TIME;
  } else if (kind === 'banana') {
    spawnBanana(race, kart, aim, track);
  } else if (kind === 'green') {
    fireShell(race, kart, 'green', aim, track);
  } else {
    fireShell(race, kart, 'red', aim, track); // the shell decides: homes forward, straight backward
  }
  return true;
}

function spawnBanana(race, kart, aim, track) {
  const base = { id: `e${race.entitySeq++}`, kind: 'banana', owner: kart.id, age: 0, bounces: 0, target: null };
  let x, z, y, vx = 0, vz = 0, vy = 0;
  let state = 'ground';
  if (aim.zone === 'up') {
    const h = aimHeading(kart, aim);
    const speed = kart.speed + BANANA_THROW_BOOST;
    [x, z, y] = [kart.x + Math.cos(h) * KART_RADIUS, kart.z + Math.sin(h) * KART_RADIUS, kart.y + 0.8];
    [vx, vz, vy, state] = [Math.cos(h) * speed, Math.sin(h) * speed, BANANA_THROW_VY, 'air'];
  } else if (aim.zone === 'back') {
    const h = aimHeading(kart, aim);
    [x, z, y] = [kart.x + Math.cos(h) * KART_RADIUS, kart.z + Math.sin(h) * KART_RADIUS, kart.y + 0.6];
    [vx, vz, vy, state] = [Math.cos(h) * BANANA_TOSS_SPEED, Math.sin(h) * BANANA_TOSS_SPEED, BANANA_TOSS_VY, 'air'];
  } else {
    [x, z, y] = [kart.x - Math.cos(kart.h) * BANANA_DROP_BACK, kart.z - Math.sin(kart.h) * BANANA_DROP_BACK, kart.y];
  }
  const p = track.project(x, z, kart.s);
  if (state === 'ground') y = track.surfaceAt(p.s, p.lateral).y;
  race.entities.push({ ...base, x, y, z, vx, vy, vz, s: p.s, lateral: p.lateral, state });
}

function stepBanana(b, track, dt) {
  if (b.state !== 'air') return;
  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.y += b.vy * dt;
  const p = track.project(b.x, b.z, b.s);
  b.s = p.s;
  b.lateral = p.lateral;
  const ground = track.surfaceAt(p.s, p.lateral).y;
  if (b.y <= ground && b.vy < 0) {
    Object.assign(b, { y: ground, vx: 0, vy: 0, vz: 0, state: 'ground' });
  }
}

// ── Entities ─────────────────────────────────────────────────────────────────

function breakEntity(race, e) {
  e.dead = true;
  pushEvent(race, { type: 'entity_break', entityId: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z });
}

function resolveEntityHits(race) {
  const list = race.entities;
  // Shell vs shell and shell vs banana: both break.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.dead || b.dead || (a.kind === 'banana' && b.kind === 'banana')) continue;
      if (a.owner === b.owner && Math.min(a.age, b.age) < OWNER_IMMUNE) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) >= BREAK_DIST) continue;
      breakEntity(race, a);
      breakEntity(race, b);
    }
  }
  // Entity vs kart: a kart that cannot be hit right now lets it pass.
  for (const e of list) {
    if (e.dead) continue;
    for (const kart of race.karts) {
      if (kart.hit || kart.invuln > 0) continue;
      if (kart.id === e.owner && e.age < OWNER_IMMUNE) continue;
      if (Math.hypot(kart.x - e.x, kart.z - e.z) >= HIT_RADIUS) continue;
      const kind = e.kind === 'banana' ? 'spin' : 'tumble';
      applyHit(kart, kind);
      pushEvent(race, { type: 'hit', kartId: kart.id, kind, entityId: e.id, by: e.kind, owner: e.owner, x: kart.x, y: kart.y, z: kart.z });
      e.dead = true;
      break;
    }
  }
}

function stepEntities(race, dt, track) {
  for (const e of race.entities) {
    e.age += dt;
    if (e.kind === 'banana') stepBanana(e, track, dt);
    else if (!stepShell(e, race, track, dt)) breakEntity(race, e);
  }
  resolveEntityHits(race);
  race.entities = race.entities.filter((e) => !e.dead);
}

// ── Step ─────────────────────────────────────────────────────────────────────

export function stepItems(race, inputsById, dt, track) {
  for (const kart of race.karts) {
    const slots = kart.item;
    slots.rollMain = Math.max(0, slots.rollMain - dt);
    slots.rollReserve = Math.max(0, slots.rollReserve - dt);
    const input = inputsById?.[kart.id];
    if (input?.useItem) useItem(race, kart, input, track);
  }
  stepBoxes(race, dt);
  stepEntities(race, dt, track);
}

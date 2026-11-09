import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redTarget, findLock, fireShell, stepShell, GREEN_MAX_BOUNCES, LOCK_RANGE, SHELL_SPEED } from './shells.js';
import { KART_RADIUS } from './physics.js';
import { createRace } from './race.js';
import { buildTrack, PIECES, pieceLength } from './track.js';

const track = buildTrack();

test('redTarget is the id one place ahead, null for 1st', () => {
  const race = { standings: ['a', 'b', 'c'] };
  assert.equal(redTarget(race, 'c'), 'b');
  assert.equal(redTarget(race, 'a'), null);
});

test('findLock picks only karts ahead within LOCK_RANGE and never the owner', () => {
  const at = (id, s) => {
    const f = track.frameAt(s);
    return { id, s, x: f.x, z: f.z };
  };
  const race = { karts: [at('o', 50), at('ahead', 50 + LOCK_RANGE - 3), at('far', 50 + LOCK_RANGE + 10), at('behind', 45)] };
  const shell = { owner: 'o', ...at('shell', 50) };
  assert.equal(findLock(shell, race, track), 'ahead');
  race.karts = race.karts.filter((k) => k.id !== 'ahead');
  assert.equal(findLock(shell, race, track), null);
});

// ── Walls ────────────────────────────────────────────────────────────────────

const ids = ['a', 'b', 'c'];
function wallRace() {
  const race = createRace(track, ids.map((id) => ({ id, name: id, color: 0 })), { seed: 3 });
  race.standings = [...ids].reverse(); // c is 1st, a is last
  race.karts.forEach((k) => { k.place = race.standings.indexOf(k.id) + 1; });
  return race;
}

test('a red shell pursuing a kart hugging the wall is not spent by wall contacts without reflections', () => {
  const race = wallRace();
  const [a, b] = race.karts;
  const s = 200;
  const lim = track.surfaceAt(s + 8, 0).limitR;
  put(a, s, 0);
  a.speed = 20;
  put(b, s + 8, lim - 0.1);
  race.standings = ['b', 'a', 'c'];
  const sh = fireShell(race, a, 'red', { dir: 'forward', angle: 0 }, track);
  assert.equal(sh.target, 'b');
  for (let i = 0; i < 60; i++) {
    sh.age += 1 / 60;
    assert.equal(stepShell(sh, race, track, 1 / 60), true, `alive at step ${i}`);
  }
  assert.equal(bounceEvents(race, sh), sh.bounces, 'one bounce event per counted reflection');
});

test('a green shell counts one bounce per reflection while running along a wall', () => {
  const race = wallRace();
  const a = race.karts[0];
  put(a, 200, 0);
  const sh = fireShell(race, a, 'green', { dir: 'forward', angle: 0.25 }, track);
  let alive = true;
  for (let i = 0; i < 150 && alive; i++) {
    sh.age += 1 / 60;
    alive = stepShell(sh, race, track, 1 / 60);
  }
  assert.ok(sh.bounces >= 1);
  assert.equal(bounceEvents(race, sh), sh.bounces);
  assert.equal(alive, sh.bounces <= GREEN_MAX_BOUNCES);
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DT = 1 / 60;
const HIT_R = KART_RADIUS + 0.5;
const DEG = Math.PI / 180;

const pieceStart = (tag) => {
  let s = 0;
  for (const p of PIECES) {
    if (p.tag === tag) return s;
    s += pieceLength(p);
  }
  throw new Error(`no piece ${tag}`);
};
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const wrapDs = (d) => d - track.length * Math.round(d / track.length);

function makeRace(n = 4) {
  const ids = 'abcdefgh'.slice(0, n).split('');
  return createRace(track, ids.map((id) => ({ id, color: '#fff', name: id.toUpperCase() })), { seed: 7 });
}

function put(kart, s, lateral = 0, speed = 0) {
  const fr = track.frameAt(s);
  kart.s = track.wrapS(s);
  kart.lateral = lateral;
  kart.x = fr.x + fr.rx * lateral;
  kart.z = fr.z + fr.rz * lateral;
  kart.y = track.heightAt(s, lateral);
  kart.h = fr.h;
  kart.progress = s;
  kart.speed = speed;
  kart.vx = Math.cos(fr.h) * speed;
  kart.vz = Math.sin(fr.h) * speed;
}

// order: ids from 1st to last; sets standings and places.
function setOrder(race, order) {
  race.standings = [...order];
  order.forEach((id, i) => {
    race.karts.find((k) => k.id === id).place = i + 1;
  });
}

const kartOf = (race, id) => race.karts.find((k) => k.id === id);
const heading = (sh) => Math.atan2(sh.vz, sh.vx);
const speedOf = (sh) => Math.hypot(sh.vx, sh.vz);
const bounceEvents = (race, sh) => (race.events ?? []).filter((e) => e.type === 'bounce' && e.entityId === sh.id).length;

// Tracks the shell's projected s (unwrapped) and corridor membership across steps.
function tracker(sh) {
  let hint = sh.s ?? 0;
  let s = hint;
  return {
    get s() {
      return s;
    },
    sample() {
      const pr = track.project(sh.x, sh.z, hint);
      s += wrapDs(pr.s - hint);
      hint = pr.s;
      const sf = track.surfaceAt(pr.s, pr.lateral);
      const inside = pr.lateral <= sf.limitR + 0.5 && pr.lateral >= -(sf.limitL + 0.5);
      return { s, lateral: pr.lateral, inside };
    },
  };
}

// Steps until removal or maxT; calls onStep(shell, t) after each live step.
function run(race, sh, maxT, onStep) {
  const steps = Math.round(maxT / DT);
  for (let i = 1; i <= steps; i++) {
    sh.age += DT; // stepEntities owns age in the game
    if (stepShell(sh, race, track, DT) === false) return { removedAt: i * DT, steps: i };
    if (onStep?.(sh, i * DT) === 'stop') return { stopped: true, at: i * DT, steps: i };
  }
  return { removedAt: null, steps };
}

// ── S1 ───────────────────────────────────────────────────────────────────────

test('green forward on the back straight keeps SHELL_SPEED +-3% for 1 s and follows kart heading', () => {
  const race = makeRace(2);
  const k = race.karts[0];
  put(k, pieceStart('back') + 20, 0, 20);
  const sh = fireShell(race, k, 'green', { dir: 'forward', angle: 0 }, track);
  assert.ok(sh && race.entities.includes(sh), 'fireShell returns the entity and pushes it to race.entities');
  assert.equal(sh.kind, 'green');
  const tr = tracker(sh);
  let n = 0;
  const r = run(race, sh, 1, (s) => {
    n++;
    assert.ok(Math.abs(speedOf(s) / SHELL_SPEED - 1) <= 0.03, `speed ${speedOf(s)} at step ${n}`);
    assert.ok(Math.abs(wrapAngle(heading(s) - k.h)) <= 2 * DEG, 'within 2 deg of kart heading');
    assert.ok(tr.sample().inside, 'inside corridor');
  });
  assert.equal(r.removedAt, null, 'still alive after 1 s');
  assert.equal(n, 60);
});

test('green forward with steer 1 (angle 15 deg) leaves ~15 deg to the right of kart heading', () => {
  const race = makeRace(2);
  const k = race.karts[0];
  put(k, pieceStart('back') + 20, 0, 20);
  const sh = fireShell(race, k, 'green', { dir: 'forward', angle: 15 * DEG }, track);
  run(race, sh, 0.5, (s) => {
    const d = wrapAngle(heading(s) - k.h);
    assert.ok(Math.abs(Math.abs(d) - 15 * DEG) <= 2 * DEG, `angle ${d / DEG} deg`);
    assert.ok(d > 0, 'positive angle (steer right) heads right: lateral increases');
  });
  assert.ok(Math.abs(speedOf(sh) / SHELL_SPEED - 1) <= 0.03);
});

// ── S2 ───────────────────────────────────────────────────────────────────────

test('wall bounce reflects lateral velocity, keeps >= 97% speed, increments bounces and pushes one event per contact', () => {
  const race = makeRace(2);
  const k = race.karts[0];
  const s0 = pieceStart('back');
  put(k, s0 + 2, 0, 20);
  const sh = fireShell(race, k, 'green', { dir: 'forward', angle: 30 * DEG }, track);
  const lateralV = (s) => {
    const fr = track.frameAt(track.project(s.x, s.z, s.s).s);
    return s.vx * fr.rx + s.vz * fr.rz;
  };
  let prev = { vl: lateralV(sh), sp: speedOf(sh), b: sh.bounces ?? 0, ev: bounceEvents(race, sh) };
  assert.ok(Math.abs(prev.vl) > 10, 'aimed into a wall');
  let reflected = 0;
  run(race, sh, 6, (s) => {
    const b = s.bounces;
    const ev = bounceEvents(race, s);
    if (b !== prev.b) {
      assert.equal(b, prev.b + 1, 'one contact per step increments by 1');
      assert.equal(ev, prev.ev + 1, 'one bounce event per contact');
      const vl = lateralV(s);
      assert.ok(Math.sign(vl) === -Math.sign(prev.vl), `lateral velocity flips (${prev.vl} -> ${vl})`);
      assert.ok(speedOf(s) >= prev.sp * 0.97, `speed after ${speedOf(s)} vs before ${prev.sp}`);
      reflected++;
    } else assert.equal(ev, prev.ev, 'no event without a contact');
    prev = { vl: lateralV(s), sp: speedOf(s), b, ev };
    // stop once off the straight so curvature does not muddy the lateral axis
    if (s.s != null && track.project(s.x, s.z, s.s).s > pieceStart('back') + 170) return 'stop';
  });
  assert.ok(reflected >= 1, 'at least one wall contact on the straight');
});

test('green is removed on the 6th wall contact', () => {
  const race = makeRace(2);
  const k = race.karts[0];
  put(k, pieceStart('back') + 2, 0, 20);
  const sh = fireShell(race, k, 'green', { dir: 'forward', angle: 80 * DEG }, track);
  const r = run(race, sh, 9, (s) => {
    assert.ok(s.bounces <= 5, `alive with ${s.bounces} bounces`);
  });
  assert.ok(r.removedAt != null && r.removedAt <= 8.05, `removed at ${r.removedAt}`);
  assert.ok(sh.bounces >= 6 || r.removedAt >= 7.9, `removed by 6th contact (bounces ${sh.bounces}) or age 8 s (${r.removedAt})`);
  assert.equal(bounceEvents(race, sh), sh.bounces, 'event count matches bounce count');
});

test('green is removed at age 8 s when it has not hit 6 walls', () => {
  const race = makeRace(2);
  const k = race.karts[0];
  put(k, pieceStart('back') + 2, 0, 20);
  const sh = fireShell(race, k, 'green', { dir: 'forward', angle: 0 }, track);
  const r = run(race, sh, 9);
  assert.ok(r.removedAt != null, 'removed');
  assert.ok(r.removedAt >= 7.9 && r.removedAt <= 8.05, `removed at ${r.removedAt}`);
});

// ── S3 ───────────────────────────────────────────────────────────────────────

const S3_CASES = [
  ['start straight', 'start', 20],
  ['entering t1', 'start', 80],
  ['mid S-bend (sLeft into sRight)', 'sLeft', 15],
  ['hill arc', 'hill', 5],
];
for (const [label, tag, off] of S3_CASES) {
  for (const gap of [25, 32, 40]) {
    test(`red from 2nd hits 1st ${gap} m ahead, ${label}, within 4 s, inside corridor`, () => {
      const race = makeRace(3);
      const [first, second, third] = race.karts;
      const s0 = pieceStart(tag) + off;
      put(second, s0, 0, 20);
      put(first, s0 + gap, 0, 0);
      put(third, s0 - 15, 0, 0);
      setOrder(race, [first.id, second.id, third.id]);
      const sh = fireShell(race, second, 'red', { dir: 'forward', angle: 0 }, track);
      const tr = tracker(sh);
      let best = Infinity;
      const r = run(race, sh, 4, (s) => {
        assert.ok(tr.sample().inside, `left the corridor at ${tr.s}`);
        best = Math.min(best, Math.hypot(s.x - first.x, s.z - first.z));
        if (best <= HIT_R) return 'stop';
      });
      assert.ok(best <= HIT_R, `closest approach ${best.toFixed(2)} m (removed ${r.removedAt})`);
    });
  }
}

// ── S4 ───────────────────────────────────────────────────────────────────────

function lineup() {
  const race = makeRace(4);
  const [a, b, c, d] = race.karts;
  put(a, 70, 0);
  put(b, 55, 0);
  put(c, 40, 0, 20);
  put(d, 25, 0);
  setOrder(race, [a.id, b.id, c.id, d.id]);
  return race;
}

test('shooter in 1st fires with no target, then locks on a kart that comes within 15 m ahead', () => {
  const race = makeRace(3);
  const [a, b, c] = race.karts;
  put(a, 30, 0, 20); // 1st by progress, but b is physically ahead (lapped)
  put(b, 88, 0);
  put(c, 20, 0); // behind the shooter
  a.progress = 1000;
  b.progress = 500;
  c.progress = 400;
  setOrder(race, [a.id, b.id, c.id]);
  const sh = fireShell(race, a, 'red', { dir: 'forward', angle: 0 }, track);
  assert.equal(sh.target, null, 'no initial target');
  let locked = false;
  run(race, sh, 3, (s) => {
    const d = Math.hypot(s.x - b.x, s.z - b.z);
    if (d > 16) assert.equal(s.target, null, `locked early at ${d.toFixed(1)} m`);
    if (d <= 14) {
      assert.equal(s.target, b.id, `no lock at ${d.toFixed(1)} m`);
      locked = true;
    }
    assert.notEqual(s.target, c.id, 'never locks on a kart behind');
    assert.notEqual(s.target, a.id, 'never locks on the shooter');
    if (d <= HIT_R) return 'stop';
  });
  assert.ok(locked, 'locked on the kart ahead');
});

test('red lifetime is 12 s (follows the track forward when nobody is ahead)', () => {
  const race = makeRace(3);
  const [a, b, c] = race.karts;
  put(a, 40, 0, 20);
  put(b, 30, 0);
  put(c, 20, 0);
  setOrder(race, [a.id, b.id, c.id]);
  const sh = fireShell(race, a, 'red', { dir: 'forward', angle: 0 }, track);
  const tr = tracker(sh);
  const s0 = tr.s;
  const r = run(race, sh, 13, () => {
    assert.ok(tr.sample().inside, 'inside corridor');
  });
  assert.ok(r.removedAt != null && r.removedAt >= 11.8 && r.removedAt <= 12.1, `removed at ${r.removedAt}`);
  assert.ok(tr.s - s0 > 250, `followed the track forward (${(tr.s - s0).toFixed(0)} m)`);
});

// ── S5 ───────────────────────────────────────────────────────────────────────

for (const angle of [0, 12 * DEG]) {
  test(`red fired backward (angle ${Math.round(angle / DEG)} deg) keeps target null and flies straight like a green`, () => {
    const race = lineup();
    const k = kartOf(race, 'c');
    const sh = fireShell(race, k, 'red', { dir: 'backward', angle }, track);
    assert.equal(sh.target, null, 'no target at fire');
    const base = k.h + Math.PI;
    const h0 = heading(sh);
    assert.ok(Math.abs(wrapAngle(h0 - base)) <= angle + 2 * DEG, 'points back (+- angle)');
    if (angle) assert.ok(Math.abs(Math.abs(wrapAngle(h0 - base)) - angle) <= 2 * DEG, 'offset by the aim angle');
    run(race, sh, 1, (s) => {
      assert.equal(s.target, null, 'target stays null');
      assert.ok(Math.abs(wrapAngle(heading(s) - h0)) <= 2 * DEG, 'does not curve');
      assert.ok(Math.abs(speedOf(s) / SHELL_SPEED - 1) <= 0.03);
    });
  });
}

// ── S6 ───────────────────────────────────────────────────────────────────────

test('red reaches an offset reachable target in under 4 s without orbiting', () => {
  for (const [shooterLat, targetLat] of [[-6, 6], [6, -6], [0, 7]]) {
    const race = makeRace(2);
    const [first, second] = race.karts;
    const s0 = pieceStart('start') + 15;
    put(second, s0, shooterLat, 20);
    put(first, s0 + 30, targetLat, 0);
    setOrder(race, [first.id, second.id]);
    const sh = fireShell(race, second, 'red', { dir: 'forward', angle: 0 }, track);
    const tr = tracker(sh);
    let best = Infinity;
    let maxS = tr.s;
    run(race, sh, 4, (s) => {
      const p = tr.sample();
      maxS = Math.max(maxS, p.s);
      assert.ok(maxS - p.s <= 1, `drifted backward ${(maxS - p.s).toFixed(2)} m`);
      best = Math.min(best, Math.hypot(s.x - first.x, s.z - first.z));
      if (best <= HIT_R) return 'stop';
    });
    assert.ok(best <= HIT_R, `lat ${shooterLat}->${targetLat}: closest ${best.toFixed(2)} m`);
  }
});

test('unlocked red never drifts backward along the track', () => {
  const race = makeRace(3);
  const [a, b, c] = race.karts;
  put(a, pieceStart('t1') - 10, 3, 20);
  put(b, 20, 0);
  put(c, 10, 0);
  setOrder(race, [a.id, b.id, c.id]);
  const sh = fireShell(race, a, 'red', { dir: 'forward', angle: 0 }, track);
  const tr = tracker(sh);
  let maxS = tr.s;
  run(race, sh, 6, () => {
    const p = tr.sample();
    maxS = Math.max(maxS, p.s);
    assert.ok(maxS - p.s <= 1, `drifted backward ${(maxS - p.s).toFixed(2)} m`);
  });
  assert.ok(maxS - tr.s <= 1);
});

// ── S7 ───────────────────────────────────────────────────────────────────────

test('same inputs give identical entity state after 200 steps', () => {
  const sim = (kind, dir, angle) => {
    const race = lineup();
    const k = kartOf(race, 'c');
    const sh = fireShell(race, k, kind, { dir, angle }, track);
    for (let i = 0; i < 200; i++) {
      sh.age += DT;
      if (stepShell(sh, race, track, DT) === false) break;
    }
    return JSON.stringify([sh, race.events ?? []]);
  };
  for (const args of [['green', 'forward', 0.2], ['green', 'backward', -0.3], ['red', 'forward', 0], ['red', 'backward', 0.1]]) {
    assert.equal(sim(...args), sim(...args), args.join(' '));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrack } from './index.js';
import { createKart, stepKart, KART_RADIUS, TOP_SPEED } from '../physics.js';
import { autopilotInput } from '../autopilot.js';

const track = loadTrack('clover-meadows');
const DEG = Math.PI / 180;
const section = (id) => track.sections.find((s) => s.id === id);
const inSection = (s, id) => s >= section(id).s0 && s < section(id).s1;
const range = (tag) => track.pieceRange(tag);
const piecesOf = (id) => track.pieces.filter((p) => p.section === id);
const width = (s) => track.frameAt(s).halfWidth * 2;
const mid = (tag) => {
  const r = range(tag);
  return (r.s0 + r.s1) / 2;
};
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const sOf = (piece, at) => range(piece).s0 + at;

test('lap is 1,200 to 1,600 m and the loop closes within 1 cm', () => {
  assert.ok(track.length >= 1200 && track.length <= 1600, `length ${track.length}`);
  assert.ok(Math.hypot(track.closure.dx, track.closure.dz) < 0.01);
  assert.ok(Math.abs(track.closure.dh) < 1e-6);
  assert.equal(track.id, 'clover-meadows');
  assert.equal(track.name, 'Clover Meadows');
});

test('driven clockwise: net turning is +360 degrees (right)', () => {
  let net = 0;
  for (let n = 0; n < track.samples.length - 1; n++) net += wrapAngle(track.samples[n + 1].h - track.samples[n].h);
  assert.ok(Math.abs(net / DEG - 360) < 0.01, `net ${net / DEG}`);
});

test('sections run in contract order and tile the lap', () => {
  assert.deepEqual(track.sections.map((s) => s.id), ['farmhouse', 'wildflower', 'windmill', 'meadowfield', 'switchbacks', 'creek', 'cows']);
  assert.deepEqual(track.sections.map((s) => s.name), [
    'Farmhouse Straight', 'Wildflower S-Curves', 'Windmill Tunnel', 'Meadow Obstacle Field', 'Hillside Switchbacks', 'Creek Crossing', 'Cow Crossing',
  ]);
  assert.equal(track.sections[0].s0, 0);
  track.sections.forEach((s, i) => {
    if (i) assert.ok(Math.abs(s.s0 - track.sections[i - 1].s1) < 1e-9);
  });
  assert.ok(Math.abs(track.sections.at(-1).s1 - track.length) < 1e-9);
});

test('widths: wide farmhouse, 30 m+ meadow field (the widest), bridge <= 12 m, cow road 18-24 m', () => {
  assert.ok(width(40) >= 22);
  assert.ok(width(track.length - 20) >= 22 && width(track.length - 60) <= 24);
  const field = Math.min(...piecesOf('meadowfield').map((p) => p.width));
  assert.ok(field >= 30, `field ${field}`);
  const widest = Math.max(...track.pieces.filter((p) => p.section !== 'meadowfield').map((p) => p.width));
  assert.ok(field > widest, 'field is the widest road');
  assert.ok(width(mid('mf4')) >= 30);
  for (const p of piecesOf('cows')) assert.ok(p.width >= 18 && p.width <= 24, p.tag);
  const bridge = track.pieces.find((p) => p.tag === 'bridge');
  assert.equal(bridge.surface, 'wood');
  assert.ok(bridge.width <= 12 && bridge.left.wall && bridge.right.wall);
  assert.equal(track.pieces.filter((p) => p.surface === 'wood').length, 1);
  assert.equal(track.frameAt(mid('bridge')).section, 'creek');
});

test('elevation: flat start, uphill wildflower, peak at the windmill, switchbacks drop >= 10 m, grades <= 12%', () => {
  const h = (s) => track.heightAt(s, 0);
  assert.ok(Math.abs(h(0)) < 1e-9 && Math.abs(h(track.length - 1)) < 0.05);
  assert.ok(Math.abs(h(range('startStraight').s1 - 5)) < 0.01, 'farmhouse is flat');
  const wf = section('wildflower');
  assert.ok(h(wf.s1 - 0.01) - h(wf.s0) >= 8, `climb ${h(wf.s1) - h(wf.s0)}`);
  let peak = { y: -Infinity, s: 0 };
  for (const sp of track.samples) if (sp.y > peak.y) peak = sp;
  assert.ok(peak.y >= 12 && peak.y <= 20, `peak ${peak.y}`);
  assert.ok(inSection(peak.s, 'windmill'), `peak at s=${peak.s}`);
  const sb = section('switchbacks');
  assert.ok(h(sb.s0) - h(sb.s1 - 0.01) >= 10, `drop ${h(sb.s0) - h(sb.s1)}`);
  const grade = Math.max(...track.samples.map((p) => Math.abs(p.grade)));
  assert.ok(grade <= 0.12, `max grade ${grade}`);
});

test('wildflower: dished road, two or more tight corners (radius <= 30)', () => {
  const ps = piecesOf('wildflower');
  assert.ok(ps.every((p) => p.dish > 0));
  assert.ok(ps.filter((p) => p.kind === 'arc' && p.radius <= 30).length >= 2);
});

test('switchbacks: >= 3 banked hairpins (>= 120 deg, radius <= 26, bank 8-14 deg) joined by straights <= 30 m', () => {
  const ps = piecesOf('switchbacks');
  const hairpins = ps.filter((p) => p.kind === 'arc' && p.angle >= 120);
  assert.ok(hairpins.length >= 3);
  for (const p of hairpins) {
    assert.ok(p.radius <= 26, `${p.tag} radius`);
    assert.ok(Math.abs(p.bank) >= 8 && Math.abs(p.bank) <= 14, `${p.tag} bank`);
    assert.equal(Math.sign(p.bank), p.turn === 'right' ? 1 : -1, `${p.tag} banks toward the inside`);
  }
  for (const p of ps.filter((q) => q.kind === 'straight')) assert.ok(p.length <= 30, p.tag);
  const hp = range('sb2');
  assert.ok(Math.abs(track.frameAt(mid('sb2')).bank) >= 8 * DEG);
  assert.ok(hp.s1 > hp.s0);
});

test('item rows: farmhouse straight, windmill approach, field entry and before the bridge, all on the road', () => {
  assert.equal(track.itemRows.length, 4);
  assert.ok(inSection(track.itemRows[0].s, 'farmhouse'));
  assert.ok(track.itemRows.some((r) => inSection(r.s, 'creek') && range('bridge').s0 - r.s > 0 && range('bridge').s0 - r.s < 30));
  for (const row of track.itemRows) {
    assert.ok(row.laterals.length >= 3);
    for (const l of row.laterals) assert.ok(Math.abs(l) + KART_RADIUS < track.frameAt(row.s).halfWidth, `lateral ${l} at s=${row.s}`);
  }
});

test('gridSlots(12): 4 columns by 3 rows on the apron, on the road, at least 4.5 m apart', () => {
  const slots = track.gridSlots(12);
  assert.equal(new Set(slots.map((g) => g.lateral.toFixed(3))).size, 4);
  for (const g of slots) {
    assert.ok(g.s > track.length - 30);
    assert.equal(track.surfaceAt(g.s, g.lateral).kind, 'road');
    assert.ok(Math.abs(g.lateral) + KART_RADIUS < track.frameAt(g.s).halfWidth);
  }
  let min = Infinity;
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) min = Math.min(min, Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z));
  assert.ok(min >= 4.5, `closest pair ${min}`);
});

test('the windmill tunnel is one hard-walled piece with a blade gate at its entrance', () => {
  const tunnels = track.pieces.filter((p) => p.tunnel);
  assert.equal(tunnels.length, 1);
  assert.equal(tunnels[0].section, 'windmill');
  assert.ok(tunnels[0].left.wall && tunnels[0].right.wall);
});

test('obstacle, patch and ramp shapes follow the contract', async () => {
  const { cloverMeadows } = await import('./cloverMeadows.js');
  const { obstacles, patches, ramps } = cloverMeadows;
  const has = (tag) => track.pieces.some((p) => p.tag === tag);
  const blades = obstacles.filter((o) => o.kind === 'blades');
  assert.equal(blades.length, 1);
  assert.equal(blades[0].piece, 'tunnel');
  assert.equal(blades[0].at, 0);
  assert.ok(blades[0].period >= 3 && blades[0].period <= 5 && blades[0].blockFraction >= 0.25 && blades[0].blockFraction <= 0.45);
  const cows = obstacles.filter((o) => o.kind === 'cow');
  assert.ok(cows.length >= 8 && cows.length <= 12, `${cows.length} cows`);
  const crossers = cows.filter((c) => c.from !== c.to);
  assert.ok(crossers.length >= 5);
  assert.ok(new Set(crossers.map((c) => c.phase)).size >= 5, 'staggered phases');
  for (const c of cows) {
    assert.ok(has(c.piece) && c.at >= 0 && c.at <= range(c.piece).s1 - range(c.piece).s0, c.id);
    assert.ok(track.frameAt(sOf(c.piece, c.at)).section === 'cows', `${c.id} is on the cow road`);
    assert.ok(c.period > 0);
  }
  for (const c of crossers) assert.ok(Math.abs(c.from) < track.frameAt(sOf(c.piece, c.at)).halfWidth && Math.abs(c.to) < track.frameAt(sOf(c.piece, c.at)).halfWidth);
  assert.equal(new Set([...obstacles.map((o) => o.id), ...patches.map((p) => p.id)]).size, obstacles.length + patches.length, 'unique ids');

  assert.ok(ramps.length >= 3);
  const grassPatches = patches.filter((p) => p.kind === 'grass');
  for (const r of ramps) {
    assert.equal(track.frameAt(sOf(r.piece, r.at)).section, 'meadowfield');
    const rs = sOf(r.piece, r.at);
    const next = grassPatches.find((p) => {
      const ps = sOf(p.piece, p.at);
      return ps > rs && ps - rs <= 20 && Math.abs(p.lateral - r.lateral) < 3;
    });
    assert.ok(next, `ramp at ${rs} is followed by a grass patch`);
  }
  const field = patches.filter((p) => track.frameAt(sOf(p.piece, p.at)).section === 'meadowfield');
  assert.ok(field.filter((p) => p.kind === 'grass').length >= 3 && field.filter((p) => p.kind === 'mud').length >= 2);
  assert.ok(patches.filter((p) => track.frameAt(sOf(p.piece, p.at)).section === 'wildflower' && p.kind === 'grass').length >= 3);
  for (const p of patches) {
    assert.ok(['grass', 'mud'].includes(p.kind) && p.length > 0 && p.width > 0 && Number.isInteger(p.seed), p.id);
    assert.ok(Math.abs(p.lateral) < track.frameAt(sOf(p.piece, p.at)).halfWidth, `${p.id} centred on the road`);
  }
});

// ── Bypass ──────────────────────────────────────────────────────────────────

const sc = track.shortcuts[0];
const LOOK = 16;

function drive(kart, target) {
  let s = kart.s;
  let tx;
  let tz;
  for (let i = 0; i < 80; i++) {
    s += 1;
    const fr = track.frameAt(s);
    const lat = target(s);
    tx = fr.x + fr.rx * lat;
    tz = fr.z + fr.rz * lat;
    if (Math.hypot(tx - kart.x, tz - kart.z) >= LOOK) break;
  }
  return { steer: Math.max(-1, Math.min(1, wrapAngle(Math.atan2(tz - kart.z, tx - kart.x) - kart.h) * 2.2)), throttle: 1 };
}

// Drives from 40 m before the bypass at full speed to 30 m past its rejoin; reports time and whether the pad boosted.
function runThrough(target) {
  const s0 = sc.s0 - 40;
  const fr = track.frameAt(s0);
  const kart = createKart({ id: 'k', color: 0, slot: { s: s0, lateral: 0, x: fr.x, y: track.heightAt(s0, 0), z: fr.z, h: fr.h } });
  kart.speed = TOP_SPEED;
  kart.vx = Math.cos(fr.h) * TOP_SPEED;
  kart.vz = Math.sin(fr.h) * TOP_SPEED;
  let t = 0;
  let boosted = false;
  while (kart.s < sc.s1 + 30 && t < 30) {
    stepKart(kart, drive(kart, target), 1 / 60, track);
    t += 1 / 60;
    boosted ||= kart.boost > 0;
  }
  return { t, boosted, kart };
}

test('the bypass is on the left, one boost pad on it, and well over 30 m longer than the tunnel route', () => {
  assert.equal(track.shortcuts.length, 1);
  assert.equal(sc.id, 'bypass');
  assert.equal(track.frameAt(sc.s0 + 0.01).section, 'windmill');
  assert.equal(track.frameAt(sc.s1 - 0.01).section, 'windmill');
  for (let s = sc.s0; s <= sc.s1; s += 5) assert.ok(sc.lateralAt(s) < 0, `left of travel at ${s}`);
  const extra = sc.length - (sc.s1 - sc.s0);
  assert.ok(extra >= 30, `bypass is ${extra} m longer`);
  assert.equal(track.boostPads.length, 1);
  const pad = track.boostPads[0];
  assert.ok(pad.s > sc.s0 && pad.s < sc.s1);
  assert.ok(Math.abs(pad.lateral - sc.lateralAt(pad.s)) < 0.5, 'pad sits on the bypass');
  assert.equal(track.surfaceAt(pad.s, pad.lateral).kind, 'shortcut');
  assert.equal(track.surfaceAt(pad.s, 0).kind, 'road');
});

test('with its boost pad the bypass still loses to the tunnel route (blades ignored)', () => {
  const tunnel = runThrough(() => 0);
  const bypass = runThrough((s) => (s >= sc.s0 - 10 && s <= sc.s1 + 10 ? sc.lateralAt(s) : 0));
  console.log(`# clover-meadows tunnel ${tunnel.t.toFixed(2)} s, bypass ${bypass.t.toFixed(2)} s (pad boosted: ${bypass.boosted})`);
  assert.ok(bypass.boosted, 'the pad fired');
  assert.ok(!tunnel.boosted);
  assert.ok(bypass.t - tunnel.t >= 0.5, `bypass ${bypass.t} vs tunnel ${tunnel.t}`);
});

test('an autopilot drives one lap inside the corridor and reports its lap time', () => {
  const kart = createKart({ id: 'k', color: 0xff0000, slot: track.gridSlots(12)[0] });
  const dt = 1 / 60;
  let t = 0;
  let travelled = 0;
  let prev = kart.s;
  let hits = 0;
  let touching = false;
  while (travelled < track.length && t < 200) {
    stepKart(kart, autopilotInput(track, kart), dt, track);
    t += dt;
    let d = kart.s - prev;
    d -= track.length * Math.round(d / track.length);
    travelled += d;
    prev = kart.s;
    const surf = track.surfaceAt(kart.s, kart.lateral);
    const now = kart.lateral > surf.limitR - KART_RADIUS - 0.02 || kart.lateral < -(surf.limitL - KART_RADIUS - 0.02);
    if (now && !touching) hits++;
    touching = now;
  }
  console.log(`# clover-meadows autopilot lap: ${t.toFixed(1)} s, ${hits} wall touches`);
  assert.ok(travelled >= track.length, `completed ${travelled} m`);
  assert.ok(hits <= 6, `${hits} wall hits`);
  assert.ok(t > 55 && t < 140, `lap time ${t}`);
});

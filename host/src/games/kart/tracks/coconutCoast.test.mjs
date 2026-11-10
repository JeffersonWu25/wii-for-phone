import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTrack, TRACKS, CUPS, STANDALONE } from './index.js';
import { createKart, stepKart, KART_RADIUS } from '../physics.js';
import { autopilotInput } from '../autopilot.js';

const track = loadTrack('coconut-coast');
const DEG = Math.PI / 180;
const section = (id) => track.sections.find((s) => s.id === id);
const inSection = (s, id) => s >= section(id).s0 && s < section(id).s1;
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

test('registry knows both tracks, the Coconut Cup and the standalone Sunny Meadow', () => {
  assert.deepEqual(Object.keys(TRACKS).sort(), ['coconut-coast', 'sunny-meadow']);
  assert.deepEqual(CUPS, [{ id: 'coconut', name: 'Coconut Cup', tracks: ['coconut-coast', null, null, null] }]);
  assert.deepEqual(STANDALONE, ['sunny-meadow']);
  assert.throws(() => loadTrack('nope'), /unknown track/);
  assert.equal(track.id, 'coconut-coast');
  assert.equal(track.name, 'Coconut Coast');
});

test('lap is 1,100 m and the loop closes within 1 cm and 1e-6 rad', () => {
  assert.ok(Math.abs(track.length - 1100) <= 5, `length ${track.length}`);
  assert.ok(Math.hypot(track.closure.dx, track.closure.dz) < 0.01);
  assert.ok(Math.abs(track.closure.dh) < 1e-6);
});

test('driven counterclockwise: net turning is -360 degrees (left)', () => {
  let net = 0;
  for (let n = 0; n < track.samples.length - 1; n++) net += wrapAngle(track.samples[n + 1].h - track.samples[n].h);
  assert.ok(Math.abs(net / DEG + 360) < 0.01, `net ${net / DEG}`);
});

test('sections run village, sunshine, pier, cliffs, falls, palms, sandy and tile the lap', () => {
  assert.deepEqual(track.sections.map((s) => s.id), ['village', 'sunshine', 'pier', 'cliffs', 'falls', 'palms', 'sandy']);
  assert.equal(track.sections[0].s0, 0);
  track.sections.forEach((s, i) => {
    assert.ok(s.name && s.s1 > s.s0);
    if (i) assert.ok(Math.abs(s.s0 - track.sections[i - 1].s1) < 1e-9);
  });
  assert.ok(Math.abs(track.sections.at(-1).s1 - track.length) < 1e-9);
  assert.equal(track.frameAt(section('pier').s0 + 5).section, 'pier');
});

test('peak is +25 m (±1) inside Lighthouse Cliffs and the lap starts and ends at 0 m', () => {
  let peak = { y: -Infinity, s: 0 };
  for (const sp of track.samples) if (sp.y > peak.y) peak = { y: sp.y, s: sp.s };
  assert.ok(Math.abs(peak.y - 25) <= 1, `peak ${peak.y}`);
  assert.ok(inSection(peak.s, 'cliffs'), `peak at s=${peak.s}`);
  assert.ok(Math.abs(track.heightAt(0, 0)) < 1e-9 && Math.abs(track.heightAt(track.length - 1, 0)) < 1e-9);
  assert.ok(track.heightAt(section('falls').s1 - 1, 0) > 9 && track.heightAt(section('falls').s1 - 1, 0) < 13);
});

test('grade is at most 10% everywhere and 6% on the hairpin', () => {
  const grade = (s0, s1) => Math.max(...track.samples.filter((p) => p.s >= s0 && p.s <= s1).map((p) => Math.abs(p.grade)));
  assert.ok(grade(0, track.length) <= 0.1, `max ${grade(0, track.length)}`);
  const hp = track.pieceRange('hairpin');
  assert.ok(grade(hp.s0, hp.s1) <= 0.06, `hairpin ${grade(hp.s0, hp.s1)}`);
});

test('widths: 24 m start straight, 16 m road, 14 m pier and tunnel, 18 m hairpin apex', () => {
  const width = (s) => track.frameAt(s).halfWidth * 2;
  const mid = (tag) => {
    const r = track.pieceRange(tag);
    return (r.s0 + r.s1) / 2;
  };
  assert.ok(Math.abs(width(60) - 24) < 1e-9);
  assert.ok(Math.abs(width(track.length - 20) - 24) < 1e-9, 'grid apron');
  assert.ok(Math.abs(width(mid('sunshine')) - 16) < 1e-9);
  assert.ok(Math.abs(width(mid('c2')) - 16) < 1e-9);
  assert.ok(Math.abs(width(mid('pierMid')) - 14) < 1e-9);
  assert.ok(Math.abs(width(mid('tunnel')) - 14) < 1e-9);
  assert.ok(Math.abs(width(mid('hairpin')) - 18) < 1e-9);
});

test('three item rows: before the line, at the pier entrance, before the tunnel; no boost pads', () => {
  assert.equal(track.itemRows.length, 3);
  const [start, pier, tunnel] = track.itemRows;
  const d = track.length - start.s;
  assert.ok(d > 0 && d <= 10, `row 1 is ${d} m before the line`);
  assert.ok(inSection(pier.s, 'pier') && pier.s - section('pier').s0 < 20, 'row 2 at the pier entrance');
  const tunnelS0 = track.pieceRange('tunnel').s0;
  assert.ok(inSection(tunnel.s, 'falls') && tunnelS0 - tunnel.s > 0 && tunnelS0 - tunnel.s <= 15, 'row 3 just before the tunnel');
  for (const row of track.itemRows) {
    assert.ok(row.laterals.length >= 3);
    for (const l of row.laterals) assert.ok(Math.abs(l) + KART_RADIUS < track.frameAt(row.s).halfWidth, `lateral ${l} on road at s=${row.s}`);
  }
  assert.equal(track.boostPads.length, 0);
});

test('gridSlots(12) is 4 columns by 3 rows, all on the road, at least 4.5 m apart', () => {
  const slots = track.gridSlots(12);
  assert.equal(slots.length, 12);
  assert.equal(new Set(slots.map((g) => g.lateral.toFixed(3))).size, 4);
  for (const g of slots) {
    assert.ok(g.s > track.length - 30, `slot behind the line (s=${g.s})`);
    const surf = track.surfaceAt(g.s, g.lateral);
    assert.equal(surf.kind, 'road');
    assert.ok(Math.abs(g.lateral) + KART_RADIUS < track.frameAt(g.s).halfWidth);
  }
  let min = Infinity;
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) min = Math.min(min, Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z));
  assert.ok(min >= 4.5, `closest pair ${min}`);
  assert.ok(slots[0].s > slots[4].s && slots[4].s > slots[8].s, 'rows step back');
});

test('the pier is wood with hard walls and no runoff; everything else is asphalt', () => {
  const pier = section('pier');
  for (const f of [0.1, 0.5, 0.9]) {
    const s = pier.s0 + (pier.s1 - pier.s0) * f;
    for (const lat of [-5, 0, 5]) assert.equal(track.surfaceAt(s, lat).kind, 'wood', `s=${s} lat=${lat}`);
    if (f !== 0.5) continue; // the ends still blend width and runoff with the neighbouring sections
    const surf = track.surfaceAt(s, 0);
    assert.ok(surf.limitL < 7.01 && surf.limitR < 7.01, `no runoff at s=${s}: ${surf.limitL} ${surf.limitR}`);
    assert.equal(track.surfaceAt(s, 7.5).kind, 'wall');
  }
  for (const p of track.pieces.filter((q) => q.section === 'pier')) {
    assert.equal(p.surface, 'wood');
    assert.ok(p.left.wall && p.right.wall && p.left.runoffWidth === 0 && p.right.runoffWidth === 0);
  }
  assert.equal(track.surfaceAt(60, 0).kind, 'road');
  assert.equal(track.surfaceAt(section('cliffs').s0 + 60, 0).kind, 'road');
  assert.ok(track.pieces.filter((p) => p.surface === 'wood').every((p) => p.section === 'pier'));
});

test('cliffs have a hard railing on the drop side of every bend', () => {
  for (const p of track.pieces.filter((q) => q.section === 'cliffs')) {
    const drop = p.turn === 'left' ? p.right : p.left;
    assert.ok(drop.wall && drop.runoffWidth === 0, p.tag);
  }
});

test('the tunnel is flagged, 60 to 80 m long, with hard edges', () => {
  const tunnels = track.pieces.filter((p) => p.tunnel);
  assert.equal(tunnels.length, 1);
  const r = track.pieceRange(tunnels[0].tag);
  assert.ok(r.s1 - r.s0 >= 60 && r.s1 - r.s0 <= 80, `tunnel ${r.s1 - r.s0} m`);
  assert.equal(tunnels[0].section, 'falls');
  assert.ok(tunnels[0].left.wall && tunnels[0].right.wall);
  assert.equal(track.frameAt((r.s0 + r.s1) / 2).section, 'falls');
});

test('shortcuts are empty until the shortcut part lands', () => {
  assert.deepEqual(track.shortcuts, []);
});

test('an autopilot drives one lap, barely touching a wall, and reports its lap time', () => {
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
  console.log(`# coconut-coast autopilot lap: ${t.toFixed(1)} s, ${hits} wall touches`);
  assert.ok(travelled >= track.length, `completed ${travelled} m`);
  assert.ok(hits <= 3, `${hits} wall hits`);
  assert.ok(t > 40 && t < 70, `lap time ${t}`);
});

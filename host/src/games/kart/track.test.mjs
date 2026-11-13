import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_COUNT } from './track.js';
import { loadTrack } from './tracks/index.js';
import { SHOTS, shotCamera } from './shots.js';

const track = loadTrack('sunny-meadow');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} vs ${b}`);

test('the loop closes within 1 cm and 1e-6 rad', () => {
  assert.ok(Math.hypot(track.closure.dx, track.closure.dz) < 0.01);
  assert.ok(Math.abs(track.closure.dh) < 1e-6);
  const a = track.frameAt(0);
  const b = track.frameAt(track.length - 1e-6);
  near(a.x, b.x, 0.01);
  near(a.z, b.z, 0.01);
});

test('lap length is about 806 m', () => {
  near(track.length, 806, 1);
});

test('road width is 20 on the start straight and 16 mid-T1', () => {
  const { s0: startS0 } = track.pieceRange('start');
  const t1 = track.pieceRange('t1');
  near(track.frameAt(startS0 + 50).halfWidth * 2, 20, 1e-9);
  near(track.frameAt(-20).halfWidth * 2, 20, 1e-9);
  near(track.frameAt((t1.s0 + t1.s1) / 2).halfWidth * 2, 16, 1e-9);
  const sweeper = track.pieceRange('sweeper');
  near(track.frameAt(sweeper.s1 - 0.01).halfWidth * 2, 20, 0.01);
});

test('elevation is 0 at the start and peaks at 5 m on the back straight', () => {
  near(track.frameAt(0).y, 0, 1e-9);
  const back = track.pieceRange('back');
  near(track.frameAt(back.s0 + 70).y, 5, 1e-3);
  near(track.frameAt(back.s0 + 150).y, 0, 1e-3);
  const maxY = Math.max(...track.samples.map((s) => s.y));
  near(maxY, 5, 1e-3);
});

test('the sweeper banks with the right edge lower than the left', () => {
  const sw = track.pieceRange('sweeper');
  const s = (sw.s0 + sw.s1) / 2;
  const fr = track.frameAt(s);
  assert.ok(track.heightAt(s, fr.halfWidth) < track.heightAt(s, -fr.halfWidth));
  near(fr.bank, (10 * Math.PI) / 180, 1e-9);
  near(track.heightAt(s, 0) - track.heightAt(s, 8), 8 * Math.tan(fr.bank), 1e-9);
});

test('project() round-trips frameAt plus a lateral offset', () => {
  for (const s of [3, 120, 175, 250, 330, 420, 520, 600, 700, 790]) {
    for (const lat of [-7, 0, 5.5]) {
      const fr = track.frameAt(s);
      const x = fr.x + fr.rx * lat;
      const z = fr.z + fr.rz * lat;
      const hinted = track.project(x, z, s + 4);
      const global = track.project(x, z);
      for (const p of [hinted, global]) {
        near(p.s, s, 0.02, `s@${s}`);
        near(p.lateral, lat, 0.02, `lat@${s}`);
      }
    }
  }
});

test('project() falls back to a global search when the hint is wrong', () => {
  const fr = track.frameAt(400);
  const p = track.project(fr.x, fr.z, 50);
  near(p.s, 400, 0.02);
});

test('surfaceAt classifies road, curb, runoff and wall', () => {
  const start = track.surfaceAt(70, 0);
  assert.equal(start.kind, 'road');
  near(start.limitR, 10 + 12, 1e-9);
  near(start.limitL, 10 + 16, 1e-9);
  assert.equal(track.surfaceAt(70, 11).kind, 'grass');
  assert.equal(track.surfaceAt(70, 21.9).kind, 'grass');
  assert.equal(track.surfaceAt(70, 22.1).kind, 'wall');

  const t1 = track.pieceRange('t1');
  const mid = (t1.s0 + t1.s1) / 2;
  assert.equal(track.surfaceAt(mid, 8.5).kind, 'curb');
  assert.equal(track.surfaceAt(mid, -8.5).kind, 'curb');
  assert.equal(track.surfaceAt(mid, -12).kind, 'sand');
  assert.equal(track.surfaceAt(mid, 12).kind, 'grass');

  const sw = track.pieceRange('sweeper');
  const smid = (sw.s0 + sw.s1) / 2;
  assert.equal(track.surfaceAt(smid, 12).kind, 'sand');
  assert.equal(track.surfaceAt(smid, -12).kind, 'sand');
});

test('surface normal leans toward the low (right) side on a banked road', () => {
  const sw = track.pieceRange('sweeper');
  const s = (sw.s0 + sw.s1) / 2;
  const fr = track.frameAt(s);
  const n = track.surfaceAt(s, 0);
  assert.ok(n.nx * fr.rx + n.nz * fr.rz > 0.1, 'normal tilts toward the downhill right side');
  near(Math.hypot(n.nx, n.ny, n.nz), 1, 1e-9);
});

test('terrainHeight equals heightAt at the corridor limits and is continuous past them', () => {
  for (const s of [70, 250, 330, 450, 650]) {
    for (const side of [-1, 1]) {
      const e = track.surfaceAt(s, 0);
      const limit = side > 0 ? e.limitR : e.limitL;
      const fr = track.frameAt(s);
      const at = (lat) => track.terrainHeight(fr.x + fr.rx * lat, fr.z + fr.rz * lat);
      near(at(side * (limit - 0.01)), track.heightAt(s, side * (limit - 0.01)), 0.02, `inside s=${s}`);
      near(at(side * (limit + 0.01)), track.heightAt(s, side * limit), 0.05, `limit s=${s}`);
      near(at(side * (limit + 0.5)), at(side * (limit + 0.51)), 0.02);
    }
  }
});

test('terrain falls to base level away from the track and rolls far away', () => {
  near(track.terrainHeight(70, 85), 0, 1e-9);
  let max = 0;
  for (let x = -600; x <= 700; x += 25) for (let z = -600; z <= 700; z += 25) max = Math.max(max, track.terrainHeight(x, z));
  assert.ok(max > 4 && max <= 12.5, `far hills peak ${max}`);
});

test('8 checkpoints sit at increasing s starting at the line', () => {
  assert.equal(track.checkpoints.length, CHECKPOINT_COUNT);
  assert.equal(track.checkpoints[0].s, 0);
  for (let i = 1; i < track.checkpoints.length; i++) assert.ok(track.checkpoints[i].s > track.checkpoints[i - 1].s);
  assert.ok(track.checkpoints[7].s < track.length);
});

test('two boost pads sit on the back straight', () => {
  const back = track.pieceRange('back');
  assert.equal(track.boostPads.length, 2);
  for (const pad of track.boostPads) {
    assert.ok(pad.s > back.s0 && pad.s < back.s1);
    assert.equal(pad.length, 6);
    assert.equal(pad.width, 4);
  }
});

test('grid slots are staggered behind the line, 2 wide', () => {
  const slots = track.gridSlots(4);
  assert.equal(slots.length, 4);
  assert.ok(slots.every((g) => g.s > track.length - 30));
  assert.equal(new Set(slots.map((g) => g.lateral)).size, 2);
  assert.ok(slots[0].s > slots[2].s);
});

test('every named shot yields a finite camera above the ground', () => {
  for (const name of Object.keys(SHOTS['sunny-meadow'])) {
    const cam = shotCamera(track, name);
    assert.ok(Object.values({ ...cam.position, ...cam.target }).every(Number.isFinite), name);
    assert.ok(cam.position.y > track.terrainHeight(cam.position.x, cam.position.z), `${name} above terrain`);
  }
  assert.ok(shotCamera(track, 'overview').position.y > 40);
});

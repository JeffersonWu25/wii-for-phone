// Lighthouse Cliffs (rock faces on the inside of the bends, timber railing and rock skirt on the drop side, lighthouse
// on top) and Hidden Falls (waterfall pool, rock tunnel shell, wet road, warm lamps).
import * as THREE from 'three';
import { Batch, COL, mats, place, propGroup, section, xform, rowsOf, sweep, smooth, waterfallTex, lodAt, rng } from './kit.js';
import { lighthouseGeometry, rockGeometry, cyl, box } from './models.js';
import { fence, rockWall, skirt, palmProp, palmGroup, scatter } from './parts.js';

const hmax = (s) => 9 + 3 * Math.sin(s * 0.05);

// Contiguous s ranges where one side has a hard edge (railing side).
export function hardRuns(track, side, s0, s1, wantHard = true) {
  const rows = rowsOf(track, s0, s1, 1);
  const runs = [];
  let cur = null;
  for (const r of rows) {
    const hard = (side > 0 ? r.hardR : r.hardL) === wantHard;
    if (hard && !cur) cur = [r.s, r.s];
    if (hard && cur) cur[1] = r.s;
    if (!hard && cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs.filter(([a, b]) => b - a > 6);
}

export function buildCliffs(ctx, sec) {
  const { track, isl } = ctx;
  const g = section('cliffs');
  const { s0, s1 } = sec;
  const c = place(track, (s0 + s1) / 2, 0);
  const H = (side) => (row) => (side > 0 ? smooth(0.5, 4, row.sp.runR) : smooth(0.5, 4, row.sp.runL)) * hmax(row.s) * smooth(s0 - 8, s0 + 6, row.s);

  const faces = new Batch();
  for (const side of [-1, 1]) faces.add(rockWall(track, side, s0 - 8, s1 + 8, H(side)), null, null);
  const skirts = [];
  const rails = new Batch();
  for (const side of [-1, 1]) {
    for (const [a, b] of hardRuns(track, side, s0 - 6, s1 + 6)) {
      fence(track, rails, side, a, b, 'timber');
      faces.add(skirt(track, side, a, b), null, null);
    }
  }
  void skirts;
  g.add(propGroup('cliffFace', [faces.mesh(mats.rock(), { shadow: true, receive: true })]));
  g.add(lodAt(ctx, propGroup('railing', [rails.mesh(mats.col(), { shadow: true })]), c.x, c.z, 420));

  // Lighthouse on the plateau of the inside wall.
  const ls = 470;
  const lr = rowsOf(track, ls, ls, 1)[0];
  const side = lr.sp.runL > lr.sp.runR ? -1 : 1;
  const lim = side > 0 ? lr.limR : lr.limL;
  const lat = side * (lim + 2.3 + 5.5);
  const base = place(track, ls, lat);
  const topY = track.heightAt(ls, side * lim) + H(side)(lr) + 0.15;
  const lh = lighthouseGeometry();
  const lc = new Batch().add(lh.col, xform(base.x, topY, base.z, 0.4), null);
  lc.add(rockGeometry(9, { rTop: 4.4, rBot: 5.4, h: 1.4, seg: 10, cap: false, tone: 0xb8b0a4 }), xform(base.x, topY - 0.3, base.z), null);
  const lg = new Batch().add(lh.glow, xform(base.x, topY, base.z, 0.4), null);
  g.add(propGroup('lighthouse', [lc.mesh(mats.col(), { shadow: true }), lg.mesh(mats.glow())]));

  // Palms on the plateaus and on the drop side.
  const spots = [];
  const r = rng(5);
  for (let s = s0; s < s1; s += 5) {
    const row = rowsOf(track, s, s, 1)[0];
    for (const sd of [-1, 1]) {
      const h = H(sd)(row);
      const lim2 = sd > 0 ? row.limR : row.limL;
      if (h > 4 && r() < 0.55) {
        const l = sd * (lim2 + 3.5 + r() * 6);
        const p = place(track, s + r() * 4, l);
        if (Math.hypot(p.x - base.x, p.z - base.z) > 7) spots.push({ x: p.x, y: track.heightAt(s, sd * lim2) + h - 0.1, z: p.z, ry: r() * 6, sc: 1 + r() * 0.6 });
      }
    }
  }
  spots.push(...scatter(track, isl, 0, s0, s1, { n: 40, lats: [3, 14], seed: 8, min: 3 }));
  g.add(palmProp(spots, 90));
  return g;
}

export function buildFalls(ctx, sec) {
  const { track, isl } = ctx;
  const g = section('falls');
  const tun = track.pieces.find((p) => p.tunnel);
  const { s0: t0, s1: t1 } = track.pieceRange(tun.tag);
  const wf = track.pieceRange('waterfall');
  const c = place(track, (sec.s0 + sec.s1) / 2, 0);

  // Waterfall straight: tall rock mass on the left set back from the road (pool in front), low wall on the right.
  const SET = 2.5;
  const HL = (row) => 17 * smooth(wf.s0 - 6, wf.s0 + 8, row.s) * (1 - smooth(t0 - 14, t0 - 2, row.s));
  const HR = (row) => 6 * smooth(wf.s0 - 6, wf.s0 + 8, row.s) * (1 - smooth(t0 - 8, t0 - 1, row.s));
  const faces = new Batch();
  faces.add(rockWall(track, -1, wf.s0 - 6, t0 - 1, HL, { setback: SET, top: 14 }), null, null);
  faces.add(rockWall(track, 1, wf.s0 - 6, t0 - 1, HR, { top: 7 }), null, null);
  const exitH = (row) => 6 * smooth(t1 + 14, t1 + 2, row.s);
  for (const sd of [-1, 1]) faces.add(rockWall(track, sd, t1 - 1, sec.s1 + 10, exitH, { top: 8 }), null, null);

  // Tunnel shell: inner arch (what the camera sees), outer green-capped mound, flared portals at both mouths.
  const rows = rowsOf(track, t0 - 3, t1 + 3, 0.75);
  const WALL = 2.4;
  const RY = 6.8;
  const arch = (row, k, K, grow, lift = 0) => {
    const A = row.hw + 0.15 + grow;
    const ph = (k / K) * Math.PI;
    return { lat: -A * Math.cos(ph), dy: WALL + (RY + grow * 0.9) * Math.sin(ph) + lift };
  };
  const K = 12;
  const rockCol = new THREE.Color(0x9a97a0);
  const warm = new THREE.Color(0xb09c88);
  const inner = sweep(rows, (row) => {
    const u = row.sw / 6;
    const pts = [{ lat: -(row.hw + 0.15), dy: -0.3, u, v: 0, c: 0x4a4850 }];
    for (let k = 0; k <= K; k++) {
      const a = arch(row, k, K, 0);
      pts.push({ ...a, u, v: 0.2 + k * 0.2, c: rockCol.clone().lerp(warm, 0.4 + 0.4 * Math.sin(row.s * 0.3 + k)).getHex() });
    }
    pts.push({ lat: row.hw + 0.15, dy: -0.3, u, v: 4, c: 0x4a4850 });
    return [pts];
  });
  const outer = sweep(rows, (row) => {
    const u = row.sw / 6;
    const G = 5.5;
    const pts = [{ lat: -(row.hw + 0.15 + G + 5), dy: -22, u, v: 0, c: 0x6c6c74 }];
    for (let k = 0; k <= K; k++) {
      const a = arch(row, k, K, G, 0.4 * Math.sin(row.s * 0.4 + k * 1.7));
      const grassy = k > 2 && k < K - 2;
      pts.push({ ...a, u, v: k * 0.3, c: grassy ? (k === 6 ? 0x58b83c : 0x4fa83a) : 0xb4ad9f });
    }
    pts.push({ lat: row.hw + 0.15 + G + 5, dy: -22, u, v: 5, c: 0x6c6c74 });
    return [pts];
  });
  const shell = new Batch().add(inner, null, null).add(outer, null, null);
  for (const [s, sign] of [[t0 - 3, 1], [t1 + 3, 1]]) {
    const row = rowsOf(track, s, s, 1)[0];
    const pos = [];
    const col = [];
    const idx = [];
    for (let k = 0; k <= K; k++) {
      for (const grow of [0, 5.5]) {
        const a = arch(row, k, K, grow);
        const p = row.at(a.lat, a.dy);
        pos.push(...p);
        const cc = new THREE.Color(grow ? 0x8f887c : 0x5a5860);
        col.push(cc.r, cc.g, cc.b);
      }
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    gg.setIndex(idx);
    gg.computeVertexNormals();
    shell.add(gg, null, null);
    void sign;
  }
  // Portal boulders.
  const bo = new Batch();
  for (const [s, k] of [[t0 - 4, 0], [t1 + 4, 1]]) {
    for (const sd of [-1, 1]) {
      const p = place(track, s, sd * 10.5);
      bo.add(rockGeometry(40 + k * 3 + (sd > 0 ? 1 : 0), { rTop: 1.5, rBot: 2.8, h: 4.5, seg: 8, cap: false }), xform(p.x, p.y - 0.8, p.z, k + sd), null);
    }
  }
  const shellMesh = shell.mesh(mats.rock(), { shadow: true, receive: true });
  g.add(propGroup('tunnelShell', [shellMesh]));
  g.add(propGroup('cliffFace', [faces.mesh(mats.rock(), { shadow: true, receive: true }), bo.mesh(mats.rock(), { shadow: true })]));

  // Dark wet road through the tunnel, with its own lane lines.
  const wetRows = rowsOf(track, t0 - 5, t1 + 7, 1);
  const wet = sweep(wetRows, (row) => [[{ lat: -row.hw, dy: 0.06, u: 0, v: row.sw / 10 }, { lat: row.hw, dy: 0.06, u: 1, v: row.sw / 10 }]]);
  g.add(propGroup('wetRoad', [new Batch().add(wet, null, null).mesh(mats.wet(), { receive: true })]));

  // Warm lamps on both walls and along the ceiling.
  const lampRows = [];
  const lights = new Batch();
  const fix = new Batch();
  for (let s = t0 + 2; s < t1; s += 6) lampRows.push(rowsOf(track, s, s, 1)[0]);
  lampRows.forEach((row, i) => {
    for (const sd of [-1, 1]) {
      const A = row.hw + 0.05;
      const [x, y, z] = row.at(sd * (A - 0.15), 3.4);
      fix.add(box(0.3, 0.6, 0.3), xform(x, y, z, -row.h), 0x3a2a1a);
      lights.add(new THREE.SphereGeometry(0.3, 8, 6), xform(x, y, z), 0xffc060);
      const [cx, cy, cz] = row.at(sd * 3.2, WALL + RY * Math.sqrt(1 - (3.2 / (A + 0.1)) ** 2) - 0.45);
      lights.add(new THREE.SphereGeometry(0.22, 6, 5), xform(cx, cy, cz), i % 2 ? 0xffe08a : 0xffb050);
    }
  });
  for (const [s, sd] of [[t0 - 6, -1], [t0 - 6, 1], [t1 + 6, -1], [t1 + 6, 1]]) {
    const p = place(track, s, sd * (track.frameAt(s).halfWidth + 1.6));
    fix.add(cyl(0.1, 0.12, 2.6, 5), xform(p.x, p.y + 1.3, p.z), COL.woodDark);
    lights.add(new THREE.SphereGeometry(0.34, 7, 5), xform(p.x, p.y + 2.8, p.z), 0xffb040);
  }
  g.add(propGroup('tunnelLights', [lights.mesh(mats.glow()), fix.mesh(mats.col())]));

  // Waterfall: a textured sheet down the rock face, foam at the base, a pool between face and road.
  const ws = t0 - 13;
  const wr = rowsOf(track, ws, ws, 1)[0];
  const faceLat = -(wr.limL + SET);
  const fall = new Batch();
  const fp = place(track, ws, faceLat + 1.3);
  const Hf = HL(wr);
  const tilt = Math.atan(2.1 / Hf);
  const sheet = new THREE.PlaneGeometry(7.5, Hf * 1.05, 1, 1);
  const tex = waterfallTex();
  const fm = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x6aa8c8, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  sheet.translate(0, Hf * 0.52, 0);
  const sheetUv = sheet.attributes.uv;
  for (let i = 0; i < sheetUv.count; i++) sheetUv.setXY(i, sheetUv.getX(i), sheetUv.getY(i) * 2.2);
  const sheetMesh = new THREE.Mesh(sheet, fm);
  sheetMesh.matrixAutoUpdate = false;
  sheetMesh.matrix.copy(xform(fp.x, isl.heightAt(fp.x, fp.z) + 0.2 - Hf * 0.0, fp.z, -fp.h, 1, 1, 1, -tilt));
  sheetMesh.matrixWorldNeedsUpdate = true;
  ctx.anim.push((t) => { tex.offset.y = -t * 0.9; });
  const poolY = (row, lat) => track.heightAt(row.s, lat) + 0.12;
  const pool = new THREE.CircleGeometry(1, 20);
  const pp = place(track, ws, -(wr.limL + 1.5));
  const poolMat = new THREE.MeshLambertMaterial({ color: 0x35c8d8, emissive: 0x1c7c90, side: THREE.DoubleSide });
  const poolMesh = new THREE.Mesh(pool, poolMat);
  poolMesh.matrixAutoUpdate = false;
  poolMesh.matrix.copy(xform(pp.x, poolY(wr, -(wr.limL + 1)), pp.z, -pp.h, 6, 1.7, 1, -Math.PI / 2));
  poolMesh.matrixWorldNeedsUpdate = true;
  const foamB = new Batch();
  const rr = rng(66);
  for (let i = 0; i < 16; i++) {
    const a = rr() * 6.28;
    const rad = 0.5 + rr() * 1.4;
    foamB.add(new THREE.IcosahedronGeometry(0.5 + rr() * 0.9, 0), xform(fp.x + Math.cos(a) * rad * 1.6, poolY(wr, faceLat) + 0.2 + rr() * 0.5, fp.z + Math.sin(a) * rad * 1.6 - 0.8), 0xf4fdff);
  }
  const rim = new Batch();
  for (let i = 0; i < 9; i++) {
    const p = place(track, ws - 7 + i * 1.9, -(wr.limL + 0.2));
    rim.add(rockGeometry(80 + i, { rTop: 0.5, rBot: 1.0, h: 0.7 + (i % 3) * 0.3, seg: 6, cap: false }), xform(p.x, p.y - 0.15, p.z, i), null);
  }
  g.add(propGroup('waterfall', [sheetMesh, poolMesh, foamB.mesh(mats.col()), rim.mesh(mats.rock(), { shadow: true })]));

  // Palms around the mouth and on the mound.
  const spots = scatter(track, isl, 0, t1 - 10, sec.s1, { n: 22, lats: [6, 16], seed: 19, min: 2 });
  for (let s = t0 + 4; s < t1 - 4; s += 7) {
    const sd = s % 14 < 7 ? -1 : 1;
    const p = place(track, s, sd * (4 + (s % 5)));
    spots.push({ x: p.x, y: p.y + 11.2, z: p.z, ry: s, sc: 1.2 });
  }
  g.add(palmProp(spots, 90));
  void c;
  return g;
}

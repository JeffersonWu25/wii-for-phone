// Palm Grove (chevron signs and guardrail on the outside of the hairpin, dense jungle) and Sandy Sprint (sand shortcut
// path split from the asphalt by wooden fencing, post fences along the limits).
import * as THREE from 'three';
import { Batch, COL, mats, place, propGroup, section, xform, rowsOf, sweep, lodAt } from './kit.js';
import { box, cyl } from './models.js';
import { fence, palmProp, palmGroup, scatter, rect } from './parts.js';
import { hardRuns } from './cliffs.js';

export function buildGrove(ctx, sec) {
  const { track, isl } = ctx;
  const g = section('palms');
  const { s0, s1 } = sec;
  const hp = track.pieceRange('hairpin');
  const c = place(track, (s0 + s1) / 2, 0);

  const guard = new Batch();
  const fB = new Batch();
  for (const [a, b] of hardRuns(track, 1, s0 - 4, s1 + 4)) fence(track, guard, 1, a, b, 'guard', { off: 0.35 });
  for (const side of [-1, 1]) for (const [a, b] of hardRuns(track, side, s0, s1, false)) fence(track, fB, side, a, b, 'post');
  g.add(lodAt(ctx, propGroup('guardrail', [guard.mesh(mats.col(), { shadow: true })]), c.x, c.z, 420));
  g.add(lodAt(ctx, propGroup('fence', [fB.mesh(mats.col(), { shadow: true })]), c.x, c.z, 420));

  // Chevron boards on posts behind the guardrail, facing the road.
  const posts = new Batch();
  const boards = new Batch();
  const board = new THREE.PlaneGeometry(2.4, 1.8);
  for (let s = hp.s0 + 3; s < hp.s1 - 1; s += 6.5) {
    const r = rowsOf(track, s, s, 1)[0];
    const [x, y, z] = r.at(r.limR + 1.1);
    posts.add(cyl(0.09, 0.11, 2.8, 6), xform(x, y + 1.4, z), 0x5a5a60);
    boards.add(board, xform(x, y + 2.7, z, -r.h + Math.PI, 1, 1, 1), 0xffffff);
    boards.add(box(2.6, 0.12, 0.08), xform(x, y + 3.65, z, -r.h), 0xf2f2f2);
  }
  g.add(lodAt(ctx, propGroup('chevrons', [posts.mesh(mats.col(), { shadow: true }), boards.mesh(mats.chevron(), { shadow: true })]), c.x, c.z, 420));

  // Dense jungle: palms on both sides to well beyond the limits.
  const spots = [
    ...scatter(track, isl, -1, s0, s1, { n: 90, lats: [2, 30], seed: 21, scale: [0.95, 1.7] }),
    ...scatter(track, isl, 1, s0, s1, { n: 90, lats: [2, 26], seed: 22, scale: [0.95, 1.7] }),
  ];
  g.add(palmProp(spots, 22));
  return g;
}

export function buildSandy(ctx, sec) {
  const { track, isl } = ctx;
  const g = section('sandy');
  const { s0, s1 } = sec;
  const c = place(track, (s0 + s1) / 2, 0);

  const group = new THREE.Group();
  group.name = 'shortcuts';
  for (const sc of track.shortcuts) {
    const rows = sc.samples.map((p, i, a) => {
      const q = a[Math.min(a.length - 1, i + 1)];
      const o = a[Math.max(0, i - 1)];
      const len = Math.hypot(q.x - o.x, q.z - o.z) || 1;
      const rx = -(q.z - o.z) / len;
      const rz = (q.x - o.x) / len;
      return { sw: i, p, rx, rz, h: Math.atan2(q.z - o.z, q.x - o.x), at: (lat, dy = 0) => [p.x + rx * lat, p.y + dy, p.z + rz * lat] };
    });
    const sand = sweep(rows, (row) => {
      const w = row.p.halfWidth;
      const tone = new THREE.Color(0xf2d98e);
      const dark = new THREE.Color(0xd9b86a);
      const pts = [
        { lat: -w - 0.7, dy: -0.25, c: 0xcfae62 },
        { lat: -w, dy: 0.1, c: dark.getHex() },
        { lat: -w * 0.45, dy: 0.12, c: 0xe6c97a },
        { lat: -w * 0.3, dy: 0.12, c: dark.clone().lerp(tone, 0.5).getHex() },
        { lat: 0, dy: 0.13, c: tone.getHex() },
        { lat: w * 0.3, dy: 0.12, c: dark.clone().lerp(tone, 0.5).getHex() },
        { lat: w * 0.45, dy: 0.12, c: 0xe6c97a },
        { lat: w, dy: 0.1, c: dark.getHex() },
        { lat: w + 0.7, dy: -0.25, c: 0xcfae62 },
      ];
      return [pts];
    });
    const sb = new Batch().add(sand, null, null);
    const pathGroup = propGroup('sandPath', [sb.mesh(mats.sand(), { receive: true })]);

    // Wooden fencing between path and road (both edges of the gap) and along the path's outer edge.
    const fenceB = new Batch();
    const gapRows = rowsOf(track, sc.s0, sc.s1, 1).map((r) => ({ r, f: track.surfaceAt(r.s, 0).fence }));
    const runs = [];
    let cur = null;
    for (const { r, f } of gapRows) {
      if (f && !cur) cur = [];
      if (f) cur.push({ r, f });
      if (!f && cur) {
        runs.push(cur);
        cur = null;
      }
    }
    if (cur) runs.push(cur);
    for (const run of runs) {
      if (run.length < 4) continue;
      const rr = run.map((x) => x.r);
      for (const key of ['lo', 'hi']) {
        const off = key === 'lo' ? 0.15 : -0.15;
        const geo = sweep(rr, (row) => {
          const f = run[rr.indexOf(row)].f;
          const lat = f[key] + off;
          return [0.4, 0.85].map((dy) => rect(lat, dy, 0.07, 0.07, COL.woodLight));
        });
        fenceB.add(geo, null, null);
        for (let i = 0; i < rr.length; i += 3) {
          const [x, y, z] = rr[i].at(run[i].f[key] + off);
          fenceB.add(box(0.26, 1.05, 0.26), xform(x, y + 0.52, z, -rr[i].h), COL.wood);
        }
      }
    }
    const outer = sweep(rows, (row) => {
      const lat = -(row.p.halfWidth + 0.55);
      return [0.4, 0.85].map((dy) => rect(lat, dy + 0.1, 0.07, 0.07, COL.woodLight));
    });
    fenceB.add(outer, null, null);
    rows.forEach((row, i) => {
      if (i % 6) return;
      const [x, y, z] = row.at(-(row.p.halfWidth + 0.55), 0.1);
      fenceB.add(box(0.26, 1.05, 0.26), xform(x, y + 0.52, z, -row.h), COL.wood);
    });
    group.add(pathGroup, propGroup('fence', [fenceB.mesh(mats.col(), { shadow: true })]));
  }
  g.add(group);
  const lim = new Batch();
  fence(track, lim, 1, s0, 1062, 'post');
  g.add(lodAt(ctx, propGroup('limitFence', [lim.mesh(mats.col(), { shadow: true })]), c.x, c.z, 420));

  const nearPath = (x, z) => track.shortcuts.some((sc) => sc.samples.some((p) => Math.hypot(p.x - x, p.z - z) < p.halfWidth + 6));
  const spots = [
    ...scatter(track, isl, -1, s0, s1, { n: 14, lats: [3, 24], seed: 31, skip: (row, lat, x, z) => nearPath(x, z) }),
    ...scatter(track, isl, 1, s0, s1, { n: 18, lats: [3, 20], seed: 32 }),
  ];
  g.add(palmProp(spots, 40));
  void isl;
  return g;
}

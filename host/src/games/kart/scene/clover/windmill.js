// Windmill Tunnel: a stone mound with an arched tunnel the road runs through and a red tower on top (no blades: hazards.js owns
// those; the hub position is published as ctx.windmill), plus the left-hand bypass as a fenced dirt road with its boost pad.
import * as THREE from 'three';
import { Batch, mats, propGroup, rowsOf, section, sweep, xform } from '../coconut/kit.js';
import { box, cyl } from '../coconut/models.js';
import { flora } from './flora.js';
import { CL, chevTex, cutRange, fenceLine, ground } from './kit.js';

const WALL = 2.4;
const RY = 5.8;
const K = 12;
export const HUB_RISE = WALL + RY + 5.5 * 0.9 + 14; // m, rotor hub above the road at the tower
export const ARCH_HALF = (hw) => hw + 0.15; // m, arch opening half-width over a road of half-width hw
const archPt = (hw, k, grow, lift = 0) => {
  const A = hw + 0.15 + grow;
  const ph = (k / K) * Math.PI;
  return { lat: -A * Math.cos(ph), dy: WALL + (RY + grow * 0.9) * Math.sin(ph) + lift };
};

// Stone mound: dark inner arch, outer arch capped in grass, flared portal rings at both mouths.
function mound(track, t0, t1) {
  const rows = rowsOf(track, t0 - 3, t1 + 3, 0.75);
  const stone = new THREE.Color(CL.stone);
  const warm = new THREE.Color(0xc9b8a0);
  const inner = sweep(rows, (row) => {
    const u = row.sw / 6;
    const pts = [{ lat: -(row.hw + 0.15), dy: -0.3, u, c: 0x6a625a }];
    for (let k = 0; k <= K; k++) pts.push({ ...archPt(row.hw, k, 0), u, c: stone.clone().lerp(warm, 0.5 + 0.5 * Math.sin(row.s * 0.4 + k)).multiplyScalar(0.85).getHex() });
    pts.push({ lat: row.hw + 0.15, dy: -0.3, u, c: 0x6a625a });
    return [pts];
  });
  const G = 5.5;
  const outer = sweep(rows, (row) => {
    const u = row.sw / 6;
    const pts = [{ lat: -(row.hw + 0.15 + G + 4), dy: -14, u, c: CL.stoneDark }];
    for (let k = 0; k <= K; k++) pts.push({ ...archPt(row.hw, k, G, 0.35 * Math.sin(row.s * 0.5 + k * 1.7)), u, c: k > 2 && k < K - 2 ? (k % 2 ? 0x5cbf3a : 0x4fae34) : CL.stone });
    pts.push({ lat: row.hw + 0.15 + G + 4, dy: -14, u, c: CL.stoneDark });
    return [pts];
  });
  const b = new Batch().add(inner, null, null).add(outer, null, null);
  for (const s of [t0 - 3, t1 + 3]) {
    const row = rowsOf(track, s, s, 1)[0];
    const pos = [];
    const col = [];
    const idx = [];
    for (let k = 0; k <= K; k++) {
      for (const grow of [0, G]) {
        pos.push(...row.at(archPt(row.hw, k, grow).lat, archPt(row.hw, k, grow).dy));
        const c = new THREE.Color(grow ? 0xa59e90 : 0x78706a);
        col.push(c.r, c.g, c.b);
      }
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add(g, null, null);
  }
  return b;
}

// Octagonal red tower with white band, cream cap and a hub stub on the entrance face. Local origin at the tower's base centre.
function tower(b, R, H) {
  b.add(cyl(R * 0.62, R, H, 8), xform(0, H / 2, 0), CL.red);
  for (const [y, w] of [[H * 0.34, 0.22], [H * 0.68, 0.18]]) b.add(cyl(R * (1 - 0.38 * (y / H)) + 0.12, R * (1 - 0.38 * (y / H)) + 0.12, w, 8), xform(0, y, 0), CL.white);
  b.add(cyl(R * 0.7, R * 0.66, 0.6, 8), xform(0, H + 0.3, 0), CL.cream);
  b.add(new THREE.ConeGeometry(R * 0.72, R * 0.9, 8), xform(0, H + 0.6 + R * 0.45, 0), CL.cream);
  b.add(new THREE.SphereGeometry(0.5, 8, 6), xform(0, H + 0.6 + R * 0.92, 0), CL.red);
  for (const a of [0, Math.PI]) {
    b.add(box(1.1, 1.8, 0.1), xform(Math.cos(a) * R * 0.76, H * 0.5, Math.sin(a) * R * 0.76, -a), 0xf6e7b0);
  }
}

export function buildWindmill(ctx, sec) {
  const { track } = ctx;
  const g = section('windmill');
  const { s0: t0, s1: t1 } = track.pieceRange('tunnel');
  const m = mound(track, t0, t1);
  const topY = WALL + RY + 5.5 * 0.9;
  // Tower sits on the mound over the entrance end so the blades (hazards.js) turn just in front of the arch.
  const sT = t0 + 12;
  const c = ground(track, sT, 0);
  const tb = new Batch();
  tb.add(cyl(10.5, 11.5, 3, 10), xform(c.x, c.y + topY - 1.2, c.z, 0), CL.stone);
  const mat = xform(c.x, c.y + topY + 0.2, c.z, -c.h);
  const tmp = new Batch();
  tower(tmp, 8.2, 22);
  for (const geo of tmp.geos) tb.add(geo, mat, null);
  // Hub stub on the tower's entrance face; ctx.windmill tells the hazards agent where the blades' axle is (axis along the road).
  const hub = ground(track, sT - 6.6, 0);
  const stub = cyl(0.8, 0.8, 2.6, 8);
  stub.rotateZ(Math.PI / 2);
  tb.add(stub, xform(hub.x, c.y + HUB_RISE, hub.z, -c.h), CL.woodDark);
  ctx.windmill = { s: t0, hub: { x: hub.x, y: c.y + HUB_RISE, z: hub.z }, heading: c.h, archTop: WALL + RY, halfWidth: c.f.halfWidth, tower: { x: c.x, y: c.y + topY, z: c.z } };
  g.add(propGroup('tunnelShell', [m.mesh(mats.col(), { shadow: true, receive: true })]), propGroup('tower', [tb.mesh(mats.col(), { shadow: true })]));

  // Bypass: dirt road ribbon over the grass, rails on both sides, and the blue boost pad drawn on it.
  const sc = track.shortcuts.find((x) => x.id === 'bypass');
  if (sc) g.add(...bypass(ctx, sc));

  flora(ctx, g, sec.s0 - 10, sec.s1 + 10, { trees: 5, bushes: 4, flowers: 18, rocks: 3, seed: 4, treeLats: [14, 60], skip: (s, lat) => lat < 0 && cutRange(s, s, sc.s0 - 20, sc.s1 + 20) && lat > -80 });
  return g;
}

function bypass(ctx, sc) {
  const { track } = ctx;
  const out = [];
  const pts = sc.samples;
  const strip = (cs, pick) => {
    const pos = [];
    const col = [];
    const idx = [];
    const tan = (i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return [(b.x - a.x) / l, (b.z - a.z) / l];
    };
    pts.forEach((p, i) => {
      if (!pick(i)) return;
      const [tx, tz] = tan(i);
      const rx = -tz;
      const rz = tx;
      cs.forEach(([lat, c, dy]) => {
        pos.push(p.x + rx * lat, track.terrainHeight(p.x + rx * lat, p.z + rz * lat) + dy, p.z + rz * lat);
        const k = new THREE.Color(c);
        col.push(k.r, k.g, k.b);
      });
    });
    const n = pos.length / 3 / cs.length;
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < cs.length - 1; j++) {
      const a = i * cs.length + j;
      const b = a + cs.length;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const dirt = strip([[-6.5, CL.grassDark, 0.04], [-5.6, 0xa9703a, 0.06], [-3, CL.dirt, 0.07], [0, CL.dirtLight, 0.07], [3, CL.dirt, 0.07], [5.6, 0xa9703a, 0.06], [6.5, CL.grassDark, 0.04]], () => true);
  out.push(propGroup('bypass', [new THREE.Mesh(dirt, mats.sand())]));

  const fb = new Batch();
  const half = sc.width / 2;
  fenceLine(track, fb, sc.s0 + 4, sc.s1 - 4, (s) => sc.lateralAt(s) - half - 0.6);
  fenceLine(track, fb, sc.s0 + 4, sc.s1 - 4, (s) => sc.lateralAt(s) + half + 0.6);
  out.push(propGroup('fence', [fb.mesh(mats.col(), { shadow: true })]));

  const pad = track.boostPads.find((p) => p.lateral < -20);
  if (pad) {
    const tex = chevTex('#0b49b8', '#8fe8ff');
    tex.repeat.set(1, 3);
    const lo = sc.samples.findIndex((p) => track.project(p.x, p.z).s >= pad.s - pad.length / 2);
    const hi = sc.samples.findIndex((p) => track.project(p.x, p.z).s >= pad.s + pad.length / 2);
    const g = strip([[-pad.width / 2, 0x0b49b8, 0.11], [pad.width / 2, 0x0b49b8, 0.11]], (i) => i >= lo && i <= hi);
    const n = g.attributes.position.count / 2;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: n * 2 }, (_, i) => [i % 2, Math.floor(i / 2) / (n - 1)]).flat(), 2));
    const m = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    ctx.anim.push((t) => { tex.offset.y = -t * 0.9; });
    out.push(propGroup('padDecal', [new THREE.Mesh(g, m)]));
  }
  return out;
}

// Wildflower S-Curves and Meadow Obstacle Field: flower meadows and trees, grass/mud patches and boost ramps drawn on the road.
import * as THREE from 'three';
import { Batch, mats, propGroup, rng, section } from '../coconut/kit.js';
import { flora } from './flora.js';
import { CL, blobMesh, chevTex } from './kit.js';
import { cloverMeadows } from '../../tracks/cloverMeadows.js';

// Patches resolved to world s: the engine's track.patches when present, else the definition's piece/at.
export function patchesOf(track) {
  if (track.patches) return track.patches;
  return (cloverMeadows.patches ?? []).map((p) => {
    const { s0, s1 } = track.pieceRange(p.piece);
    return { ...p, s: p.at === 'end' ? s1 : s0 + p.at };
  });
}

// Boundary radius (0.7..1.3 of the nominal ellipse) per angle: probed from track.patchAt when the engine provides it.
function outline(track, p) {
  const wob = rng((p.seed ?? 1) * 97 + 5);
  const ph = [wob() * 6.28, wob() * 6.28, wob() * 6.28];
  return (a) => {
    if (track.patchAt) {
      let k = 0.7;
      while (k < 1.35 && track.patchAt(p.s + Math.cos(a) * (p.length / 2) * (k + 0.03), p.lateral + Math.sin(a) * (p.width / 2) * (k + 0.03))?.id === p.id) k += 0.03;
      return k;
    }
    return 0.92 + 0.12 * Math.sin(a * 3 + ph[0]) + 0.08 * Math.sin(a * 5 + ph[1]);
  };
}

function patchMesh(track, p, tufts) {
  const r = rng((p.seed ?? 1) * 31 + 2);
  const grass = p.kind === 'grass';
  const inner = new THREE.Color(grass ? 0x5cbf3a : 0x5a3c22);
  const rim = new THREE.Color(grass ? 0x3f9a2e : 0x7d5a38);
  const c = new THREE.Color();
  const geo = blobMesh(track, p.s, p.lateral, p.length, p.width, outline(track, p), (k) => c.copy(inner).lerp(rim, k * k * (0.6 + 0.4 * r())).getHex(), { rings: 3, seg: 28, lift: 0.05 });
  if (grass) {
    // tufts of tall grass scattered inside, so grass reads as slowdown from a distance
    const n = Math.round((p.length * p.width) / 5);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28;
      const d = Math.sqrt(r()) * 0.62;
      const f = track.frameAt(p.s + Math.cos(a) * d * (p.length / 2));
      const l = p.lateral + Math.sin(a) * d * (p.width / 2);
      const y = track.heightAt(f.s, l);
      const g = new THREE.ConeGeometry(0.16, 0.7 + r() * 0.4, 4);
      g.translate(f.x + f.rx * l, y + 0.35, f.z + f.rz * l);
      tufts.add(g, null, i % 2 ? 0x6fd146 : 0x4aae33);
    }
  }
  return geo;
}

function rampMesh(track, rp) {
  const H = 1.25;
  const s0 = rp.s - rp.length / 2;
  const s1 = rp.s + rp.length / 2;
  const w2 = rp.width / 2;
  const pt = (s, l, h) => {
    const f = track.frameAt(s);
    return [f.x + f.rx * l, track.heightAt(f.s, l) + h, f.z + f.rz * l];
  };
  const top = new THREE.BufferGeometry();
  const P = [pt(s0, rp.lateral - w2, 0.04), pt(s0, rp.lateral + w2, 0.04), pt(s1, rp.lateral - w2, H), pt(s1, rp.lateral + w2, H)];
  top.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 2, 1, 2], 2));
  top.setIndex([0, 2, 1, 1, 2, 3]);
  top.computeVertexNormals();
  // wooden sides and back
  const side = new THREE.BufferGeometry();
  const base = [pt(s0, rp.lateral - w2, 0.04), pt(s1, rp.lateral - w2, 0), pt(s0, rp.lateral + w2, 0.04), pt(s1, rp.lateral + w2, 0)];
  const V = [...base, P[2], P[3]];
  side.setAttribute('position', new THREE.Float32BufferAttribute(V.flat(), 3));
  side.setIndex([0, 1, 4, 2, 5, 3, 1, 3, 5, 1, 5, 4]);
  side.computeVertexNormals();
  const col = new Float32Array(V.length * 3);
  const cc = new THREE.Color(CL.woodDark);
  V.forEach((_, i) => cc.toArray(col, i * 3));
  side.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { top, side };
}

export function buildWildflower(ctx, sec) {
  const g = section('wildflower');
  flora(ctx, g, sec.s0 - 6, sec.s1 + 6, { trees: 7, bushes: 8, flowers: 90, seed: 2, treeLats: [12, 70], flowerLats: [-8, 22] });
  addPatches(ctx, g, sec);
  return g;
}

export function buildMeadowfield(ctx, sec) {
  const g = section('meadowfield');
  flora(ctx, g, sec.s0, sec.s1, { trees: 6, bushes: 6, flowers: 45, seed: 3, treeLats: [16, 80], flowerLats: [-4, 22] });
  addPatches(ctx, g, sec);
  const { track } = ctx;
  const tex = chevTex('#e8782a', '#fff3d8');
  const tops = new Batch();
  const sides = new Batch();
  for (const rp of track.ramps.filter((r) => r.s >= sec.s0 && r.s <= sec.s1)) {
    const m = rampMesh(track, rp);
    tops.add(m.top, null, 0xffffff, true);
    sides.add(m.side, null, null);
  }
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  g.add(propGroup('ramps', [tops.mesh(mat, { shadow: true }), sides.mesh(mats.col(), { shadow: true })]));
  return g;
}

function addPatches(ctx, g, sec) {
  const { track } = ctx;
  const list = patchesOf(track).filter((p) => p.s >= sec.s0 && p.s <= sec.s1);
  const tufts = new Batch();
  const blobs = new Batch();
  for (const p of list) blobs.add(patchMesh(track, p, tufts), null, null);
  g.add(propGroup('patches', [blobs.mesh(mats.sand(), { receive: true }), tufts.mesh(mats.col())]));
}

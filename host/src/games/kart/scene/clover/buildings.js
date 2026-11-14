// Placed buildings as batch fillers: clover barn, silo, cream farmhouse. Local frame: front faces +x, y up, ground at y = 0.
import * as THREE from 'three';
import { xform } from '../coconut/kit.js';
import { box, cyl } from '../coconut/models.js';
import { CL } from './kit.js';

// Triangle/gambrel gable profile [z, y] extruded along local x (`len` m, centred).
function gable(profile, len) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2); // extrude axis -> world x, profile x -> z
  return g;
}
const scaleProfile = (p, k, cy) => p.map(([z, y]) => [z * k, cy + (y - cy) * k]);

const bar = (b, x, y, z, w, h, d, c, rx = 0) => b.add(box(w, h, d), xform(x, y, z, 0, 1, 1, 1, rx), c);

// X-braced barn door panel in the y-z plane at local x.
function door(b, x, z0, w, h) {
  const zc = z0 + w / 2;
  bar(b, x, h / 2, zc, 0.18, h, w, CL.red);
  for (const z of [z0 + 0.15, z0 + w - 0.15]) bar(b, x + 0.12, h / 2, z, 0.12, h, 0.3, CL.white);
  for (const y of [0.15, h - 0.15]) bar(b, x + 0.12, y, zc, 0.12, 0.3, w, CL.white);
  const len = Math.hypot(h - 0.4, w - 0.4);
  const a = Math.atan2(w - 0.4, h - 0.4);
  for (const k of [1, -1]) bar(b, x + 0.14, h / 2, zc, 0.12, len, 0.22, CL.white, k * a);
}

export function barn(b) {
  const L = 18;
  const W = 14;
  const H = 6;
  b.add(box(L, H, W), xform(0, H / 2, 0), CL.red);
  b.add(box(L + 0.3, 0.9, W + 0.3), xform(0, 0.45, 0), CL.stoneDark);
  const prof = [[-W / 2 - 0.5, H], [-W / 2 + 0.7, H + 3], [0, H + 5.2], [W / 2 - 0.7, H + 3], [W / 2 + 0.5, H]];
  b.add(gable(prof, L + 1.2), null, CL.slate);
  const inner = [[-W / 2, H], [-W / 2 + 1.2, H + 2.8], [0, H + 4.7], [W / 2 - 1.2, H + 2.8], [W / 2, H]];
  b.add(gable(inner, 0.5), xform(L / 2 + 0.1, 0, 0), CL.white);
  b.add(gable(scaleProfile(inner, 0.9, H + 1), 0.5), xform(L / 2 + 0.25, 0, 0), CL.red);
  b.add(gable(inner, 0.5), xform(-L / 2 - 0.1, 0, 0), CL.red);
  // big front opening with hay, framed in white, flanked by X-braced sliding doors
  const fx = L / 2 + 0.02;
  b.add(box(0.2, 4.6, 5.4), xform(fx, 2.3, 0), 0x2b1a10);
  for (const dy of [0, 1.1]) b.add(box(1.5, 0.9, 2.2), xform(fx - 0.9, 0.5 + dy, dy ? 1.3 : -0.9), 0xe0b94e);
  b.add(box(1.4, 0.9, 2.0), xform(fx - 0.9, 0.5, 1.6), 0xd9a93f);
  bar(b, fx + 0.1, 4.8, 0, 0.2, 0.35, 6.4, CL.white);
  for (const z of [-3.1, 3.1]) bar(b, fx + 0.1, 2.35, z, 0.2, 4.7, 0.35, CL.white);
  for (const z0 of [-6.6, 3.5]) door(b, fx + 0.1, z0, 3.1, 4.6);
  // clover emblem in a cream disc high on the gable
  const disc = cyl(1.9, 1.9, 0.25, 22);
  disc.rotateZ(Math.PI / 2);
  b.add(disc, xform(fx + 0.35, 9.0, 0), CL.cream);
  const lobe = new THREE.SphereGeometry(0.8, 8, 6);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.add(lobe, xform(fx + 0.55, 9.3 + Math.sin(a) * 0.62, Math.cos(a) * 0.62, 0, 0.3, 1, 1), 0x35a83a);
  }
  b.add(cyl(0.08, 0.08, 1.1, 5), xform(fx + 0.55, 8.3, 0.15, 0, 1, 1, 1, 0, 0.5), 0x35a83a);
  // windows, one each side of the opening
  for (const z of [-5.6, 5.6]) {
    b.add(box(0.3, 1.5, 1.3), xform(fx, 3.4, z), CL.white);
    b.add(box(0.35, 1.1, 0.9), xform(fx + 0.02, 3.4, z), 0x40372e);
  }
}

export function silo(b) {
  b.add(cyl(3.2, 3.3, 15, 18), xform(0, 7.5, 0), 0xc8c0b0);
  for (const y of [3, 6.5, 10, 13.5]) b.add(cyl(3.35, 3.35, 0.22, 18), xform(0, y, 0), 0x9d968a);
  const dome = new THREE.SphereGeometry(3.4, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(dome, xform(0, 15, 0, 0, 1, 0.8, 1), 0xb8362c);
  b.add(cyl(0.12, 0.12, 1.4, 5), xform(0, 18.1, 0), CL.stoneDark);
}

export function farmhouse(b) {
  const L = 10;
  const W = 8;
  const H = 5.2;
  b.add(box(L, H, W), xform(0, H / 2, 0), CL.cream);
  b.add(box(L + 0.2, 0.8, W + 0.2), xform(0, 0.4, 0), CL.stone);
  const prof = [[-W / 2 - 0.9, H], [0, H + 3.8], [W / 2 + 0.9, H]];
  b.add(gable(prof, L + 1.4), null, CL.roof);
  b.add(gable([[-W / 2, H], [0, H + 3.2], [W / 2, H]], 0.3), xform(L / 2 + 0.05, 0, 0), CL.cream);
  b.add(gable([[-W / 2, H], [0, H + 3.2], [W / 2, H]], 0.3), xform(-L / 2 - 0.05, 0, 0), CL.cream);
  b.add(box(1.3, 3.6, 1.3), xform(-2.5, H + 3.2, 1.2), CL.stone);
  b.add(box(1.6, 0.3, 1.6), xform(-2.5, H + 5.1, 1.2), CL.stoneDark);
  // side-on windows and door on the front (+x) face
  const fx = L / 2 + 0.02;
  for (const [y, z] of [[3.3, -2.6], [3.3, 2.6], [1.9, -2.6]]) {
    b.add(box(0.2, 1.3, 1.1), xform(fx, y, z), 0x7a4a2c);
    b.add(box(0.25, 0.95, 0.75), xform(fx + 0.03, y, z), 0xa8d4ee);
    b.add(box(0.3, 0.3, 1.2), xform(fx + 0.1, y - 0.8, z), 0xd8402f);
  }
  b.add(box(0.25, 2.4, 1.3), xform(fx + 0.02, 1.2, 0), 0x7a4a2c);
  // porch: red lean-to roof on posts
  b.add(box(2.6, 0.2, 4.4), xform(fx + 1.3, 3.0, 0, 0, 1, 1, 1, 0, 0.12), CL.roof);
  for (const z of [-2, 2]) b.add(cyl(0.12, 0.12, 3, 5), xform(fx + 2.4, 1.5, z), CL.wood);
  b.add(box(2.4, 0.25, 4.2), xform(fx + 1.3, 0.12, 0), CL.woodDark);
}

// Rolled hay bale lying on its side, axis along local z.
export function hayBale(b, x, y, z, yaw = 0) {
  const g = cyl(0.8, 0.8, 1.3, 12);
  g.rotateX(Math.PI / 2);
  b.add(g, xform(x, y + 0.8, z, yaw), 0xe0b94e);
}

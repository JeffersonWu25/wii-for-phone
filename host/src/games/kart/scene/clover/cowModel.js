// Low-poly cartoon Holstein for hazards.js: a body mesh, a head on a neck pivot and four leg pivots, all front = local +x.
import * as THREE from 'three';
import { Batch, xform } from '../coconut/kit.js';
import { CL } from './kit.js';

const BLACK = 0x1f1f22;
const PINK = 0xf4a7a0;
const BLUE = 0x2f6fd8;
const GOLD = 0xffc933;
const ball = (r, sx, sy, sz) => new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz);
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const at = (x, y, z, ry = 0, s = 1, rz = 0) => xform(x, y, z, ry, s, s, s, 0, rz);

// Black patches per variant: [x, y, z, sx, sy, sz] on the white body.
const PATCHES = [
  [[0.3, 1.45, 0.35, 0.8, 0.3, 0.5], [-0.55, 1.2, -0.45, 0.65, 0.5, 0.35], [-0.9, 1.35, 0.3, 0.45, 0.35, 0.5]],
  [[0.5, 1.2, -0.45, 0.7, 0.5, 0.4], [-0.3, 1.5, -0.2, 0.9, 0.3, 0.55], [0.85, 1.05, 0.4, 0.4, 0.4, 0.3]],
  [[0, 1.2, 0.5, 1.1, 0.5, 0.35], [-0.7, 1.45, -0.3, 0.5, 0.3, 0.55]],
];

export function cowParts(variant) {
  const body = new Batch();
  body.add(ball(1, 1.5, 0.78, 0.85), at(0, 1.2, 0), CL.white);
  for (const [x, y, z, sx, sy, sz] of PATCHES[variant % PATCHES.length]) body.add(ball(1, sx * 1.12, sy * 1.12, sz * 1.12), at(x, y, z), BLACK);
  body.add(ball(0.5, 1, 0.9, 1.1), at(-0.8, 0.82, 0), PINK); // udder
  body.add(bx(0.12, 0.7, 0.12), at(-1.6, 1.2, 0, 0, 1, 0.25), CL.white); // tail
  body.add(ball(0.18, 1, 1.6, 1), at(-1.72, 0.72, 0), BLACK);

  const head = new Batch();
  head.add(bx(0.8, 0.72, 0.7), at(0.45, 0, 0), CL.white);
  head.add(bx(0.3, 0.5, 0.58), at(0.92, -0.1, 0), PINK);
  head.add(bx(0.2, 0.2, 0.2), at(0.7, 0.2, 0.18), BLACK);
  for (const z of [-0.2, 0.2]) {
    head.add(bx(0.1, 0.1, 0.1), at(1.07, -0.02, z * 0.8), 0x7a3a3a); // nostrils
    head.add(ball(0.07, 1, 1, 1), at(0.78, 0.18, z * 1.6), BLACK); // eyes
    head.add(bx(0.4, 0.14, 0.26), at(0.1, 0.22, z * 2.1), z < 0 ? BLACK : CL.white); // ears
    head.add(ball(0.1, 1, 1.6, 1), at(0.28, 0.45, z * 1.1), CL.cream); // horns
  }
  head.add(new THREE.TorusGeometry(0.42, 0.09, 6, 12).rotateY(Math.PI / 2), at(0.1, -0.05, 0), BLUE); // collar
  head.add(ball(0.17, 1, 1, 1), at(0.1, -0.5, 0), GOLD); // bell

  const leg = new Batch();
  leg.add(new THREE.CylinderGeometry(0.17, 0.14, 0.85, 6).translate(0, -0.42, 0), null, CL.white);
  leg.add(bx(0.3, 0.14, 0.3), at(0.02, -0.82, 0), BLACK);
  return { body: body.geometry(), head: head.geometry(), leg: leg.geometry() };
}

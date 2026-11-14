// Animated hazards: cows walking/grazing (posed from track.obstaclesAt) and the windmill blades that sweep the tunnel mouth.
// Blades: the rotor is a 4-sail wheel on the tower's axle, turned 90 degrees while the gate is closed (the bottom sail sweeps
// from the left of the arch to the right exactly during `blocking`) and held in an X, clear of the road, while it is open.
import * as THREE from 'three';
import { mats } from '../coconut/kit.js';
import { CL } from './kit.js';
import { cowParts } from './cowModel.js';

const R_HUB = 2.6; // m, rotor hub radius where the sails start
const SAIL_W = 4.6;
const PLANE_BACK = 3.6; // m in front of the gate plane: clears the portal ring of the mound

// Rotor geometry in the local XY plane, sail 0 pointing down (-y).
function sailGeometry(len) {
  const parts = [];
  const add = (geo, x, y, z, color) => {
    const g = geo.toNonIndexed();
    const c = new THREE.Color(color);
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: g.attributes.position.count * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
    g.translate(x, y, z);
    parts.push(g);
  };
  const L = len - R_HUB;
  const y0 = -R_HUB - L / 2;
  const b = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  add(b(0.55, L, 0.5), 0, y0, 0, CL.redDark); // spar
  add(b(0.35, L, 0.35), SAIL_W + 0.55, y0, -0.05, CL.red); // outer frame
  add(b(SAIL_W, 0.35, 0.35), SAIL_W / 2 + 0.4, -len + 0.15, -0.05, CL.red);
  add(b(SAIL_W, 0.35, 0.35), SAIL_W / 2 + 0.4, -R_HUB - 0.15, -0.05, CL.red);
  add(b(SAIL_W - 0.2, L - 0.5, 0.12), SAIL_W / 2 + 0.4, y0, -0.1, CL.cream); // canvas
  const rungs = Math.round(L / 3);
  for (let i = 1; i < rungs; i++) add(b(SAIL_W, 0.22, 0.3), SAIL_W / 2 + 0.4, -R_HUB - (L * i) / rungs, -0.05, CL.red);
  add(b(0.2, L, 0.3), SAIL_W / 2 + 0.4, y0, -0.05, CL.red); // centre rib
  return parts;
}

function merge(parts) {
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) {
    const arr = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

export const SAIL_REST = -Math.PI / 4; // rotor angle (down-pointing sail, + = toward the road's right) while the gate is open

// Rotor angle for a blade-gate entry: rest X, then 90 degrees across the arch during blocking.
export function rotorAngle(angle, blockFraction) {
  const u = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  const k = u < blockFraction ? u / blockFraction : 1;
  return SAIL_REST + (Math.PI / 2) * k;
}

function buildBlades(track, wm, def) {
  const f = track.frameAt(def.s - PLANE_BACK);
  const hubY = wm.hub.y;
  const len = hubY - f.y - 0.5;
  const g = new THREE.Group();
  g.name = 'prop:windmillBlades';
  g.position.set(f.x, hubY, f.z);
  g.rotation.y = -f.h - Math.PI / 2; // local +x = road right, +z = backwards
  const rotor = new THREE.Group();
  const geo = merge(Array.from({ length: 4 }, (_, i) => sailGeometry(len).map((p) => p.clone().rotateZ((i * Math.PI) / 2))).flat());
  const mesh = new THREE.Mesh(geo, mats.col());
  mesh.castShadow = true;
  rotor.add(mesh);
  const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 1.8, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: CL.woodDark }));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.8, 12).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: CL.red }));
  cap.position.z = 1.8;
  rotor.add(hubMesh, cap);
  // Axle back to the tower's hub stub.
  const run = Math.hypot(wm.hub.x - f.x, wm.hub.z - f.z);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, run, 8).rotateX(Math.PI / 2).translate(0, 0, -run / 2), new THREE.MeshLambertMaterial({ color: CL.woodDark }));
  g.add(axle, rotor);
  return { group: g, rotor, blockFraction: def.blockFraction };
}

function buildCow(variant) {
  const p = cowParts(variant);
  const m = mats.col();
  const root = new THREE.Group();
  const body = new THREE.Group();
  const mk = (geo) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; return x; };
  body.add(mk(p.body));
  const head = new THREE.Group();
  head.position.set(1.3, 1.55, 0);
  head.add(mk(p.head));
  body.add(head);
  const legs = [[0.85, 0.42], [0.85, -0.42], [-0.85, 0.42], [-0.85, -0.42]].map(([x, z]) => {
    const pv = new THREE.Group();
    pv.position.set(x, 0.85, z);
    pv.add(mk(p.leg));
    body.add(pv);
    return pv;
  });
  root.add(body);
  return { root, body, head, legs, walk: 0, graze: 1, prev: null };
}

export function buildHazards(track, windmill) {
  const group = new THREE.Group();
  group.name = 'hazards';
  const cows = new Map();
  let blades = null;
  let n = 0;
  for (const o of track.obstacles) {
    if (o.kind === 'cow') {
      const c = buildCow(n++);
      cows.set(o.id, c);
      group.add(c.root);
    } else if (o.kind === 'blades' && windmill) {
      blades = { ...buildBlades(track, windmill, o), id: o.id };
      group.add(blades.group);
    }
  }
  let last = null;

  function tick(raceTime) {
    const dt = last == null ? 0 : raceTime - last;
    last = raceTime;
    for (const o of track.obstaclesAt(raceTime)) {
      if (o.kind === 'cow') {
        const c = cows.get(o.id);
        const moved = c.prev && dt > 0 ? Math.hypot(o.x - c.prev.x, o.z - c.prev.z) : 0;
        const walking = dt > 0 && moved / dt > 0.15;
        c.prev = { x: o.x, z: o.z };
        c.root.position.set(o.x, o.y, o.z);
        c.root.rotation.y = -o.h;
        const k = dt > 0 ? Math.min(1, dt * 5) : 1;
        c.graze += ((walking ? 0 : 1) - c.graze) * k;
        c.walk += moved * 2.4;
        const sw = walking ? Math.sin(c.walk) : 0;
        c.legs.forEach((l, i) => { l.rotation.z = sw * 0.55 * (i === 0 || i === 3 ? 1 : -1); });
        c.body.position.y = walking ? Math.abs(Math.sin(c.walk)) * 0.07 : 0;
        c.body.rotation.x = walking ? Math.sin(c.walk * 0.5) * 0.03 : 0;
        c.head.rotation.z = -c.graze * 0.95 + (walking ? Math.sin(c.walk) * 0.08 : Math.sin(raceTime * 1.3 + o.x) * 0.04 * c.graze);
        c.head.position.y = 1.55 - c.graze * 0.25;
      } else if (o.kind === 'blades' && blades) {
        blades.rotor.rotation.z = rotorAngle(o.angle, blades.blockFraction);
      }
    }
  }
  return { group, tick };
}

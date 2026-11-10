// Placeholder scenery for the sand shortcut: a flat sand-coloured path over the ground and a low wooden fence in the gap
// between it and the road. The outer edge is fenced by the shared corridor walls (the road's left limit sits there).
import * as THREE from 'three';

const LIFT = 0.06; // m above the ground ribbon so the path never z-fights
const FENCE_STEP = 1; // m between fence rows
const POST_STEP = 4;
const FENCE_H = 0.9;

// One flat ribbon over the path samples, normals up.
function pathMesh(shortcut) {
  const pos = [];
  const idx = [];
  const pts = shortcut.samples;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const rx = -(b.z - a.z) / len;
    const rz = (b.x - a.x) / len;
    for (const side of [-1, 1]) pos.push(p.x + rx * p.halfWidth * side, p.y + LIFT, p.z + rz * p.halfWidth * side);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xeed38a, side: THREE.DoubleSide }));
  mesh.name = 'prop:shortcut';
  mesh.receiveShadow = true;
  return mesh;
}

// Two rails (shortcut side and road side) of the fence standing in the gap, plus posts.
function fenceGroup(track, shortcut) {
  const group = new THREE.Group();
  group.name = 'prop:shortcut-fence';
  const rows = [];
  for (let s = shortcut.s0; s <= shortcut.s1; s += FENCE_STEP) {
    const fence = track.surfaceAt(s, 0).fence;
    rows.push(fence ? { s, fr: track.frameAt(s), lo: fence.lo + 0.1, hi: fence.hi - 0.1 } : null);
  }
  const pos = [];
  const idx = [];
  const posts = [];
  for (const key of ['lo', 'hi']) {
    let prev = -1;
    rows.forEach((row, i) => {
      if (!row) {
        prev = -1;
        return;
      }
      const { fr } = row;
      const x = fr.x + fr.rx * row[key];
      const z = fr.z + fr.rz * row[key];
      const y = track.heightAt(row.s, row[key]);
      const base = pos.length / 3;
      pos.push(x, y, z, x, y + FENCE_H, z);
      if (prev >= 0) idx.push(prev, prev + 2, prev + 1, prev + 1, prev + 2, prev + 3);
      prev = base;
      if (i % POST_STEP === 0) posts.push([x, y, z]);
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const rail = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x9c6b3c, side: THREE.DoubleSide }));
  rail.castShadow = true;
  const postGeo = new THREE.CylinderGeometry(0.1, 0.12, FENCE_H + 0.3, 6);
  postGeo.translate(0, (FENCE_H + 0.3) / 2, 0);
  const postMesh = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: 0x6f4a28 }), posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach((p, i) => postMesh.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
  postMesh.castShadow = true;
  group.add(rail, postMesh);
  return group;
}

export function buildShortcutScenery(track) {
  const group = new THREE.Group();
  group.name = 'shortcuts';
  for (const sc of track.shortcuts) group.add(pathMesh(sc), fenceGroup(track, sc));
  return group;
}

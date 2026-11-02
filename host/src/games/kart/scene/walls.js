// Corridor-limit scenery: rounded sponsor bumper walls on straights and the outside of turns,
// chain-link fence over a banner board on the inside of turns and along the grandstand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { wallTexture, bannerTexture, chainLinkTexture, toonMat } from './textures.js';

const BUMPER = [
  [0, -0.35, 0], [0, 0.6, 0.62], [0.1, 0.8, 0.82], [0.3, 0.9, 0.92], [0.5, 0.9, 0.92], [0.7, 0.8, 0.82], [0.8, 0.6, 0.62], [0.8, -0.35, 0],
];
const BUMPER_H = 0.95;

function styleOf(piece, side) {
  if (piece.kind === 'arc') {
    const innerSide = piece.turn === 'right' ? 1 : -1;
    if (side === innerSide) return 'fence';
  }
  if ((piece.tag === 'start' || piece.tag === 'grid') && side < 0) return 'fence';
  return 'bumper';
}

// Extrude `profile` ([offset, height, v]) along a run of {s, x, z, h, y, lim} rows on one side.
function extrude(run, side, profile, uScale) {
  const pos = [];
  const uv = [];
  const idx = [];
  const P = profile.length;
  run.forEach((r, i) => {
    const rx = -Math.sin(r.h) * side;
    const rz = Math.cos(r.h) * side;
    for (const [off, hgt, v] of profile) {
      pos.push(r.x + rx * (r.lim + 0.05 + off), r.y + hgt, r.z + rz * (r.lim + 0.05 + off));
      uv.push(r.s * uScale, v);
    }
    if (i > 0) {
      const a = (i - 1) * P;
      for (let j = 0; j < P - 1; j++) idx.push(a + j, a + j + P, a + j + 1, a + j + 1, a + j + P, a + j + P + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildWalls(track) {
  const group = new THREE.Group();
  const samples = track.samples;
  const N = samples.length - 1;
  const bumperGeos = [];
  const bannerGeos = [];
  const linkGeos = [];
  const posts = [];

  for (const side of [-1, 1]) {
    let run = [];
    let runStyle = null;
    const flush = () => {
      if (run.length > 1) {
        if (runStyle === 'bumper') {
          bumperGeos.push(extrude(run, side, BUMPER.map(([o, h]) => [o, h, Math.min(1, Math.max(0, h / BUMPER_H))]), side > 0 ? -1 / 24 : 1 / 24));
        } else {
          bannerGeos.push(extrude(run, side, [[0, -0.35, 0], [0, 0.95, 1]], side > 0 ? -1 / 24 : 1 / 24));
          linkGeos.push(extrude(run, side, [[0, 0.95, 0.0], [0, 2.9, 1.5]], 1 / 1.3));
        }
      }
      run = [];
    };
    for (let n = 0; n <= N; n += 2) {
      const sp = samples[n];
      const piece = track.pieces[sp.pieceIndex];
      const style = styleOf(piece, side);
      if (style !== runStyle) {
        // Overlap by one row so there is no visible gap between styles.
        const prev = run[run.length - 1];
        flush();
        runStyle = style;
        if (prev) run.push(prev);
      }
      const lim = sp.halfWidth + (side > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
      const row = { s: sp.s, x: sp.x, z: sp.z, h: sp.h, lim, y: track.heightAt(sp.s, side * lim) };
      run.push(row);
      if (style === 'fence' && n % 8 === 0) {
        const rx = -Math.sin(sp.h) * side;
        const rz = Math.cos(sp.h) * side;
        posts.push([sp.x + rx * (lim + 0.05), row.y, sp.z + rz * (lim + 0.05)]);
      }
    }
    flush();
    runStyle = null;
  }

  const wallTex = wallTexture();
  wallTex.wrapS = THREE.RepeatWrapping;
  const bannerTex = bannerTexture();
  bannerTex.wrapS = THREE.RepeatWrapping;
  const linkTex = chainLinkTexture();

  const bumper = new THREE.Mesh(mergeGeometries(bumperGeos), toonMat({ map: wallTex, side: THREE.DoubleSide, rim: 0.2 }));
  bumper.castShadow = true;
  bumper.receiveShadow = true;
  const banner = new THREE.Mesh(mergeGeometries(bannerGeos), new THREE.MeshLambertMaterial({ map: bannerTex, side: THREE.DoubleSide }));
  banner.receiveShadow = true;
  banner.castShadow = true;
  const link = new THREE.Mesh(
    mergeGeometries(linkGeos),
    new THREE.MeshLambertMaterial({ map: linkTex, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, color: 0xdfe8f0 })
  );
  group.add(bumper, banner, link);

  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.3, 6);
  postGeo.translate(0, 1.3, 0);
  const post = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: 0xb9c3cf }), posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach((p, i) => post.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
  post.castShadow = true;
  group.add(post);
  return { group };
}

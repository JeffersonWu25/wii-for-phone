// Ocean: a depth-tinted plane over the island (turquoise shallows, white foam at the shore, deep blue beyond) inside a huge
// deep-water plane, both with a drifting sparkle. Plus far rock islands on the horizon.
import * as THREE from 'three';
import { Batch, COL, SEA_LEVEL, mats, xform, rng } from './kit.js';
import { rockGeometry } from './models.js';
import { palmGroup } from './parts.js';

const DEEP = new THREE.Color(0x1d8fd0);
const MID = new THREE.Color(0x27b6d8);
const SHALLOW = new THREE.Color(0x4ee6d6);
const FOAM = new THREE.Color(0xeafffb);

export function bounds(track) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of track.samples) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { minX, minZ, maxX, maxZ };
}

export function buildOcean(track, isl) {
  const b = bounds(track);
  const M = 170;
  const x0 = b.minX - M, x1 = b.maxX + M, z0 = b.minZ - M, z1 = b.maxZ + M;
  const W = 190;
  const Hh = Math.round((W * (z1 - z0)) / (x1 - x0));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = Hh;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, Hh);
  const c = new THREE.Color();
  for (let j = 0; j < Hh; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + ((i + 0.5) / W) * (x1 - x0);
      const z = z0 + ((j + 0.5) / Hh) * (z1 - z0);
      const edge = Math.min(i, j, W - 1 - i, Hh - 1 - j);
      const h = edge < 4 ? -9 : isl.heightAt(x, z);
      const d = SEA_LEVEL - h;
      c.copy(SHALLOW).lerp(MID, Math.min(1, Math.max(0, d / 6))).lerp(DEEP, Math.min(1, Math.max(0, (d - 7) / 5)));
      if (d < 0.9) c.lerp(FOAM, 1 - Math.max(0, d) / 0.9);
      const k = (j * W + i) * 4;
      img.data[k] = Math.round(c.r * 255);
      img.data[k + 1] = Math.round(c.g * 255);
      img.data[k + 2] = Math.round(c.b * 255);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const uTime = { value: 0 };
  const patch = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vW;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float w = sin(vW.x * 0.35 + uTime * 0.9) + sin(vW.z * 0.42 - uTime * 0.7) + sin((vW.x + vW.z) * 0.27 + uTime * 0.5) + sin((vW.x - vW.z) * 0.6 - uTime * 1.3);
           diffuseColor.rgb += smoothstep(2.2, 3.4, w) * 0.15;`
        );
    };
    mat.customProgramCacheKey = () => 'cc-ocean';
    return mat;
  };

  const near = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), patch(new THREE.MeshLambertMaterial({ map: tex })));
  near.rotation.x = -Math.PI / 2;
  near.position.set((x0 + x1) / 2, SEA_LEVEL, (z0 + z1) / 2);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), patch(new THREE.MeshLambertMaterial({ color: DEEP })));
  far.rotation.x = -Math.PI / 2;
  far.position.set((x0 + x1) / 2, SEA_LEVEL - 0.03, (z0 + z1) / 2);

  const group = new THREE.Group();
  group.name = 'ocean';
  group.add(far, near);

  // Far rock islands with palm caps.
  const r = rng(404);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rock = new Batch();
  const palms = [];
  const reach = Math.max(x1 - x0, z1 - z0) / 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.3;
    const dist = reach + 60 + r() * 520;
    const x = cx + Math.cos(a) * dist;
    const z = cz + Math.sin(a) * dist * 0.9;
    const k = 1.5 + r() * 3.2;
    const h = 12 + r() * 30;
    rock.add(rockGeometry(200 + i, { rTop: 5 * k, rBot: 11 * k, h, seg: 10, rows: 5 }), xform(x, SEA_LEVEL - 6, z, r() * 6), null);
    for (let p = 0; p < 3; p++) palms.push({ x: x + (r() - 0.5) * 4 * k, y: SEA_LEVEL - 6 + h - 0.3, z: z + (r() - 0.5) * 4 * k, ry: r() * 6, sc: 1.8 + r() });
  }
  const isles = new THREE.Group();
  isles.name = 'islands';
  const rm = rock.mesh(mats.rock());
  isles.add(rm);
  void palms;
  void palmGroup;
  group.add(isles);
  void COL;
  return { group, tick: (t) => (uTime.value = t) };
}

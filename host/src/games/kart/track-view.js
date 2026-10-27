import * as THREE from 'three';
import { MATERIALS } from './track-loft.js';

const TILE_M = 12;
const STRIPE_BLOCK_M = 1.15;
const TEX = 256;

const SURFACE = {
  grass: { uv: 'world' },
  sand: { uv: 'world', order: 1, offset: -1 },
  asphalt: { uv: 'atlas', order: 2, offset: -2 },
  curbInner: { uv: 'atlas', order: 3, offset: -3 },
  curbOuter: { uv: 'atlas', order: 3, offset: -3 },
};

export function attachCourse(scene, visuals) {
  if (!visuals?.mesh?.positions || typeof visuals.grassRadius !== 'number') {
    throw new Error('attachCourse needs FrozenVisuals with mesh and grassRadius');
  }

  const reach = visuals.grassRadius + 12;
  const horizon = 0xc6e7f8;
  const zenith = 0x3d8fd8;
  scene.background = new THREE.Color(horizon);
  scene.fog = new THREE.Fog(horizon, 85, reach * 2.15);

  const group = new THREE.Group();
  group.name = 'luigi-course';

  const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x4f9a46, 0.78);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3d2, 2.15);
  sun.position.set(24, 96, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  const cover = reach * 1.15;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = reach * 4;
  sun.shadow.camera.left = -cover;
  sun.shadow.camera.right = cover;
  sun.shadow.camera.top = cover;
  sun.shadow.camera.bottom = -cover;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(sun);
  group.add(sun.target);

  const sky = makeSky(Math.min(reach * 2.05, 270), horizon, zenith);
  group.add(sky);

  const asphaltMap = dataTexture(visuals.atlas, { mipmaps: true, anisotropy: 8 });
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.ClampToEdgeWrapping;

  const curbInMap = curbTexture(visuals.curbInnerAtlas, ringLength(visuals.outline?.inner));
  const curbOutMap = curbTexture(visuals.curbOuterAtlas, ringLength(visuals.outline?.outer));
  const grassMap = groundTexture(shadeGrass);
  const sandMap = groundTexture(shadeSand);

  const maps = {
    grass: grassMap,
    sand: sandMap,
    asphalt: asphaltMap,
    curbInner: curbInMap,
    curbOuter: curbOutMap,
  };

  const srcPos = visuals.mesh.positions;
  const srcNrm = visuals.mesh.normals;
  const srcUv = visuals.mesh.uvs;
  const srcIdx = visuals.mesh.indices;

  const meshes = [sky];
  const materials = [sky.material];

  for (const g of visuals.mesh.groups) {
    if (!MATERIALS.includes(g.material)) throw new Error(`unknown material ${g.material}`);
    if (g.count <= 0) continue;
    const layer = SURFACE[g.material];

    const compact = extractGroup(srcPos, srcNrm, srcUv, srcIdx, g.start, g.count, layer.uv);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(compact.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(compact.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(compact.uvs, 2));
    geo.setIndex(
      compact.indices instanceof Uint32Array
        ? new THREE.Uint32BufferAttribute(compact.indices, 1)
        : new THREE.Uint16BufferAttribute(compact.indices, 1),
    );
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const mat = new THREE.MeshLambertMaterial({ map: maps[g.material], side: THREE.FrontSide });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `course-${g.material}`;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (layer.offset) {
      mesh.renderOrder = layer.order;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = layer.offset;
      mat.polygonOffsetUnits = layer.offset;
    }
    group.add(mesh);
    meshes.push(mesh);
  }

  scene.add(group);

  return {
    dispose() {
      scene.remove(group);
      sun.dispose();
      hemi.dispose();
      for (const mesh of meshes) mesh.geometry.dispose();
      const seen = new Set();
      for (const mat of materials) {
        if (mat.map && !seen.has(mat.map)) {
          seen.add(mat.map);
          mat.map.dispose();
        }
        mat.dispose();
      }
    },
  };
}

function shadeGrass(broad, fine, speck) {
  let r = 48 + broad * 46 + (fine - 0.5) * 18;
  let g = 150 + broad * 62 + (fine - 0.5) * 22;
  let b = 42 + broad * 24 + (fine - 0.5) * 10;
  if (speck > 0.965) {
    r *= 0.7;
    g *= 0.75;
    b *= 0.68;
  }
  return [r, g, b];
}

function shadeSand(broad, fine) {
  return [
    191 + broad * 52 + (fine - 0.5) * 12,
    160 + broad * 48 + (fine - 0.5) * 10,
    123 + broad * 36 + (fine - 0.5) * 8,
  ];
}

function groundTexture(shade) {
  const rgba = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const u = (x + 0.5) / TEX;
      const v = (y + 0.5) / TEX;
      const broad = fbm(u, v, 2);
      const fine = fbm(u, v, 8);
      const [r, g, b] = shade(broad, fine, hash01(x, y));
      const i = (y * TEX + x) * 4;
      rgba[i] = clampByte(r);
      rgba[i + 1] = clampByte(g);
      rgba[i + 2] = clampByte(b);
      rgba[i + 3] = 255;
    }
  }
  const tex = dataTexture({ width: TEX, height: TEX, rgba }, { mipmaps: true, anisotropy: 8 });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function curbTexture(atlas, lengthM) {
  const tex = dataTexture(atlas, { mipmaps: true, anisotropy: 8 });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const along = lengthM > 1 ? lengthM : 240;
  tex.repeat.set(repeatsForStripe(along, atlas), 1);
  return tex;
}

function repeatsForStripe(lengthM, atlas) {
  const block = stripeBlockTexels(atlas);
  const blocks = Math.max(1, Math.round(atlas.width / block));
  return lengthM / (STRIPE_BLOCK_M * blocks);
}

function stripeBlockTexels(atlas) {
  const rgba = atlas.rgba;
  const width = atlas.width;
  for (let x = 1; x < width; x++) {
    const i = x * 4;
    if (rgba[i] !== rgba[0] || rgba[i + 1] !== rgba[1] || rgba[i + 2] !== rgba[2]) return x;
  }
  return width;
}

function makeSky(radius, horizonHex, zenithHex) {
  const geo = new THREE.SphereGeometry(radius, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(horizonHex);
  const zenith = new THREE.Color(zenithHex);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / radius));
    tmp.copy(horizon).lerp(zenith, t * t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'course-sky';
  mesh.frustumCulled = false;
  mesh.position.y = -8;
  mesh.renderOrder = -10;
  return mesh;
}

function fbm(u, v, period) {
  let n = 0;
  let amp = 0.5;
  let sum = 0;
  let f = period;
  for (let i = 0; i < 4; i++) {
    n += amp * valueNoise(u, v, f);
    sum += amp;
    amp *= 0.5;
    f *= 2;
  }
  return n / sum;
}

function valueNoise(u, v, period) {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const sample = (ix, iy) => {
    const wx = ((ix % period) + period) % period;
    const wy = ((iy % period) + period) % period;
    return hash01(wx, wy);
  };
  const a = sample(x0, y0);
  const b = sample(x0 + 1, y0);
  const c = sample(x0, y0 + 1);
  const d = sample(x0 + 1, y0 + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function hash01(ix, iy) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n >>> 0) % 10000) / 10000;
}

function ringLength(ring) {
  if (!ring?.length) return 0;
  let len = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

function extractGroup(positions, normals, uvs, indices, start, count, uvMode) {
  const remap = new Map();
  const outPos = [];
  const outNrm = [];
  const outUv = [];
  const outIdx = [];

  function pack(vi) {
    let local = remap.get(vi);
    if (local !== undefined) return local;
    local = remap.size;
    remap.set(vi, local);
    const o = vi * 3;
    const u = vi * 2;
    outPos.push(positions[o], positions[o + 1], positions[o + 2]);
    if (uvMode === 'world') outUv.push(positions[o] / TILE_M, positions[o + 2] / TILE_M);
    else outUv.push(uvs[u], uvs[u + 1]);
    outNrm.push(normals[o], normals[o + 1], normals[o + 2]);
    return local;
  }

  for (let i = start; i < start + count; i++) {
    outIdx.push(pack(indices[i]));
  }

  const IndexArray = remap.size > 65535 ? Uint32Array : Uint16Array;
  return {
    positions: Float32Array.from(outPos),
    normals: Float32Array.from(outNrm),
    uvs: Float32Array.from(outUv),
    indices: new IndexArray(outIdx),
  };
}

function dataTexture(atlas, { mipmaps = false, anisotropy = 1 } = {}) {
  const rgba = new Uint8Array(atlas.rgba.length);
  rgba.set(atlas.rgba);
  const tex = new THREE.DataTexture(rgba, atlas.width, atlas.height, THREE.RGBAFormat);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mipmaps;
  tex.needsUpdate = true;
  return tex;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

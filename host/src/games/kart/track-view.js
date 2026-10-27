import * as THREE from 'three';
import { MATERIALS } from './track-loft.js';

export function attachCourse(scene, visuals) {
  if (!visuals?.mesh?.positions || typeof visuals.grassRadius !== 'number') {
    throw new Error('attachCourse needs FrozenVisuals with mesh and grassRadius');
  }

  const reach = visuals.grassRadius + 12;
  scene.background = new THREE.Color(0x87c8f8);
  scene.fog = new THREE.Fog(0x9ad0f5, 70, reach * 2.2);

  const group = new THREE.Group();
  group.name = 'luigi-course';

  const hemi = new THREE.HemisphereLight(0xfff6e0, 0x3f8a3f, 1.05);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3d6, 1.85);
  sun.position.set(48, 70, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = reach * 3;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  group.add(sun);
  group.add(sun.target);

  const fill = new THREE.DirectionalLight(0xb8d8ff, 0.35);
  fill.position.set(-30, 25, -40);
  group.add(fill);

  const srcPos = visuals.mesh.positions;
  const srcNrm = visuals.mesh.normals;
  const srcUv = visuals.mesh.uvs;
  const srcIdx = visuals.mesh.indices;

  const asphaltMap = dataTexture(visuals.atlas);
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.ClampToEdgeWrapping;
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.anisotropy = 8;

  const curbInMap = dataTexture(visuals.curbInnerAtlas);
  curbInMap.wrapS = THREE.RepeatWrapping;
  curbInMap.wrapT = THREE.RepeatWrapping;
  curbInMap.colorSpace = THREE.SRGBColorSpace;

  const curbOutMap = dataTexture(visuals.curbOuterAtlas);
  curbOutMap.wrapS = THREE.RepeatWrapping;
  curbOutMap.wrapT = THREE.RepeatWrapping;
  curbOutMap.colorSpace = THREE.SRGBColorSpace;

  const grassMap = proceduralGroundTexture({
    width: 256,
    height: 256,
    base: [42, 158, 52],
    variance: 48,
    speck: [110, 210, 70],
  });
  grassMap.wrapS = THREE.RepeatWrapping;
  grassMap.wrapT = THREE.RepeatWrapping;
  grassMap.repeat.set(22, 22);
  grassMap.colorSpace = THREE.SRGBColorSpace;

  const sandMap = proceduralGroundTexture({
    width: 256,
    height: 256,
    base: [210, 176, 118],
    variance: 36,
    speck: [240, 214, 158],
  });
  sandMap.wrapS = THREE.RepeatWrapping;
  sandMap.wrapT = THREE.RepeatWrapping;
  sandMap.repeat.set(12, 12);
  sandMap.colorSpace = THREE.SRGBColorSpace;

  const materialFor = {
    grass: () =>
      new THREE.MeshLambertMaterial({ map: grassMap, side: THREE.FrontSide }),
    sand: () =>
      new THREE.MeshLambertMaterial({ map: sandMap, side: THREE.FrontSide }),
    asphalt: () =>
      new THREE.MeshLambertMaterial({ map: asphaltMap, side: THREE.FrontSide }),
    curbInner: () =>
      new THREE.MeshLambertMaterial({ map: curbInMap, side: THREE.FrontSide }),
    curbOuter: () =>
      new THREE.MeshLambertMaterial({ map: curbOutMap, side: THREE.FrontSide }),
  };

  const meshes = [];
  const materials = [];
  const extraMaps = [grassMap, sandMap];

  for (const g of visuals.mesh.groups) {
    if (!MATERIALS.includes(g.material)) throw new Error(`unknown material ${g.material}`);
    if (g.count <= 0) continue;

    const compact = extractGroup(srcPos, srcNrm, srcUv, srcIdx, g.start, g.count);
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

    const mat = materialFor[g.material]();
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `course-${g.material}`;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (g.material !== 'grass') {
      mesh.renderOrder = 1;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
    }
    group.add(mesh);
    meshes.push(mesh);
  }

  addCourseProps(group, visuals.grassRadius);

  scene.add(group);

  return {
    dispose() {
      scene.remove(group);
      for (const mesh of meshes) mesh.geometry.dispose();
      const seen = new Set();
      for (const mat of materials) {
        if (mat.map && !seen.has(mat.map)) {
          seen.add(mat.map);
          mat.map.dispose();
        }
        mat.dispose();
      }
      for (const map of extraMaps) {
        if (!seen.has(map)) map.dispose();
      }
    },
  };
}

/** Soft MKWii-ish props. Visual only. Physics ignores them. */
function addCourseProps(group, grassRadius) {
  const trunk = new THREE.MeshLambertMaterial({ color: 0x6b3f22 });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x2f9e44 });
  const pipe = new THREE.MeshLambertMaterial({ color: 0x3caa2a });
  const positions = [
    [grassRadius * 0.55, grassRadius * 0.15],
    [-grassRadius * 0.4, grassRadius * 0.45],
    [grassRadius * 0.2, -grassRadius * 0.55],
    [-grassRadius * 0.55, -grassRadius * 0.2],
    [grassRadius * 0.48, -grassRadius * 0.35],
  ];
  for (const [x, z] of positions) {
    const tree = new THREE.Group();
    const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8), trunk);
    bole.position.y = 1.1;
    bole.castShadow = true;
    tree.add(bole);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.8, 8), leaf);
    crown.position.y = 3.1;
    crown.castShadow = true;
    tree.add(crown);
    tree.position.set(x, 0, z);
    group.add(tree);
  }

  const pipeMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 16), pipe);
  pipeMesh.position.set(-grassRadius * 0.15, 0.8, grassRadius * 0.52);
  pipeMesh.castShadow = true;
  pipeMesh.receiveShadow = true;
  group.add(pipeMesh);
}

function proceduralGroundTexture({ width, height, base, variance, speck }) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n =
        ((Math.sin(x * 0.37 + y * 0.19) * 43758.5453) % 1) +
        ((Math.sin(x * 0.11 - y * 0.29) * 12345.678) % 1);
      const grain = ((n * variance) | 0) - (variance >> 1);
      const useSpeck = ((x * 13 + y * 29) % 17) === 0;
      const c = useSpeck ? speck : base;
      const i = (y * width + x) * 4;
      rgba[i] = clampByte(c[0] + grain);
      rgba[i + 1] = clampByte(c[1] + grain);
      rgba[i + 2] = clampByte(c[2] + grain);
      rgba[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.flipY = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function clampByte(v) {
  return Math.max(0, Math.min(255, v | 0));
}

/** Remap a triangle index slice onto a dense vertex buffer. */
function extractGroup(positions, normals, uvs, indices, start, count) {
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
    outNrm.push(normals[o], normals[o + 1], normals[o + 2]);
    outUv.push(uvs[u], uvs[u + 1]);
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

function dataTexture(atlas) {
  const rgba = new Uint8Array(atlas.rgba.length);
  rgba.set(atlas.rgba);
  const tex = new THREE.DataTexture(rgba, atlas.width, atlas.height, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

import * as THREE from 'three';
import { MATERIALS } from './track-loft.js';

export function attachCourse(scene, visuals) {
  if (!visuals?.mesh?.positions || typeof visuals.grassRadius !== 'number') {
    throw new Error('attachCourse needs FrozenVisuals with mesh and grassRadius');
  }

  const reach = visuals.grassRadius + 12;
  scene.background = new THREE.Color(0x7ec8f5);
  scene.fog = new THREE.Fog(0x7ec8f5, 90, reach * 2.4);

  const group = new THREE.Group();
  group.name = 'luigi-course';

  const hemi = new THREE.HemisphereLight(0xfff2d4, 0x3a7a3a, 0.85);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1c8, 1.35);
  sun.position.set(40, 55, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = reach * 3;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  group.add(sun);

  const srcPos = visuals.mesh.positions;
  const srcNrm = visuals.mesh.normals;
  const srcUv = visuals.mesh.uvs;
  const srcIdx = visuals.mesh.indices;

  const asphaltMap = dataTexture(visuals.atlas);
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.ClampToEdgeWrapping;
  asphaltMap.colorSpace = THREE.SRGBColorSpace;

  const curbInMap = dataTexture(visuals.curbInnerAtlas);
  curbInMap.wrapS = THREE.RepeatWrapping;
  curbInMap.wrapT = THREE.RepeatWrapping;
  curbInMap.colorSpace = THREE.SRGBColorSpace;

  const curbOutMap = dataTexture(visuals.curbOuterAtlas);
  curbOutMap.wrapS = THREE.RepeatWrapping;
  curbOutMap.wrapT = THREE.RepeatWrapping;
  curbOutMap.colorSpace = THREE.SRGBColorSpace;

  const materialFor = {
    grass: () => new THREE.MeshLambertMaterial({ color: 0x45b34f, side: THREE.FrontSide }),
    sand: () => new THREE.MeshLambertMaterial({ color: 0xd2b48c, side: THREE.FrontSide }),
    asphalt: () => new THREE.MeshLambertMaterial({ map: asphaltMap, side: THREE.FrontSide }),
    curbInner: () => new THREE.MeshLambertMaterial({ map: curbInMap, side: THREE.FrontSide }),
    curbOuter: () => new THREE.MeshLambertMaterial({ map: curbOutMap, side: THREE.FrontSide }),
  };

  const meshes = [];
  const materials = [];

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
    // Dense loft ribbons were disappearing under frustum tests in headless GL.
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
    },
  };
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

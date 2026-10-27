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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(visuals.mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(visuals.mesh.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(visuals.mesh.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(visuals.mesh.indices, 1));

  for (const g of visuals.mesh.groups) {
    const matIndex = MATERIALS.indexOf(g.material);
    if (matIndex < 0) throw new Error(`unknown material ${g.material}`);
    geo.addGroup(g.start, g.count, matIndex);
  }

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

  const materials = MATERIALS.map((name) => {
    if (name === 'grass') return new THREE.MeshLambertMaterial({ color: 0x45b34f, side: THREE.FrontSide });
    if (name === 'sand') return new THREE.MeshLambertMaterial({ color: 0xd2b48c, side: THREE.FrontSide });
    if (name === 'asphalt') return new THREE.MeshLambertMaterial({ map: asphaltMap, side: THREE.FrontSide });
    if (name === 'curbInner') return new THREE.MeshLambertMaterial({ map: curbInMap, side: THREE.FrontSide });
    return new THREE.MeshLambertMaterial({ map: curbOutMap, side: THREE.FrontSide });
  });

  const mesh = new THREE.Mesh(geo, materials);
  mesh.receiveShadow = true;
  group.add(mesh);
  scene.add(group);

  return {
    dispose() {
      scene.remove(group);
      geo.dispose();
      for (const mat of materials) {
        mat.map?.dispose();
        mat.dispose();
      }
    },
  };
}

function dataTexture(atlas) {
  const tex = new THREE.DataTexture(atlas.rgba, atlas.width, atlas.height, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// Item models. STUB from the core part: primitives only. The duel part replaces the bodies and keeps
// the exports. createItemModel(kind) -> Object3D, origin at the bottom centre (box: centre).
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, ...extra });
const MATS = {
  box: mat(0x9fe8a8, { transparent: true, opacity: 0.45 }),
  green: mat(0x2fd14a),
  red: mat(0xe8401e),
  rim: mat(0xf2f2ee),
  banana: mat(0xf7e21b),
};
const GEOS = {
  box: new THREE.BoxGeometry(1.3, 1.3, 1.3),
  dome: new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  rim: new THREE.TorusGeometry(0.42, 0.07, 10, 28),
  banana: new THREE.ConeGeometry(0.22, 0.8, 14),
};

export function createItemModel(kind) {
  const g = new THREE.Group();
  if (kind === 'box') {
    g.add(new THREE.Mesh(GEOS.box, MATS.box));
  } else if (kind === 'green' || kind === 'red') {
    const dome = new THREE.Mesh(GEOS.dome, MATS[kind]);
    const rim = new THREE.Mesh(GEOS.rim, MATS.rim);
    rim.rotation.x = Math.PI / 2;
    g.add(dome, rim);
  } else {
    const cone = new THREE.Mesh(GEOS.banana, MATS.banana);
    cone.position.y = 0.4;
    g.add(cone);
  }
  g.traverse((o) => { o.castShadow = o.isMesh; });
  return g;
}

export function disposeItemModels() {
  for (const g of Object.values(GEOS)) g.dispose();
  for (const m of Object.values(MATS)) m.dispose();
}

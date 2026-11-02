// Toy-like kart: rounded body in the player color, chunky tires, spoiler, steering wheel, round helmeted driver.
// Contract: faces local +x, sits on y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toonMat, blobShadowTexture } from './textures.js';

const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, r);
let shadowMat;

export function createKartMesh(color) {
  const group = new THREE.Group();
  const paint = toonMat({ color, rim: 0.4 });
  const white = toonMat({ color: 0xffffff, rim: 0.3 });
  const dark = toonMat({ color: 0x1b1c22, rim: 0.15 });
  const grey = toonMat({ color: 0xaeb6c2, rim: 0.2 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  add(rbox(2.0, 0.5, 1.05, 0.22), paint, 0, 0.58, 0);
  add(rbox(1.0, 0.34, 0.85, 0.15), paint, 1.2, 0.46, 0);
  add(rbox(0.5, 0.5, 0.8, 0.12), dark, -1.05, 0.7, 0);
  add(rbox(0.3, 0.75, 0.85, 0.12), paint, -0.55, 1.0, 0);
  add(rbox(0.12, 0.12, 1.5, 0.05), white, 1.62, 0.34, 0);
  // spoiler
  add(rbox(0.08, 0.5, 0.08, 0.02), grey, -1.3, 1.1, 0.4);
  add(rbox(0.08, 0.5, 0.08, 0.02), grey, -1.3, 1.1, -0.4);
  add(rbox(0.55, 0.1, 1.5, 0.05), white, -1.32, 1.4, 0);
  // exhausts
  const pipeGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.4, 10);
  pipeGeo.rotateZ(Math.PI / 2);
  const flames = [];
  for (const z of [-0.25, 0.25]) {
    add(pipeGeo, grey, -1.4, 0.7, z);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xffa020 }));
    f.rotation.z = Math.PI / 2;
    f.position.set(-1.95, 0.7, z);
    f.visible = false;
    group.add(f);
    flames.push(f);
  }
  // steering wheel
  const wheelGeo = new THREE.TorusGeometry(0.17, 0.04, 8, 16);
  const sw = add(wheelGeo, dark, 0.48, 1.08, 0);
  sw.rotation.y = Math.PI / 2;
  sw.rotation.x = 0.0;
  sw.rotation.z = 0.0;
  sw.rotation.set(0, Math.PI / 2, 0);
  sw.rotateX(-0.5);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), dark, 0.38, 0.9, 0).rotation.z = -0.9;

  // driver blob: white helmet, color stripe, dark visor
  const driver = new THREE.Group();
  driver.position.set(-0.05, 1.28, 0);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), white);
  helmet.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.05, 6, 24), paint);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.25, metalness: 0.4 }));
  visor.scale.set(0.55, 0.8, 1.25);
  visor.position.set(0.3, 0.04, 0);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.45, 12), paint);
  body.position.y = -0.4;
  driver.add(helmet, stripe, visor, body);
  group.add(driver);

  // wheels
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.4, 20);
  tireGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.44, 12);
  hubGeo.rotateX(Math.PI / 2);
  const tires = [];
  const pivots = [];
  for (const [x, z, front, r] of [[1.0, 0.76, true, 1], [1.0, -0.76, true, 1], [-0.9, 0.8, false, 1.12], [-0.9, -0.8, false, 1.12]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36 * r, z);
    pivot.scale.setScalar(r);
    const tire = new THREE.Mesh(tireGeo, dark);
    const hub = new THREE.Mesh(hubGeo, grey);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.46), white);
    tire.add(hub, spoke);
    tire.castShadow = true;
    pivot.add(tire);
    group.add(pivot);
    tires.push({ tire, r: 0.36 * r });
    if (front) pivots.push(pivot);
  }

  shadowMat ??= new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.05;
  blob.renderOrder = 2;
  group.add(blob);

  group.userData = { tires, pivots, driver, flames };
  return group;
}

export function updateKartMesh(mesh, kart, dt) {
  const { tires, pivots, driver, flames } = mesh.userData;
  for (const t of tires) t.tire.rotation.z -= (kart.speed / t.r) * dt;
  for (const p of pivots) p.rotation.y = -kart.steerVis * 0.5;
  driver.rotation.x = -kart.steerVis * 0.18;
  driver.rotation.z = Math.min(0.1, kart.speed * 0.004);
  const boosting = kart.boost > 0;
  for (const f of flames) {
    f.visible = boosting;
    if (boosting) f.scale.set(1 + Math.random() * 0.5, 1, 1);
  }
}

import * as THREE from 'three';
import { PIVOT_Y } from './camera.js';
import { attachKartFx } from './kart-fx.js';

/**
 * Procedural MKWii-inspired kart + driver. Colors come from the roster.
 * No GLTF / Nintendo binaries.
 */
export function makeRacer(character) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = PIVOT_Y;
  group.add(body);

  const bodyMat = lambert(character.body);
  const accentMat = lambert(character.hat);
  const skinMat = lambert(character.skin);
  const darkMat = lambert(0x1a1a22);
  const rubberMat = lambert(0x141418);
  const metalMat = lambert(0x9aa3b0);
  const seatMat = lambert(0x2a2a32);

  function add(mesh, x, y, z) {
    mesh.position.set(x, y - PIVOT_Y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  }

  // Chassis
  add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 1.55), bodyMat), 0, 0.38, 0.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.55), bodyMat), 0, 0.4, 0.88);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.35), darkMat), 0, 0.28, 1.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.4), bodyMat), 0, 0.36, -0.85);

  // Side pods
  add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.1), bodyMat), -0.58, 0.4, 0.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.1), bodyMat), 0.58, 0.4, 0.05);

  // Seat tub + steering
  add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.55), seatMat), 0, 0.55, -0.12);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), darkMat), 0, 0.72, 0.22).rotation.x =
    Math.PI / 2.4;

  // Spoiler
  add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.07), metalMat), -0.38, 0.72, -0.92);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.07), metalMat), 0.38, 0.72, -0.92);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.07, 0.32), accentMat), 0, 0.94, -0.95);

  // Number plate accent
  add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.04), accentMat), 0, 0.48, 1.18);

  // Driver
  add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.32), accentMat), 0, 0.95, -0.08);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skinMat), 0, 1.32, -0.02);
  add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      accentMat,
    ),
    0,
    1.4,
    -0.02,
  );
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), accentMat), 0, 1.38, -0.02);

  // Arms
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), skinMat), -0.32, 0.85, 0.12);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), skinMat), 0.32, 0.85, 0.12);

  // Wheels
  const tireGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 16);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.3, 12);
  const rimGeo = new THREE.TorusGeometry(0.22, 0.035, 8, 16);
  for (const [wx, wz] of [
    [-0.62, 0.68],
    [0.62, 0.68],
    [-0.62, -0.68],
    [0.62, -0.68],
  ]) {
    const tire = add(new THREE.Mesh(tireGeo, rubberMat), wx, 0.32, wz);
    tire.rotation.z = Math.PI / 2;
    const hub = add(new THREE.Mesh(hubGeo, metalMat), wx, 0.32, wz);
    hub.rotation.z = Math.PI / 2;
    const rim = add(new THREE.Mesh(rimGeo, darkMat), wx, 0.32, wz);
    rim.rotation.y = Math.PI / 2;
  }

  // Front bumper lights
  add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.06), lambert(0xfff2c8)), -0.35, 0.42, 1.2);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.06), lambert(0xfff2c8)), 0.35, 0.42, 1.2);

  const fx = attachKartFx(body);
  group.userData.body = body;
  group.userData.sparks = fx.sparks;
  group.userData.glow = fx.glow;
  group.userData.fx = fx;
  return group;
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

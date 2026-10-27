import * as THREE from 'three';
import { PIVOT_Y } from './camera.js';
import { attachKartFx } from './kart-fx.js';

/**
 * Procedural MKWii-inspired kart + driver. Colors come from the roster.
 * Silhouette is tuned for chase-cam readability on a TV.
 */
export function makeRacer(character) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = PIVOT_Y;
  group.add(body);

  const bodyMat = lambert(character.body);
  const accentMat = lambert(character.hat);
  const skinMat = lambert(character.skin);
  const darkMat = lambert(0x15151c);
  const rubberMat = lambert(0x0e0e12);
  const metalMat = lambert(0xb0b8c4);
  const seatMat = lambert(0x22222c);
  const stripeMat = lambert(0xffffff);

  function add(mesh, x, y, z, rotY = 0) {
    mesh.position.set(x, y - PIVOT_Y, z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  }

  // Main tub + nose (reads as a kart, not a crate)
  add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.34, 1.35), bodyMat), 0, 0.4, -0.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.26, 0.7), bodyMat), 0, 0.42, 0.85);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.35), bodyMat), 0, 0.38, 1.25);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.2), darkMat), 0, 0.28, 1.32);

  // Side pods / intake
  add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 1.15), bodyMat), -0.62, 0.42, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 1.15), bodyMat), 0.62, 0.42, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), accentMat), -0.72, 0.5, 0.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), accentMat), 0.72, 0.5, 0.1);

  // Hood stripe
  add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 1.0), stripeMat), 0, 0.58, 0.35);

  // Seat + wheel
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.55), seatMat), 0, 0.58, -0.15);
  const wheel = add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 18), darkMat), 0, 0.78, 0.28);
  wheel.rotation.x = Math.PI / 2.5;

  // Tall rear wing (MKWii chase-cam cue)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), metalMat), -0.42, 0.78, -0.95);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), metalMat), 0.42, 0.78, -0.95);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.38), accentMat), 0, 1.08, -0.98);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.08), stripeMat), 0, 1.14, -0.82);

  // Exhaust tips
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.28, 10), metalMat), -0.22, 0.36, -1.15).rotation.x =
    Math.PI / 2;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.28, 10), metalMat), 0.22, 0.36, -1.15).rotation.x =
    Math.PI / 2;

  // Bumper plate with accent
  add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.05), accentMat), 0, 0.5, 1.4);

  // Driver (oversized for TV readability)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.36), accentMat), 0, 1.05, -0.05);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), skinMat), 0, 1.48, 0);
  add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      accentMat,
    ),
    0,
    1.58,
    0,
  );
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 16), accentMat), 0, 1.56, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8), skinMat), -0.36, 0.95, 0.18);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8), skinMat), 0.36, 0.95, 0.18);

  // Wheels with thick tires
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 18);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.34, 12);
  const rimGeo = new THREE.TorusGeometry(0.24, 0.04, 8, 18);
  for (const [wx, wz] of [
    [-0.68, 0.72],
    [0.68, 0.72],
    [-0.68, -0.72],
    [0.68, -0.72],
  ]) {
    const tire = add(new THREE.Mesh(tireGeo, rubberMat), wx, 0.36, wz);
    tire.rotation.z = Math.PI / 2;
    const hub = add(new THREE.Mesh(hubGeo, metalMat), wx, 0.36, wz);
    hub.rotation.z = Math.PI / 2;
    const rim = add(new THREE.Mesh(rimGeo, darkMat), wx, 0.36, wz);
    rim.rotation.y = Math.PI / 2;
  }

  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), lambert(0xfff6d0)), -0.38, 0.46, 1.35);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), lambert(0xfff6d0)), 0.38, 0.46, 1.35);

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

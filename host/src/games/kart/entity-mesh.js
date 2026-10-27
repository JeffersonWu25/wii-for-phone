import * as THREE from 'three';

/** Visual-only item / hazard meshes. Physics stays in race.js. */
export function makeEntity(kind) {
  if (kind === 'box') return makeItemBox();
  if (kind === 'banana') return makeBanana();
  if (kind === 'shell') return makeShell();
  throw new Error(`unknown entity kind ${kind}`);
}

function makeItemBox() {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.05, 1.05),
    new THREE.MeshLambertMaterial({
      color: 0xffe566,
      transparent: true,
      opacity: 0.92,
    }),
  );
  glass.castShadow = true;
  group.add(glass);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.12, 1.18),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  rim.position.y = 0.52;
  group.add(rim);
  const rim2 = rim.clone();
  rim2.position.y = -0.52;
  group.add(rim2);

  const q = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x2a6bff, side: THREE.DoubleSide }),
  );
  q.position.set(0, 0, 0.54);
  group.add(q);
  const q2 = q.clone();
  q2.position.z = -0.54;
  group.add(q2);

  group.userData.y = 1.15;
  group.userData.kind = 'box';
  group.userData.spin = true;
  return group;
}

function makeBanana() {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.18, 8, 14, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0xffd84d }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.userData.y = 0.28;
  mesh.userData.kind = 'banana';
  return mesh;
}

function makeShell() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 12),
    new THREE.MeshLambertMaterial({ color: 0x3caa2a }),
  );
  shell.castShadow = true;
  group.add(shell);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.06, 8, 16),
    new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }),
  );
  band.rotation.x = Math.PI / 2;
  group.add(band);
  group.userData.y = 0.42;
  group.userData.kind = 'shell';
  return group;
}

export function syncEntities(scene, pool, entities, now) {
  const live = new Set();
  for (const entity of entities || []) {
    live.add(entity.id);
    let mesh = pool.get(entity.id);
    if (!mesh) {
      mesh = makeEntity(entity.kind);
      pool.set(entity.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(entity.x, mesh.userData.y, entity.z);
    mesh.visible = entity.kind !== 'box' || entity.cooldown <= 0;
    if (entity.kind === 'box') {
      mesh.rotation.y = now / 700;
    } else if (mesh.material?.color && entity.color != null) {
      mesh.material.color.set(entity.color);
    } else if (entity.kind === 'shell' && entity.color != null) {
      mesh.children[0]?.material?.color?.set(entity.color);
    } else if (entity.kind === 'banana' && entity.color != null) {
      mesh.material?.color?.set(entity.color);
    }
  }
  for (const [id, mesh] of pool) {
    if (live.has(id)) continue;
    scene.remove(mesh);
    disposeObject(mesh);
    pool.delete(id);
  }
}

function disposeObject(root) {
  root.traverse((obj) => {
    obj.geometry?.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.dispose();
    }
  });
}

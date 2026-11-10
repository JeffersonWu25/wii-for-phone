// Coconut Coast world. Placeholder: the shared ground, walls and sky, a flat ocean, and one empty
// `section:<id>` group per section for the scenery to fill in. Contract matches scene/world.js.
import * as THREE from 'three';
import { buildGround } from '../ground.js';
import { buildWalls } from '../walls.js';
import { buildSky, HORIZON } from '../sky.js';
import { buildShortcutScenery } from './shortcut.js';

export const SEA_LEVEL = -1.2;

export function buildCoconutWorld(track) {
  const group = new THREE.Group();

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3;
  group.add(sun, sun.target, new THREE.HemisphereLight(0xa8d4ff, 0xe8d8a0, 1.5));

  const ground = buildGround(track, sun);
  const walls = buildWalls(track);
  const sky = buildSky();

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: 0x23b7c9 }));
  ocean.name = 'ocean';
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(ground.center.x, SEA_LEVEL, ground.center.z);
  ocean.receiveShadow = true;

  const sections = track.sections.map((s) => {
    const g = new THREE.Group();
    g.name = `section:${s.id}`;
    return g;
  });
  group.add(ocean, ground.group, walls.group, sky.group, ...sections, buildShortcutScenery(track));

  return {
    group,
    sun,
    center: ground.center,
    background: new THREE.Color(HORIZON),
    fog: { color: HORIZON, near: 600, far: 2300 },
    setStartLights() {},
    tick(t, camera) {
      ground.tick(t);
      sky.tick(t, camera);
    },
  };
}

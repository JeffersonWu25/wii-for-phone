// World builders. buildWorld(track, renderer) dispatches on track.id and returns
// { group, tick(t, camera), sun, center, background, fog, setStartLights }.
// This file builds Sunny Meadow Circuit: shader ground, walls, sky, props, lighting. Coconut Coast lives in coconut/.
import * as THREE from 'three';
import { buildGround } from './ground.js';
import { buildWalls } from './walls.js';
import { buildSky, HORIZON } from './sky.js';
import { buildDecor } from './decor.js';
import { buildCoconutWorld } from './coconut/world.js';

export function buildWorld(track, renderer) {
  if (track.id === 'coconut-coast') return buildCoconutWorld(track, renderer);
  return buildSunnyWorld(track);
}

function buildSunnyWorld(track) {
  const group = new THREE.Group();

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3;
  group.add(sun, sun.target, new THREE.HemisphereLight(0xa8d4ff, 0x7fb04a, 1.5));

  const ground = buildGround(track, sun);
  const walls = buildWalls(track);
  const sky = buildSky();
  const decor = buildDecor(track);
  group.add(ground.group, walls.group, sky.group, decor.group);

  return {
    group,
    sun,
    center: ground.center,
    background: new THREE.Color(HORIZON),
    fog: { color: HORIZON, near: 600, far: 2300 },
    setStartLights: decor.setStartLights,
    tick(t, camera) {
      ground.tick(t);
      decor.tick(t);
      sky.tick(t, camera);
    },
  };
}

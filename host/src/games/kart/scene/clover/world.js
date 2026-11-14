// Clover Meadows world: the shared ground shader re-skinned as dirt road on bright grass, a pink-tinted sky, and one
// `section:<id>` group per section of farm, flower, windmill, field, hillside and creek scenery.
import * as THREE from 'three';
import { buildGround } from '../ground.js';
import { buildSky } from '../sky.js';
import { section } from '../coconut/kit.js';
import { buildFarmhouse, buildCows } from './farm.js';
import { buildWildflower, buildMeadowfield } from './meadow.js';
import { buildWindmill } from './windmill.js';
import { buildSwitchbacks } from './hillside.js';
import { buildCreek, carveCreek } from './creek.js';
import { buildHazards } from './hazards.js';

const HORIZON = 0xffd6e0;
const SMALL_LOD = 190;
const ALWAYS = new Set(['prop:tower', 'prop:tunnelShell', 'prop:farmhouse', 'prop:bigTrees', 'prop:patches', 'prop:bypass', 'prop:water', 'prop:fence']);

const DOME = `varying vec3 vDir;
  void main(){
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 hor = vec3(1.0, 0.84, 0.88);
    vec3 mid = vec3(0.60, 0.74, 0.96);
    vec3 top = vec3(0.30, 0.52, 0.93);
    vec3 c = mix(hor, mid, smoothstep(0.0, 0.3, h));
    c = mix(c, top, smoothstep(0.25, 0.95, h));
    if (vDir.y < 0.0) c = hor;
    gl_FragColor = vec4(c, 1.0);
  }`;

const BUILDERS = {
  farmhouse: buildFarmhouse,
  wildflower: buildWildflower,
  windmill: buildWindmill,
  meadowfield: buildMeadowfield,
  switchbacks: buildSwitchbacks,
  creek: buildCreek,
  cows: buildCows,
};

// GLSL edits for the shared ground: dirt road without asphalt markings, grass runoff in place of sand, plain green hills.
export const LOOK = {
  key: 'clover',
  edits: [
    ['vec3 grassA = C(0.24, 0.63, 0.10);', 'vec3 grassA = C(0.247, 0.604, 0.180);'],
    ['vec3 grassB = C(0.34, 0.76, 0.14);', 'vec3 grassB = C(0.361, 0.749, 0.227);'],
    ['float ys = step(0.6, fract(sin(bi * 12.9898 + 78.233) * 43758.5453));', 'float ys = 0.0;'],
    ['smoothstep(0.02, 0.3, sandW)', '0.0'],
    ['vec3 road = C(0.35, 0.35, 0.39);', 'vec3 road = mix(C(0.788, 0.541, 0.294), C(0.859, 0.627, 0.384), fbm(wp * 0.4)); road *= 1.0 - 0.1 * smoothstep(0.55, 0.9, vn(vec2(lat * 1.4, s * 0.09)));'],
    ['road = mix(road, eChkC, stripM);', ''],
    ['road = mix(road, C(0.97, 0.97, 0.95), max(edgeM, max(dashM, gridM) * 0.95));', 'road = mix(road, C(0.97, 0.95, 0.88), gridM * 0.8);'],
  ],
};

export function buildCloverWorld(track) {
  const group = new THREE.Group();

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3;
  group.add(sun, sun.target, new THREE.HemisphereLight(0xb8d8ff, 0x8cc455, 1.5));

  const carved = carveCreek(track);
  const ctx = { track, lod: [], anim: [], creek: carved };
  const ground = buildGround(carved.proxy, sun, { curb: [0.85, 0.27, 0.2], look: LOOK });
  const sky = buildSky();
  sky.group.name = 'sky';
  // Pink-tinted clouds and a softer pastel gradient dome.
  sky.cloudMaterial.color.set(0xffd9e6);
  sky.dome.material.fragmentShader = DOME;

  const sections = track.sections.map((s) => (BUILDERS[s.id] ? BUILDERS[s.id](ctx, s) : section(s.id)));
  const hazards = buildHazards(track, ctx.windmill);

  // Distance culling for small props, on top of frustum culling; landmarks and big ribbons stay.
  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  for (const sec of sections) {
    sec.updateMatrixWorld(true);
    sec.traverse((o) => {
      if (!o.name.startsWith('prop:') || ALWAYS.has(o.name)) return;
      box.makeEmpty();
      o.traverse((m) => {
        if (!m.isMesh) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
      });
      if (box.isEmpty()) return;
      box.getBoundingSphere(sphere);
      ctx.lod.push({ obj: o, x: sphere.center.x, z: sphere.center.z, d2: (SMALL_LOD + sphere.radius) ** 2 });
    });
  }
  const CAST = new Set(['prop:farmhouse', 'prop:tower', 'prop:bigTrees', 'prop:tunnelShell']);
  for (const sec of sections) sec.traverse((o) => { if (o.isMesh && !CAST.has(o.parent?.name)) o.castShadow = false; });
  group.add(ground.group, sky.group, ...sections, hazards.group);

  return {
    group,
    sun,
    center: ground.center,
    background: new THREE.Color(HORIZON),
    fog: { color: HORIZON, near: 600, far: 2300 },
    windmill: ctx.windmill,
    setStartLights: () => {},
    tick(t, camera, raceTime = t) {
      ground.tick(t);
      sky.tick(t, camera);
      for (const f of ctx.anim) f(t);
      hazards.tick(raceTime);
      if (camera) {
        const p = camera.position;
        for (const l of ctx.lod) l.obj.visible = (p.x - l.x) ** 2 + (p.z - l.z) ** 2 < l.d2;
      }
    },
  };
}

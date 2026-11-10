// Coconut Coast world: the shared ground shader on the island shoreline, a depth-tinted ocean, a tropical sky and one
// `section:<id>` group per section, each filled with track-swept geometry plus a few placed landmark models.
import * as THREE from 'three';
import { buildGround } from '../ground.js';
import { buildSky, HORIZON } from '../sky.js';
import { makeIsland } from './terrain.js';
import { buildOcean } from './ocean.js';
import { section } from './kit.js';
import { buildVillage } from './village.js';
import { buildSunshine, buildPier } from './shore.js';
import { buildCliffs, buildFalls } from './cliffs.js';
import { buildGrove, buildSandy } from './grove.js';

export { SEA_LEVEL } from './kit.js';

const PALM_LOD = 120;
const SMALL_LOD = 170;
const ALWAYS = new Set(['prop:lighthouse', 'prop:cliffFace', 'prop:rocks', 'prop:tunnelShell', 'prop:waterfall']);
const BIG = new Set(['prop:sand', 'prop:beach', 'prop:deck', 'prop:sandPath', 'prop:wetRoad']);

const BUILDERS = {
  village: buildVillage,
  sunshine: buildSunshine,
  pier: buildPier,
  cliffs: buildCliffs,
  falls: buildFalls,
  palms: buildGrove,
  sandy: buildSandy,
};

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

  const isl = makeIsland(track);
  const ctx = { track, isl, lod: [], anim: [] };
  const ground = buildGround(isl.track, sun);
  const sky = buildSky();
  sky.group.name = 'sky';
  const ocean = buildOcean(track, isl);

  const sections = track.sections.map((s) => (BUILDERS[s.id] ? BUILDERS[s.id](ctx, s) : section(s.id)));
  // Distance culling: small props drop out when far, on top of frustum culling. Landmarks stay.
  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  for (const sec of sections) {
    sec.updateMatrixWorld(true);
    sec.traverse((o) => {
      if (o.name === 'prop:palms') {
        for (const m of o.children) if (m.isInstancedMesh) ctx.lod.push({ obj: m, x: m.boundingSphere.center.x, z: m.boundingSphere.center.z, d2: PALM_LOD * PALM_LOD });
      } else if (o.name.startsWith('prop:') && !ctx.lod.some((l) => l.obj === o) && !ALWAYS.has(o.name)) {
        box.makeEmpty();
        o.traverse((m) => {
          if (!m.isMesh) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
        });
        if (box.isEmpty()) return;
        box.getBoundingSphere(sphere);
        const reach = BIG.has(o.name) ? 330 : SMALL_LOD;
        ctx.lod.push({ obj: o, x: sphere.center.x, z: sphere.center.z, d2: (reach + sphere.radius) ** 2 });
      }
    });
  }
  const SHADOWS = new Set(['prop:arch', 'prop:hut', 'prop:stall', 'prop:palms']);
  for (const sec of sections) sec.traverse((o) => { if (o.isMesh && !SHADOWS.has(o.parent?.name)) o.castShadow = false; });
  group.add(ocean.group, ground.group, sky.group, ...sections);

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
      ocean.tick(t);
      for (const f of ctx.anim) f(t);
      if (camera) {
        const p = camera.position;
        for (const l of ctx.lod) l.obj.visible = (p.x - l.x) ** 2 + (p.z - l.z) ** 2 < l.d2;
      }
    },
  };
}

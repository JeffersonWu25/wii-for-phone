import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { catalogIds, effectView, slotView } from './items.js';

const BURST_MS = 400;
const FLASH_EFFECTS = new Set(['boost', 'star']);
const MAP_KEYS = ['map', 'alphaMap', 'aoMap', 'emissiveMap', 'lightMap', 'normalMap', 'specularMap'];

// MeshBasic keeps the question-mark texture and the translucent cyan readable.
// The scene has no environment map, and Lambert would shade the unlit glass.
const VISUAL = Object.freeze({
  box: Object.freeze({
    url: '/kart-items/item_box.glb',
    shading: 'basic',
    lift: 1.15,
    // The GLB cube is 1.19 m. 1.35 m between centers leaves a gap, and a shared bob keeps it.
    stackStep: 1.35,
    bob: 0.08,
    bobMs: 900,
    spinMs: 700,
  }),
  mushroom: Object.freeze({
    url: '/kart-items/mushroom.glb',
    shading: 'lambert',
    scale: 0.55,
    heldOffset: Object.freeze({ x: 0, y: 0.7, z: -1.25 }),
    flash: Object.freeze({ effect: 'boost', ms: 350, y: 1.05, z: 0.35 }),
  }),
  banana: Object.freeze({
    url: '/kart-items/banana.glb',
    shading: 'lambert',
    scale: 0.65,
    heldOffset: Object.freeze({ x: 0, y: 0.5, z: -1.3 }),
    // The peel is authored upright. This lays it on the road before restY is measured.
    restRx: -Math.PI / 2,
  }),
  green_shell: Object.freeze({
    url: '/kart-items/green_shell.glb',
    shading: 'lambert',
    scale: 0.5,
    heldOffset: Object.freeze({ x: 0, y: 0.55, z: -1.35 }),
    faceVelocity: true,
    spinMs: 180,
  }),
  red_shell: Object.freeze({
    url: '/kart-items/red_shell.glb',
    shading: 'lambert',
    scale: 0.5,
    heldOffset: Object.freeze({ x: 0, y: 0.55, z: -1.35 }),
    faceVelocity: true,
    spinMs: 180,
  }),
  star: Object.freeze({
    url: '/kart-items/star.glb',
    shading: 'lambert',
    scale: 0.45,
    heldOffset: Object.freeze({ x: 0, y: 0.95, z: -1.15 }),
    flash: Object.freeze({ effect: 'star', ms: 700, y: 1.35, z: 0, spinMs: 180 }),
  }),
});

const FLASH_BY_EFFECT = new Map(
  Object.entries(VISUAL)
    .filter(([, spec]) => spec.flash)
    .map(([key, spec]) => [spec.flash.effect, { key, spec }]),
);

function assertVisualCoverage() {
  const ids = catalogIds();
  const known = new Set(ids);
  for (const id of ids) {
    if (!VISUAL[id]) throw new Error(`missing item visual for ${id}`);
  }
  const urls = new Set();
  const flashes = new Set();
  for (const [key, spec] of Object.entries(VISUAL)) {
    if (key !== 'box' && !known.has(key)) throw new Error(`orphan item visual ${key}`);
    if (spec.shading !== 'basic' && spec.shading !== 'lambert') {
      throw new Error(`bad shading ${spec.shading} on ${key}`);
    }
    if (urls.has(spec.url)) throw new Error(`duplicate visual url ${spec.url}`);
    urls.add(spec.url);
    const effect = spec.flash?.effect ?? null;
    if (!effect) continue;
    if (!FLASH_EFFECTS.has(effect)) throw new Error(`flash ${effect} on ${key} is not a rising effect`);
    if (flashes.has(effect)) throw new Error(`duplicate flash ${effect}`);
    flashes.add(effect);
  }
}

function visualKey(entity) {
  if (entity.kind === 'box') return 'box';
  if (entity.kind === 'banana') return 'banana';
  if (entity.kind === 'shell') return entity.itemId || null;
  return null;
}

function materialsOf(obj) {
  if (!obj.material) return [];
  return Array.isArray(obj.material) ? obj.material : [obj.material];
}

function convertMaterials(root, shading) {
  const Mat = shading === 'basic' ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
  const converted = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const sources = materialsOf(obj);
    const next = sources.map((source) => {
      if (!source) return source;
      const ready = converted.get(source);
      if (ready) return ready;
      const material = new Mat({
        color: source.color ? source.color.clone() : new THREE.Color(0xffffff),
        map: source.map || null,
        alphaMap: source.alphaMap || null,
        transparent: source.transparent === true,
        opacity: source.opacity == null ? 1 : source.opacity,
        side: source.side ?? THREE.FrontSide,
        depthWrite: source.depthWrite,
        vertexColors: source.vertexColors,
      });
      if (source.alphaTest) material.alphaTest = source.alphaTest;
      converted.set(source, material);
      return material;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    obj.castShadow = true;
  });
  for (const source of converted.keys()) source.dispose();
}

function templateFromGltf(scene) {
  if (!scene?.isScene) return scene;
  const root = new THREE.Group();
  for (const child of scene.children.slice()) root.add(child);
  return root;
}

function ensureNormals(root) {
  // These GLBs store positions only. Lambert stays black until the faces have normals.
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    if (!obj.geometry.getAttribute('normal')) obj.geometry.computeVertexNormals();
  });
}

function prepareTemplate(scene, spec) {
  const root = templateFromGltf(scene);
  convertMaterials(root, spec.shading);
  if (spec.shading === 'lambert') ensureNormals(root);
  root.scale.setScalar(spec.scale ?? 1);
  if (spec.restRx) root.rotation.x = spec.restRx;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  // Measured after scale and the banana lay-down, so the lowest vertex sits on the road.
  root.userData.restY = bounds.isEmpty() ? 0 : -bounds.min.y;
  return root;
}

function cloneInstance(template) {
  const rig = new THREE.Group();
  const visual = template.clone(true);
  visual.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    obj.geometry = obj.geometry.clone();
    const list = materialsOf(obj);
    const cloned = list.map((mat) => (mat ? mat.clone() : mat));
    obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
  });
  rig.add(visual);
  rig.userData.visual = visual;
  rig.userData.restY = template.userData.restY || 0;
  return rig;
}

function disposeClone(root) {
  // Maps stay on the template. Mid-race cleanup frees this clone only.
  root.traverse((obj) => {
    obj.geometry?.dispose();
    for (const mat of materialsOf(obj)) mat.dispose();
  });
}

function disposeTemplate(root) {
  const maps = new Set();
  root.traverse((obj) => {
    obj.geometry?.dispose();
    for (const mat of materialsOf(obj)) {
      for (const key of MAP_KEYS) {
        const tex = mat[key];
        if (tex?.isTexture) maps.add(tex);
      }
      mat.dispose();
    }
  });
  for (const tex of maps) tex.dispose();
}

function detach(scene, object) {
  if (object.parent) object.parent.remove(object);
  else scene?.remove(object);
}

function poseWorld(rig, entity, spec, now) {
  const roadY = Number.isFinite(entity.roadY) ? entity.roadY : 0;
  if (entity.kind === 'box') {
    const phase = (entity.x + entity.z) * 0.17;
    const bob = Math.sin(now / spec.bobMs + phase) * spec.bob;
    const tier = entity.tier || 0;
    rig.position.set(
      entity.x,
      roadY + spec.lift + tier * spec.stackStep + bob,
      entity.z,
    );
    rig.rotation.set(0, now / spec.spinMs, 0);
    return;
  }
  rig.position.set(entity.x, roadY + (rig.userData.restY || 0), entity.z);
  const visual = rig.userData.visual;
  if (spec.faceVelocity) {
    rig.rotation.set(0, Math.atan2(entity.vx || 0, entity.vz || 0), 0);
    // Spin about local up so the dome stays above the road while yaw follows velocity.
    if (visual && spec.spinMs) visual.rotation.y = now / spec.spinMs;
  } else {
    rig.rotation.set(0, 0, 0);
  }
}

function spawnBurst(scene, origin, now) {
  const group = new THREE.Group();
  group.name = 'item-burst';
  group.position.copy(origin);
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x9ad7ff : 0xfff2a8,
        transparent: true,
        opacity: 0.95,
      }),
    );
    const angle = (i / 8) * Math.PI * 2;
    mesh.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * 2.4,
      1.6 + (i % 3) * 0.35,
      Math.sin(angle) * 2.4,
    );
    group.add(mesh);
  }
  group.userData.born = now;
  scene.add(group);
  return group;
}

function stepBursts(bursts, now) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const group = bursts[i];
    const age = now - group.userData.born;
    if (age >= BURST_MS) {
      group.removeFromParent();
      disposeClone(group);
      bursts.splice(i, 1);
      continue;
    }
    const t = Math.max(0, age) / 1000;
    const fade = 1 - age / BURST_MS;
    for (const mesh of group.children) {
      const velocity = mesh.userData.velocity;
      mesh.position.set(velocity.x * t, velocity.y * t - 3 * t * t, velocity.z * t);
      mesh.material.opacity = 0.95 * fade;
    }
  }
}

export function createItemView() {
  assertVisualCoverage();
  const templates = new Map();
  const failures = new Map();
  const reported = new Set();
  const pool = new Map();
  const held = new Map();
  const flashes = new Map();
  const effects = new Map();
  const bursts = [];
  let pending = null;
  let released = false;
  let pendingError = null;

  function noteFailure(url) {
    if (pendingError || reported.has(url)) return;
    const err = failures.get(url);
    if (!err) return;
    reported.add(url);
    pendingError = err;
  }

  function makeInstance(key) {
    const spec = VISUAL[key];
    if (!spec) return null;
    if (failures.has(spec.url)) {
      noteFailure(spec.url);
      return null;
    }
    const template = templates.get(key);
    if (!template) return null;
    const rig = cloneInstance(template);
    rig.name = key;
    rig.userData.key = key;
    return rig;
  }

  async function loadOne(loader, key, spec) {
    try {
      const gltf = await loader.loadAsync(spec.url);
      if (released) {
        disposeTemplate(templateFromGltf(gltf.scene));
        return;
      }
      const template = prepareTemplate(gltf.scene, spec);
      if (released) {
        disposeTemplate(template);
        return;
      }
      templates.set(key, template);
    } catch (err) {
      if (!failures.has(spec.url)) {
        failures.set(spec.url, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  function load() {
    if (pending) return pending;
    const loader = new GLTFLoader();
    pending = Promise.all(
      Object.entries(VISUAL).map(([key, spec]) => loadOne(loader, key, spec)),
    ).then(() => undefined);
    return pending;
  }

  function sync(scene, race, racers, now) {
    if (released) return;
    for (const url of failures.keys()) {
      if (reported.has(url)) continue;
      noteFailure(url);
      break;
    }

    const live = new Set();
    for (const entity of race.entities || []) {
      const key = visualKey(entity);
      const spec = key ? VISUAL[key] : null;
      if (!spec) continue;
      live.add(entity.id);
      let rig = pool.get(entity.id);
      if (rig && rig.userData.key !== key) {
        detach(scene, rig);
        disposeClone(rig);
        pool.delete(entity.id);
        rig = null;
      }
      if (!rig) {
        rig = makeInstance(key);
        if (!rig) continue;
        pool.set(entity.id, rig);
        scene.add(rig);
      }
      poseWorld(rig, entity, spec, now);
      if (entity.kind === 'box') {
        const shown = entity.cooldown <= 0;
        if (rig.userData.wasLive === true && !shown) {
          bursts.push(spawnBurst(scene, rig.position, now));
        }
        rig.userData.wasLive = shown;
        rig.visible = shown;
      }
    }
    for (const [id, rig] of pool) {
      if (live.has(id)) continue;
      detach(scene, rig);
      disposeClone(rig);
      pool.delete(id);
    }

    const seen = new Set();
    (race.karts || []).forEach((kart, index) => {
      const playerId = kart.playerId;
      seen.add(playerId);
      const parent = racers?.[index] || null;
      const view = slotView(kart, race.timeMs);
      const heldId = view.primaryFace === 'held' ? view.itemPrimary : null;
      let entry = held.get(playerId);
      const spec = heldId ? VISUAL[heldId] : null;
      if (!spec?.heldOffset) {
        if (entry) {
          detach(scene, entry.rig);
          disposeClone(entry.rig);
          held.delete(playerId);
        }
      } else if (!entry || entry.id !== heldId) {
        if (entry) {
          detach(scene, entry.rig);
          disposeClone(entry.rig);
        }
        const rig = makeInstance(heldId);
        if (!rig) {
          held.delete(playerId);
        } else {
          entry = { id: heldId, rig };
          held.set(playerId, entry);
        }
      }
      entry = held.get(playerId);
      if (entry && parent) {
        // The outer kart group yaws. The body child rolls, so a prop on the body would swing.
        if (entry.rig.parent !== parent) parent.add(entry.rig);
        const offset = VISUAL[entry.id].heldOffset;
        entry.rig.position.set(offset.x, offset.y, offset.z);
        entry.rig.rotation.set(0, 0, 0);
      }

      const effect = effectView(kart);
      const prev = effects.get(playerId) ?? null;
      // effectView stays null during a drift mini-turbo, so the flash does not follow the exhaust glow.
      if (effect && effect !== prev) {
        const flashSpec = FLASH_BY_EFFECT.get(effect);
        const url = flashSpec?.spec.url;
        const ready = !flashSpec || templates.has(flashSpec.key) || failures.has(url);
        // A load still in flight must not eat the edge. The next sync can still see it rise.
        if (ready && parent) {
          if (flashSpec) {
            const current = flashes.get(playerId);
            if (current) {
              detach(scene, current.rig);
              disposeClone(current.rig);
            }
            const rig = makeInstance(flashSpec.key);
            if (rig) {
              parent.add(rig);
              flashes.set(playerId, {
                until: now + flashSpec.spec.flash.ms,
                rig,
                spec: flashSpec.spec,
              });
            } else {
              flashes.delete(playerId);
            }
          }
          effects.set(playerId, effect);
        }
      } else {
        effects.set(playerId, effect ?? null);
      }
      const flash = flashes.get(playerId);
      if (!flash) return;
      if (!parent || now >= flash.until) {
        detach(scene, flash.rig);
        disposeClone(flash.rig);
        flashes.delete(playerId);
        return;
      }
      if (flash.rig.parent !== parent) parent.add(flash.rig);
      flash.rig.position.set(0, flash.spec.flash.y, flash.spec.flash.z);
      const spinMs = flash.spec.flash.spinMs;
      flash.rig.rotation.set(0, spinMs ? now / spinMs : 0, 0);
    });

    for (const [playerId, entry] of held) {
      if (seen.has(playerId)) continue;
      detach(scene, entry.rig);
      disposeClone(entry.rig);
      held.delete(playerId);
    }
    for (const [playerId, flash] of flashes) {
      if (seen.has(playerId)) continue;
      detach(scene, flash.rig);
      disposeClone(flash.rig);
      flashes.delete(playerId);
    }
    for (const playerId of effects.keys()) {
      if (!seen.has(playerId)) effects.delete(playerId);
    }

    stepBursts(bursts, now);
    if (pendingError) {
      const err = pendingError;
      pendingError = null;
      throw err;
    }
  }

  function release(scene) {
    if (released) return;
    released = true;
    for (const rig of pool.values()) {
      detach(scene, rig);
      disposeClone(rig);
    }
    pool.clear();
    for (const entry of held.values()) {
      detach(scene, entry.rig);
      disposeClone(entry.rig);
    }
    held.clear();
    for (const flash of flashes.values()) {
      detach(scene, flash.rig);
      disposeClone(flash.rig);
    }
    flashes.clear();
    for (const group of bursts) {
      detach(scene, group);
      disposeClone(group);
    }
    bursts.length = 0;
    for (const template of templates.values()) disposeTemplate(template);
    templates.clear();
    effects.clear();
  }

  return {
    load,
    sync,
    release,
    dispose: release,
  };
}

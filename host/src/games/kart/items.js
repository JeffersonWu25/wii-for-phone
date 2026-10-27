const BOX_COOLDOWN = 3;
const BOX_RADIUS = 1.7;
const HIT_RADIUS = 1.25;
const ROULETTE_MS = 1200;

// Five columns at 2.6 m still fit the narrowest Luigi asphalt after a 1.05 m inset.
const ROW = Object.freeze({
  columns: 5,
  maxSpacing: 2.6,
  edgeInset: 1.05,
});

const MODIFIERS = Object.freeze({
  speed: Object.freeze({}),
  invuln: Object.freeze({ blocksHarm: true }),
  spin: Object.freeze({
    harm: true,
    duration: 1,
    yawRate: 10,
    speedScale: 0.35,
  }),
});

const GUIDES = Object.freeze({
  straight(entity, dt) {
    entity.x += entity.vx * dt;
    entity.z += entity.vz * dt;
  },
});

const ITEMS = Object.freeze({
  mushroom: Object.freeze({
    id: 'mushroom',
    weight: 35,
    label: 'Mushroom',
    color: '#e23b3b',
    speedMul: 1.45,
    mods: Object.freeze({ speed: 1.5 }),
    use: useSelf,
  }),
  banana: Object.freeze({
    id: 'banana',
    weight: 30,
    label: 'Banana',
    color: '#ffe14a',
    kind: 'banana',
    life: 15,
    dropDistance: 2.4,
    arm: 0.35,
    hit: 'spin',
    use: useDrop,
  }),
  green_shell: Object.freeze({
    id: 'green_shell',
    weight: 25,
    label: 'Green Shell',
    color: '#3ddc4a',
    kind: 'shell',
    guide: 'straight',
    projectileSpeed: 48,
    life: 4,
    dropDistance: 2.4,
    arm: 0.2,
    hit: 'spin',
    use: useLaunch,
  }),
  red_shell: Object.freeze({
    id: 'red_shell',
    weight: 0,
    label: 'Red Shell',
    color: '#e23d2b',
    kind: 'shell',
    guide: 'straight',
    projectileSpeed: 48,
    life: 4,
    dropDistance: 2.4,
    arm: 0.2,
    hit: 'spin',
    use: useLaunch,
  }),
  star: Object.freeze({
    id: 'star',
    weight: 10,
    label: 'Star',
    color: '#ffe566',
    speedMul: 1.55,
    mods: Object.freeze({ speed: 5, invuln: 5 }),
    use: useSelf,
  }),
});

const ITEM_LIST = Object.freeze(Object.values(ITEMS));

{
  const weight = ITEM_LIST.reduce((sum, def) => sum + def.weight, 0);
  if (weight !== 100) throw new Error(`item weights sum to ${weight}`);
  for (const def of ITEM_LIST) {
    for (const id of Object.keys(def.mods || {})) {
      if (!MODIFIERS[id]) throw new Error(`unknown mod ${id} on ${def.id}`);
    }
    if (def.mods?.speed != null && !(def.speedMul > 0)) {
      throw new Error(`${def.id} missing speedMul`);
    }
    if (def.hit && !MODIFIERS[def.hit]) throw new Error(`unknown hit ${def.hit} on ${def.id}`);
    if (def.kind != null && def.kind !== 'banana' && def.kind !== 'shell') {
      throw new Error(`bad spawn kind ${def.kind}`);
    }
    if (def.kind != null && !(def.life > 0)) throw new Error(`${def.id} missing life`);
    if (def.guide != null && !GUIDES[def.guide]) throw new Error(`unknown guide ${def.guide} on ${def.id}`);
  }
}

function useSelf(_race, kart, def) {
  for (const [id, duration] of Object.entries(def.mods)) {
    grant(kart, id, duration, id === 'speed' ? def.speedMul : undefined);
  }
}

function roadYAt(track, x, z) {
  const sample = track.sampleTrack(x, z);
  return track.poseAt(sample.progress).visualOuterY || 0;
}

function useDrop(race, kart, def) {
  const facing = kart.facing;
  const x = kart.x - Math.sin(facing) * def.dropDistance;
  const z = kart.z - Math.cos(facing) * def.dropDistance;
  spawn(race, {
    kind: def.kind,
    itemId: def.id,
    ownerId: kart.playerId,
    x,
    z,
    roadY: roadYAt(race.track, x, z),
    color: def.color,
    arm: def.arm,
    life: def.life,
  });
}

function useLaunch(race, kart, def) {
  const facing = kart.facing;
  const speed = def.projectileSpeed;
  const x = kart.x + Math.sin(facing) * def.dropDistance;
  const z = kart.z + Math.cos(facing) * def.dropDistance;
  spawn(race, {
    kind: 'shell',
    itemId: def.id,
    ownerId: kart.playerId,
    x,
    z,
    roadY: roadYAt(race.track, x, z),
    color: def.color,
    arm: def.arm,
    vx: Math.sin(facing) * speed,
    vz: Math.cos(facing) * speed,
    life: def.life,
  });
}

function grant(kart, id, duration, speedMul) {
  const spec = MODIFIERS[id];
  if (!spec) throw new Error(`unknown modifier ${id}`);
  if (!(duration > 0)) return false;
  const mods = kart.modifiers;
  if (spec.harm) {
    if (mods.invuln > 0) return false;
    if (mods[id] > 0) return false;
  }
  if (spec.blocksHarm) delete mods.spin;
  if (id === 'speed') {
    mods.speed = Math.max(mods.speed || 0, duration);
    kart.speedMul = Math.max(kart.speedMul || 1, speedMul);
    return true;
  }
  mods[id] = Math.max(mods[id] || 0, duration);
  return true;
}

function spawn(race, fields) {
  const entity = { ...fields, id: race._nextEntityId };
  race._nextEntityId += 1;
  race.entities.push(entity);
  return entity;
}

function rollItem(rng) {
  let ticket = rng() * 100;
  let fallback = null;
  for (const def of ITEM_LIST) {
    if (!(def.weight > 0)) continue;
    fallback = def.id;
    ticket -= def.weight;
    if (ticket < 0) return def.id;
  }
  return fallback;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestKart(karts, point, radius) {
  let best = null;
  let bestDist = Infinity;
  for (const kart of karts) {
    const gap = dist(kart, point);
    if (gap > radius || gap >= bestDist) continue;
    best = kart;
    bestDist = gap;
  }
  return best;
}

function pairKey(a, b) {
  return a.playerId < b.playerId
    ? `${a.playerId}|${b.playerId}`
    : `${b.playerId}|${a.playerId}`;
}

function offsetLateral(pose, lateral) {
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  return { x: pose.x + rx * lateral, z: pose.z + rz * lateral };
}

function columnLaterals(halfWidth) {
  const gaps = ROW.columns - 1;
  const span = Math.min(
    ROW.maxSpacing * gaps,
    Math.max(0, (halfWidth - ROW.edgeInset) * 2),
  );
  const step = span / gaps;
  const origin = -span / 2;
  return Array.from({ length: ROW.columns }, (_, i) => origin + step * i);
}

function expandBoxes(race, sites) {
  sites.forEach((site, siteIndex) => {
    const pose = race.track.poseAt(site.progress);
    const laterals = columnLaterals(pose.halfWidth);
    laterals.forEach((lateral, column) => {
      const at = offsetLateral(pose, lateral);
      const roadY = pose.visualOuterY || 0;
      for (let tier = 0; tier < site.stack; tier++) {
        spawn(race, {
          kind: 'box',
          x: at.x,
          z: at.z,
          roadY,
          tier,
          columnKey: `${siteIndex}:${column}`,
          cooldown: 0,
        });
      }
    });
  });
}

function defineSlot(kart, slots, name, key) {
  Object.defineProperty(kart, key, {
    enumerable: true,
    configurable: true,
    get() {
      return slots[name]?.id ?? null;
    },
    set() {
      throw new TypeError('item slots are read-only');
    },
  });
}

function installSlots(kart) {
  const slots = { primary: null, secondary: null };
  kart.slots = slots;
  defineSlot(kart, slots, 'primary', 'itemPrimary');
  defineSlot(kart, slots, 'secondary', 'itemSecondary');
}

export function revealItem(kart, slot, id) {
  if (slot !== 'primary' && slot !== 'secondary') throw new Error(`bad slot ${slot}`);
  if (typeof id !== 'string' || id.length === 0) throw new Error('revealItem requires an item id');
  kart.slots[slot] = { id, readyAt: 0 };
}

export function attachItems(race) {
  for (const kart of race.karts) installSlots(kart);
  race.entities = [];
  race._nextEntityId = 1;
  race._touchPairs = new Set();
  const sites = race.track.itemBoxSites;
  if (!Array.isArray(sites) || sites.length === 0) {
    throw new Error('track.itemBoxSites required');
  }
  expandBoxes(race, sites);
}

export function activateItem(race, kart) {
  const slot = kart.slots.primary;
  if (!slot || slot.readyAt > race.timeMs) return;
  const id = slot.id;
  kart.slots.primary = kart.slots.secondary;
  kart.slots.secondary = null;
  const def = ITEMS[id];
  if (!def) return;
  def.use(race, kart, def);
  kart.itemPresses += 1;
}

function face(slot, timeMs) {
  if (!slot) return null;
  return timeMs >= slot.readyAt ? 'held' : 'roll';
}

export function slotView(kart, timeMs) {
  const primary = kart.slots.primary;
  const secondary = kart.slots.secondary;
  const primaryFace = face(primary, timeMs);
  const secondaryFace = face(secondary, timeMs);
  const shown = primaryFace === 'held' ? presentation(primary.id) : null;
  const shownSecondary = secondaryFace === 'held' ? presentation(secondary.id) : null;
  return {
    itemPrimary: primary?.id ?? null,
    itemSecondary: secondary?.id ?? null,
    itemLabel: shown?.label ?? null,
    itemColor: shown?.color ?? null,
    secondaryColor: shownSecondary?.color ?? null,
    primaryFace,
    secondaryFace,
    effect: effectView(kart),
  };
}

export function catalogIds() {
  return ITEM_LIST.map((def) => def.id);
}

export function presentation(itemId) {
  const def = ITEMS[itemId];
  return def ? { label: def.label, color: def.color } : null;
}

export function controlOf(kart) {
  const mods = kart.modifiers || {};
  const invuln = mods.invuln > 0;
  const locked = mods.spin > 0 && !invuln;
  return {
    speedMul: !locked && mods.speed > 0 ? (kart.speedMul || 1) : 1,
    locked,
    yawRate: locked ? MODIFIERS.spin.yawRate : 0,
    blocksHarm: invuln,
    spinSpeedScale: locked ? MODIFIERS.spin.speedScale : 1,
  };
}

export function effectView(kart) {
  const mods = kart.modifiers;
  if (!mods) return null;
  if (mods.invuln > 0) return 'star';
  if (mods.spin > 0) return 'spin';
  if (mods.speed > 0) return 'boost';
  return null;
}

export function stepItems(race, dt, kartRadius) {
  if (race.phase !== 'racing') return;

  for (const kart of race.karts) {
    if (!kart.finished) continue;
    kart.modifiers = {};
    kart.speedMul = 1;
  }

  const retired = new Set();
  for (const entity of race.entities) {
    if (entity.kind === 'box') {
      if (entity.cooldown > 0) entity.cooldown = Math.max(0, entity.cooldown - dt);
      continue;
    }
    if (entity.arm > 0) entity.arm = Math.max(0, entity.arm - dt);
    entity.life -= dt;
    if (entity.life <= 0) retired.add(entity.id);
  }

  for (const entity of race.entities) {
    if (entity.kind !== 'shell' || retired.has(entity.id)) continue;
    const guideId = ITEMS[entity.itemId].guide;
    const guide = GUIDES[guideId];
    if (!guide) throw new Error(`unknown guide ${guideId}`);
    guide(entity, dt);
    const track = race.track;
    const sample = track.sampleTrack(entity.x, entity.z);
    if (Math.abs(sample.lateral) > track.HALF) retired.add(entity.id);
    // The shell keeps moving, so the height the view reads has to follow the road.
    entity.roadY = track.poseAt(sample.progress).visualOuterY || 0;
  }

  collide(race, kartRadius, retired);

  for (const kart of race.karts) {
    if (kart.finished) continue;
    const mods = kart.modifiers;
    for (const key of Object.keys(mods)) {
      mods[key] -= dt;
      if (mods[key] <= 0) delete mods[key];
    }
    if (!(mods.speed > 0)) kart.speedMul = 1;
  }

  race.entities = race.entities.filter((entity) => entity.kind === 'box' || !retired.has(entity.id));
}

function columnRank(columnKey) {
  const [site, column] = columnKey.split(':').map(Number);
  return site * ROW.columns + column;
}

function openSlot(slots) {
  if (slots.primary == null) return 'primary';
  if (slots.secondary == null) return 'secondary';
  return null;
}

function collideBoxes(race) {
  const timeMs = race.timeMs;
  const columns = new Map();
  for (const entity of race.entities) {
    if (entity.kind !== 'box' || entity.cooldown > 0) continue;
    let boxes = columns.get(entity.columnKey);
    if (!boxes) {
      boxes = [];
      columns.set(entity.columnKey, boxes);
    }
    boxes.push(entity);
  }

  const pairs = [];
  for (const [columnKey, boxes] of columns) {
    boxes.sort((a, b) => a.tier - b.tier);
    const anchor = boxes[0];
    race.karts.forEach((kart, kartIndex) => {
      if (kart.finished || !openSlot(kart.slots)) return;
      const gap = Math.hypot(kart.x - anchor.x, kart.z - anchor.z);
      if (gap > BOX_RADIUS) return;
      pairs.push({ gap, columnKey, boxes, kart, kartIndex });
    });
  }

  pairs.sort((a, b) => (
    a.gap - b.gap
    || columnRank(a.columnKey) - columnRank(b.columnKey)
    || a.kartIndex - b.kartIndex
  ));

  const kartTaken = new Set();
  const columnTaken = new Set();
  for (const pair of pairs) {
    if (kartTaken.has(pair.kart.playerId) || columnTaken.has(pair.columnKey)) continue;
    kartTaken.add(pair.kart.playerId);
    columnTaken.add(pair.columnKey);
    for (const box of pair.boxes) {
      const name = openSlot(pair.kart.slots);
      if (!name) break;
      pair.kart.slots[name] = { id: rollItem(race.rng), readyAt: timeMs + ROULETTE_MS };
      box.cooldown = BOX_COOLDOWN;
    }
  }
}

function collide(race, kartRadius, retired) {
  const live = race.karts.filter((kart) => !kart.finished);
  collideBoxes(race);

  for (const entity of race.entities) {
    if (retired.has(entity.id)) continue;
    if (entity.kind !== 'banana' && entity.kind !== 'shell') continue;
    const def = ITEMS[entity.itemId];
    const targets = live.filter((kart) => !(entity.arm > 0 && kart.playerId === entity.ownerId));
    const kart = nearestKart(targets, entity, HIT_RADIUS);
    if (!kart) continue;
    grant(kart, def.hit, MODIFIERS[def.hit].duration);
    retired.add(entity.id);
  }

  const nextPairs = new Set();
  const reach = kartRadius * 2;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (dist(a, b) >= reach) continue;
      const key = pairKey(a, b);
      nextPairs.add(key);
      if (race._touchPairs.has(key)) continue;
      const aSafe = controlOf(a).blocksHarm;
      const bSafe = controlOf(b).blocksHarm;
      if (aSafe && !bSafe) grant(b, 'spin', MODIFIERS.spin.duration);
      if (bSafe && !aSafe) grant(a, 'spin', MODIFIERS.spin.duration);
    }
  }
  race._touchPairs = nextPairs;
}

// Renders the item system from race state: boxes, shard bursts, banana/shell entities, sparks and puffs.
// Reads race.boxes / race.entities each frame and race.events by `seq`; never mutates race.
import * as THREE from 'three';
import { createItemModel, disposeItemModels } from './itemModels.js';
import { SHELL_RADIUS } from '../shells.js';

// ── Tunables ─────────────────────────────────────────────────────────────────

const BOX_SPIN = (Math.PI * 2) / 3; // rad/s, one rev per 3 s
const BOX_BOB = 0.15; // m
const BOX_BOB_HZ = 0.6;
const STACK_LIFT = 1.4; // m, 1.3 box + 0.1 gap
const POP_TIME = 0.35; // s, respawn scale-in
const POP_OVERSHOOT = 1.9; // easeOutBack c1, ~12% overshoot
const SHARD_COUNT = 10;
const SHARD_LIFE = 0.6;
const SHARD_GRAVITY = 14;
const SHARD_INHERIT = 0.3; // share of the kart's velocity
const FLASH_LIFE = 0.15;
const SHELL_SPIN = Math.PI * 2 * 3; // rad/s
const SQUASH_TIME = 0.2;
const SQUASH_MIN = 0.6;
const TRAIL_STEP = 0.5; // m between red-shell trail puffs

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
export function easeOutBack(t, c1 = POP_OVERSHOOT) {
  const x = clamp01(t) - 1;
  return 1 + (c1 + 1) * x ** 3 + c1 * x * x;
}
const hash = (i, k) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Banana landing squash: scaleY 0.6 -> 1 over SQUASH_TIME, width bulges the other way.
export function squashScale(t) {
  const y = SQUASH_MIN + (1 - SQUASH_MIN) * easeOutCubic(t / SQUASH_TIME);
  return { y, xz: 1 + (1 - y) * 0.5 };
}

// Velocity and spin of shard i of n; kart velocity is inherited at SHARD_INHERIT.
export function shardSpawn(i, n, kartVx = 0, kartVz = 0) {
  const a = (i / n) * Math.PI * 2 + (hash(i, 1) - 0.5) * 0.6;
  const out = 3 + hash(i, 2) * 2.5;
  return {
    vx: Math.cos(a) * out + kartVx * SHARD_INHERIT,
    vy: 3.5 + hash(i, 3) * 3,
    vz: Math.sin(a) * out + kartVz * SHARD_INHERIT,
    spin: [(hash(i, 4) - 0.5) * 16, (hash(i, 5) - 0.5) * 16, (hash(i, 6) - 0.5) * 16],
    size: 0.7 + hash(i, 7) * 0.8,
  };
}

// ── View ─────────────────────────────────────────────────────────────────────

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createItemsView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const glow = glowTexture();
  const shardGeo = new THREE.TetrahedronGeometry(0.25);
  const boxes = new Map(); // id -> { base, top, popBase, popTop, shown, topShown }
  const ents = new Map(); // id -> record
  const fx = [];
  let lastSeq = null;

  // ── Particles ──
  function addFx(p) {
    p.age = 0;
    p.vel ??= new THREE.Vector3();
    p.grav ??= 0;
    root.add(p.obj);
    fx.push(p);
    return p;
  }
  function spriteFx({ pos, color, additive = true, s0, s1, life, vel, grav, opacity = 1 }) {
    const mat = new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity });
    const obj = new THREE.Sprite(mat);
    obj.position.copy(pos);
    obj.renderOrder = 5;
    return addFx({ obj, mat, s0, s1, life, vel, grav, a0: opacity });
  }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) {
        root.remove(p.obj);
        p.mat.dispose();
        fx.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.scale.setScalar(p.s0 + (p.s1 - p.s0) * u);
      if (p.spin) p.obj.rotation.set(p.spin[0] * p.age, p.spin[1] * p.age, p.spin[2] * p.age);
      p.mat.opacity = p.a0 * (1 - u);
    }
  }

  // ── Events ──
  function onBoxBreak(ev, race) {
    const pos = new THREE.Vector3(ev.x, ev.y, ev.z);
    const kart = race.karts.find((k) => k.id === ev.kartId);
    for (let i = 0; i < SHARD_COUNT; i++) {
      const sp = shardSpawn(i, SHARD_COUNT, kart?.vx, kart?.vz);
      const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xe8fff0 : 0x9fe8a8, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
      const obj = new THREE.Mesh(shardGeo, mat);
      obj.position.copy(pos);
      addFx({ obj, mat, vel: new THREE.Vector3(sp.vx, sp.vy, sp.vz), grav: SHARD_GRAVITY, spin: sp.spin, s0: sp.size, s1: sp.size * 0.6, life: SHARD_LIFE, a0: 0.7 });
    }
    spriteFx({ pos, color: 0xffffff, s0: 1.5, s1: 3.6, life: FLASH_LIFE });
  }
  function onBounce(ev) {
    const pos = new THREE.Vector3(ev.x, ev.y + 0.2, ev.z);
    for (let i = 0; i < 7; i++) {
      const a = hash(i, 11) * Math.PI * 2;
      const out = 2 + hash(i, 12) * 4;
      spriteFx({ pos, color: 0xffe9a0, s0: 0.35, s1: 0.1, life: 0.3, vel: new THREE.Vector3(Math.cos(a) * out, 2 + hash(i, 13) * 3, Math.sin(a) * out), grav: 14 });
    }
  }
  function onEntityBreak(ev) {
    const pos = new THREE.Vector3(ev.x, ev.y + 0.3, ev.z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + hash(i, 21);
      spriteFx({ pos, color: 0xe8e8e0, additive: false, s0: 0.5, s1: 1.7, life: 0.5, opacity: 0.8, vel: new THREE.Vector3(Math.cos(a) * 1.8, 1 + hash(i, 22), Math.sin(a) * 1.8) });
    }
    spriteFx({ pos, color: 0xffffff, s0: 0.8, s1: 2.4, life: 0.15 });
  }
  function consumeEvents(race) {
    if (lastSeq === null) lastSeq = race.eventSeq; // a view made mid-race skips the backlog
    for (const ev of race.events) {
      if (ev.seq <= lastSeq) continue;
      lastSeq = ev.seq;
      if (ev.type === 'box_break') onBoxBreak(ev, race);
      else if (ev.type === 'bounce') onBounce(ev);
      else if (ev.type === 'entity_break') onEntityBreak(ev);
    }
  }

  // ── Boxes ──
  function boxRecord(b) {
    const base = createItemModel('box');
    const top = createItemModel('box');
    root.add(base, top);
    return { base, top, popBase: 1, popTop: 1, shown: b.ready, topShown: b.ready && b.stacked };
  }
  function updateBoxes(race, dt, time) {
    const spin = time * BOX_SPIN;
    const bob = Math.sin(time * Math.PI * 2 * BOX_BOB_HZ) * BOX_BOB;
    for (const b of race.boxes) {
      const r = boxes.get(b.id) ?? boxes.set(b.id, boxRecord(b)).get(b.id);
      const topShown = b.ready && b.stacked;
      if (b.ready && !r.shown) r.popBase = 0;
      if (topShown && !r.topShown) r.popTop = 0;
      r.shown = b.ready;
      r.topShown = topShown;
      r.popBase += dt / POP_TIME;
      r.popTop += dt / POP_TIME;
      r.base.visible = b.ready;
      r.top.visible = topShown;
      r.base.position.set(b.x, b.y + bob, b.z);
      r.top.position.set(b.x, b.y + bob + STACK_LIFT, b.z);
      r.base.rotation.y = r.top.rotation.y = spin;
      r.base.scale.setScalar(Math.max(0.001, easeOutBack(r.popBase)));
      r.top.scale.setScalar(Math.max(0.001, easeOutBack(r.popTop)));
    }
  }

  // ── Entities ──
  function entityRecord(e) {
    const wrap = new THREE.Group();
    const model = createItemModel(e.kind);
    wrap.add(model);
    const rec = { wrap, model, state: e.state, squashT: 1, lastTrail: null, phase: hash(e.id.length + e.x, 31) * 6, glow: null };
    if (e.kind === 'red') {
      const mat = new THREE.SpriteMaterial({ map: glow, color: 0xff3a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
      rec.glow = new THREE.Sprite(mat);
      rec.glow.position.y = SHELL_RADIUS;
      rec.glow.renderOrder = 5;
      wrap.add(rec.glow);
    }
    root.add(wrap);
    return rec;
  }
  function updateEntities(race, dt, time) {
    const live = new Set();
    for (const e of race.entities) {
      live.add(e.id);
      const rec = ents.get(e.id) ?? ents.set(e.id, entityRecord(e)).get(e.id);
      if (e.kind === 'banana') {
        rec.wrap.position.set(e.x, e.y, e.z);
        if (rec.state === 'air' && e.state === 'ground') rec.squashT = 0;
        rec.squashT += dt;
        const sq = squashScale(rec.squashT);
        rec.wrap.scale.set(sq.xz, sq.y, sq.xz);
        if (e.state === 'air') rec.model.rotation.set(0, time * 8 + rec.phase, 0);
        else rec.model.rotation.set(0, rec.phase, Math.sin(time * 7 + rec.phase) * 0.08);
      } else {
        rec.wrap.position.set(e.x, e.y - SHELL_RADIUS, e.z); // shell models sit on their bottom, entity y is the centre
        rec.model.rotation.y = e.age * SHELL_SPIN;
        if (rec.glow) {
          const pulse = 1.9 + Math.sin(time * 18) * 0.25;
          rec.glow.scale.setScalar(pulse);
          const here = new THREE.Vector3(e.x, e.y, e.z);
          if (!rec.lastTrail || here.distanceTo(rec.lastTrail) > TRAIL_STEP) {
            if (rec.lastTrail) spriteFx({ pos: rec.lastTrail, color: 0xff4a20, s0: 1.2, s1: 0.3, life: 0.35, opacity: 0.7 });
            rec.lastTrail = here;
          }
        }
      }
      rec.state = e.state;
    }
    for (const [id, rec] of ents) {
      if (live.has(id)) continue;
      root.remove(rec.wrap);
      rec.glow?.material.dispose();
      ents.delete(id);
    }
  }

  function update(race, dt, time) {
    dt = Math.max(0, dt); // a first frame can arrive with a negative dt
    consumeEvents(race);
    updateBoxes(race, dt, time);
    updateEntities(race, dt, time);
    stepFx(dt);
  }

  function dispose() {
    for (const p of fx) p.mat.dispose();
    for (const rec of ents.values()) rec.glow?.material.dispose();
    fx.length = 0;
    ents.clear();
    boxes.clear();
    scene.remove(root);
    shardGeo.dispose();
    glow.dispose();
    disposeItemModels();
  }

  return { update, dispose };
}

// Drift charge sparks: additive textured sprites under and beside both rear wheels.
// Each wheel owns a fixed pool (ground glow, hot flash, jagged arcs, short streaks); a level picks how much of it
// shows and how big, bright and fast it is. Arcs re-roll a few times a second, streaks fly back and outward.
// Contract: lives inside the kart's body group, which faces local +x and sits on y = 0.
import * as THREE from 'three';
import { canvasTex } from './textures.js';

// Level colors (0 = faint warm white). Shared with the boost flames in kartMesh.js.
export const LEVEL_COLORS = [0xfff4d6, 0x2f8cff, 0xff8a1f, 0xc040ff];
const HALO = LEVEL_COLORS.map((c) => new THREE.Color(c));
const CORE = LEVEL_COLORS.map((c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.75));

// ── Tunables, indexed by drift level 0..3 ────────────────────────────────────
const GLOW_SIZE = [1.0, 1.5, 2.1, 2.8];
const GLOW_OP = [0.3, 0.55, 0.78, 1];
const FLASH_SIZE = [0.28, 0.42, 0.6, 0.85];
const ARCS = [1, 2, 3, 4];
const ARC_LEN = [0.55, 0.85, 1.2, 1.55];
const ARC_OP = [0.5, 0.75, 0.9, 1];
const STREAKS = [2, 3, 5, 7];
const STREAK_LEN = [0.3, 0.5, 0.8, 1.2];
const STREAK_W = [0.05, 0.07, 0.09, 0.12];
const STREAK_SPEED = [2.5, 3.5, 5, 7];
const ARC_POOL = 4;
const STREAK_POOL = 7;
const WHEELS = [[-0.9, 1.02], [-0.9, -1.02]]; // x, z of the ground point just outside each rear tire

// ── Textures, drawn once ─────────────────────────────────────────────────────

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function glowTex() {
  return canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// Jagged bolt from the left edge (the root at the wheel) to the right, with a forked twig.
function boltPath(w, h) {
  const pts = [[w * 0.04, h / 2]];
  const n = 12;
  for (let i = 1; i <= n; i++) pts.push([w * (0.04 + (0.9 * i) / n), h / 2 + (rnd() - 0.5) * h * 0.4]);
  const f = pts[5];
  return { pts, twig: [f, [f[0] + w * 0.16, f[1] + (rnd() < 0.5 ? -1 : 1) * h * 0.3], [f[0] + w * 0.28, f[1] + (rnd() - 0.5) * h * 0.5]] };
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// Two textures per bolt shape: a wide soft halo (tinted by the level color) and a thin white core (barely tinted).
function arcTextures() {
  const halos = [];
  const cores = [];
  for (let i = 0; i < 3; i++) {
    const bolt = boltPath(256, 128);
    const draw = (widths) => (ctx) => {
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.shadowColor = '#fff';
      for (const [lw, a, blur, twigScale] of widths) {
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.shadowBlur = blur;
        ctx.lineWidth = lw;
        strokePath(ctx, bolt.pts);
        ctx.lineWidth = lw * twigScale;
        strokePath(ctx, bolt.twig);
      }
    };
    halos.push(canvasTex(256, 128, draw([[16, 0.3, 16, 0.6], [7, 0.6, 8, 0.6]])));
    cores.push(canvasTex(256, 128, draw([[3.2, 1, 3, 0.5]])));
  }
  return { halos, cores };
}

// Streak: bright head on the right fading to a transparent tail.
function streakTex() {
  return canvasTex(128, 16, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

let tex;
const textures = () => (tex ??= { glow: glowTex(), streak: streakTex(), ...arcTextures() });

// ── Sprites ──────────────────────────────────────────────────────────────────

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

// Runs just before each draw, so every camera (split screen) gets the angle that points the sprite's +x
// along its world direction on that screen. Sprites only rotate in screen space, so this has to know the camera.
function aimAtCamera(renderer, scene, camera) {
  const d = this.userData;
  if (!d.aim) return;
  _a.setFromMatrixPosition(this.matrixWorld);
  _c.set(d.dx, d.dy, d.dz).transformDirection(this.parent.matrixWorld);
  _b.copy(_a).add(_c).project(camera);
  _a.project(camera);
  this.material.rotation = Math.atan2(_b.y - _a.y, (_b.x - _a.x) * camera.aspect) + d.jitter;
}

function makeSprite(map, renderOrder, depthTest = true) {
  const mat = new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest, fog: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.renderOrder = renderOrder;
  s.visible = false;
  s.userData = { aim: false, dx: 0, dy: 0, dz: 0, jitter: 0 };
  s.onBeforeRender = aimAtCamera;
  return s;
}

// A random direction in the kart's local frame: back and outward on this wheel's side.
function pickDir(d, side) {
  const phi = 0.25 + rnd() * 1.15; // 0 = straight back, pi/2 = straight out
  d.dx = -Math.cos(phi);
  d.dz = Math.sin(phi) * side;
  d.dy = 0.05 + rnd() * 0.25;
}

function buildWheel(group, [wx, wz]) {
  const t = textures();
  const side = Math.sign(wz);
  const glow = makeSprite(t.glow, 3, false); // no depth test: a billboard through the road would show a hard cut
  const flash = makeSprite(t.glow, 5);
  group.add(glow, flash);
  const arcs = [];
  for (let i = 0; i < ARC_POOL; i++) {
    const halo = makeSprite(t.halos[0], 4);
    const core = makeSprite(t.cores[0], 5);
    group.add(halo, core);
    arcs.push({ halo, core, t: rnd() * 0.08 });
  }
  const streaks = [];
  for (let i = 0; i < STREAK_POOL; i++) {
    const sprite = makeSprite(t.streak, 4);
    group.add(sprite);
    streaks.push({ sprite, age: 0, life: 0, speed: 0 });
  }
  return { wx, wz, side, glow, flash, arcs, streaks };
}

function updateWheel(w, level, dt) {
  const halo = HALO[level];
  const core = CORE[level];

  w.glow.visible = true;
  w.glow.material.color.copy(halo);
  const gs = GLOW_SIZE[level] * (0.88 + Math.random() * 0.24);
  w.glow.scale.set(gs, gs * 0.8, 1);
  w.glow.position.set(w.wx - 0.1, 0.2 + gs * 0.12, w.wz);
  w.glow.material.opacity = GLOW_OP[level] * (0.75 + Math.random() * 0.25);

  w.flash.visible = true;
  w.flash.material.color.copy(core);
  const fs = FLASH_SIZE[level] * (0.8 + Math.random() * 0.4);
  w.flash.scale.set(fs, fs, 1);
  w.flash.position.set(w.wx - 0.05, 0.14, w.wz);
  w.flash.material.opacity = 0.9;

  for (let i = 0; i < ARC_POOL; i++) {
    const arc = w.arcs[i];
    const on = i < ARCS[level];
    arc.halo.visible = arc.core.visible = on;
    if (!on) continue;
    arc.t -= dt;
    const d = arc.halo.userData;
    if (arc.t <= 0) {
      // New bolt: another shape, direction, length and root offset, held for 40 to 100 ms.
      const k = Math.floor(Math.random() * 3);
      arc.halo.material.map = textures().halos[k];
      arc.core.material.map = textures().cores[k];
      pickDir(d, w.side);
      d.jitter = (Math.random() - 0.5) * 0.5;
      arc.len = ARC_LEN[level] * (0.7 + Math.random() * 0.6);
      arc.ox = (Math.random() - 0.5) * 0.3;
      arc.t = 0.04 + Math.random() * 0.06;
      Object.assign(arc.core.userData, { dx: d.dx, dy: d.dy, dz: d.dz, jitter: d.jitter });
    }
    arc.halo.userData.aim = arc.core.userData.aim = true;
    const len = arc.len;
    arc.halo.scale.set(len, len * 0.5, 1);
    arc.core.scale.set(len, len * 0.5, 1);
    // The sprite's center sits half a length out along the bolt so its root touches the wheel.
    const px = w.wx + arc.ox + d.dx * len * 0.5;
    const py = 0.28 + d.dy * len * 0.5;
    const pz = w.wz + d.dz * len * 0.5;
    arc.halo.position.set(px, py, pz);
    arc.core.position.set(px, py, pz);
    arc.halo.material.color.copy(halo);
    arc.core.material.color.copy(core);
    const o = ARC_OP[level] * (0.7 + Math.random() * 0.3);
    arc.halo.material.opacity = o;
    arc.core.material.opacity = Math.min(1, o + 0.15);
  }

  for (let i = 0; i < STREAK_POOL; i++) {
    const s = w.streaks[i];
    const sp = s.sprite;
    if (i >= STREAKS[level]) {
      sp.visible = false;
      continue;
    }
    s.age += dt;
    const d = sp.userData;
    if (s.age >= s.life) {
      pickDir(d, w.side);
      d.aim = true;
      d.jitter = 0;
      s.age = s.life > 0 ? 0 : Math.random() * 0.15; // first spawn is staggered
      s.life = 0.14 + Math.random() * 0.16;
      s.speed = STREAK_SPEED[level] * (0.6 + Math.random() * 0.6);
    }
    const f = s.age / s.life;
    const run = s.speed * s.age;
    sp.visible = true;
    sp.position.set(w.wx + d.dx * run, 0.16 + d.dy * run, w.wz + d.dz * run);
    sp.scale.set(STREAK_LEN[level] * (1 - 0.5 * f), STREAK_W[level], 1);
    sp.material.color.copy(f < 0.35 ? core : halo);
    sp.material.opacity = (1 - f) * (level === 0 ? 0.6 : 1);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function createDriftSparks() {
  const group = new THREE.Group();
  group.visible = false;
  const wheels = WHEELS.map((p) => buildWheel(group, p));
  return { group, wheels };
}

// drift = kart.drift; hidden unless sliding.
export function updateDriftSparks(rig, drift, dt) {
  rig.group.visible = drift.sliding;
  if (!drift.sliding) return;
  const level = Math.max(0, Math.min(3, drift.level | 0));
  for (const w of rig.wheels) updateWheel(w, level, dt);
}

// Drift charge sparks: additive textured sprites under and beside both rear wheels.
// Each wheel owns a fixed pool (ground glow, hot flash, jagged arcs, short streaks); a level picks how much of it
// shows and how big, bright and fast it is. Arcs re-roll a few times a second, streaks are thrown back and outward
// and fall under gravity with a small bounce.
// Contract: lives inside the kart's body group, which faces local +x and sits on y = 0.
import * as THREE from 'three';
import { canvasTex } from './textures.js';

// Level colors (0 = faint warm white). Shared with the boost flames in kartMesh.js.
export const LEVEL_COLORS = [0xfff4d6, 0x2f8cff, 0xff8a1f, 0xc040ff];
const HALO = LEVEL_COLORS.map((c) => new THREE.Color(c));
const CORE = LEVEL_COLORS.map((c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.75));
const CSS = LEVEL_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

// ── Tunables, indexed by drift level 0..3 ────────────────────────────────────
const GLOW_SIZE = [1.0, 1.5, 2.0, 2.4];
const GLOW_OP = [0.3, 0.5, 0.62, 0.7];
const FLASH_SIZE = [0.28, 0.42, 0.6, 0.85];
const ARCS = [1, 2, 3, 4];
const ARC_LEN = [0.55, 0.85, 1.2, 1.55];
const ARC_OP = [0.5, 0.75, 0.9, 1];
const STREAKS = [1, 2, 3, 4];
const STREAK_LEN = [0.3, 0.5, 0.8, 1.2];
const STREAK_W = [0.05, 0.07, 0.09, 0.12];
const STREAK_SPEED = [2.5, 3.5, 5, 7];
const GRAVITY = 9;
const STREAK_FLOOR = 0.07; // streaks bounce off this height, keeping their sprite above the road
const ARC_POOL = 4;
const STREAK_POOL = 4;
const FLICKER_HZ = [47, 31]; // glow flicker, driven by accumulated time
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

// One texture per bolt shape and level: a wide soft halo in the level color around a thin white-hot core.
function arcTextures() {
  const bolts = [0, 1, 2].map(() => boltPath(256, 128));
  return CSS.map((css) => bolts.map((bolt) => canvasTex(256, 128, (ctx) => {
    ctx.lineCap = ctx.lineJoin = 'round';
    // [line width, alpha, blur, twig scale, color]
    for (const [lw, a, blur, twigScale, color] of [[16, 0.3, 16, 0.6, css], [7, 0.6, 8, 0.6, css], [3.2, 1, 3, 0.5, '#fff']]) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = a;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.lineWidth = lw;
      strokePath(ctx, bolt.pts);
      ctx.lineWidth = lw * twigScale;
      strokePath(ctx, bolt.twig);
    }
  })));
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
const textures = () => (tex ??= { glow: glowTex(), streak: streakTex(), arcs: arcTextures() });

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
    const bolt = makeSprite(t.arcs[0][0], 4, false); // no depth test: a tall billboard through the road would show a hard cut
    group.add(bolt);
    arcs.push({ bolt, t: rnd() * 0.08, len: 0, ox: 0, flick: 1 });
  }
  const streaks = [];
  for (let i = 0; i < STREAK_POOL; i++) {
    const sprite = makeSprite(t.streak, 4);
    group.add(sprite);
    streaks.push({ sprite, age: 0, life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0 });
  }
  return { wx, wz, side, glow, flash, arcs, streaks, clock: rnd() * 10 };
}

// Throws a streak from the wheel: back and outward fast, a little up, then gravity takes it.
function launchStreak(s, w, level) {
  const speed = STREAK_SPEED[level] * (0.6 + Math.random() * 0.6);
  s.x = w.wx + (Math.random() - 0.5) * 0.4;
  s.y = 0.1;
  s.z = w.wz + w.side * (Math.random() * 0.3 - 0.2);
  s.vx = -(0.35 + Math.random() * 0.65) * speed;
  s.vy = (0.25 + Math.random() * 0.65) * speed * 0.45;
  s.vz = w.side * (0.2 + Math.random() * 0.8) * speed * 0.7;
  s.life = 0.22 + Math.random() * 0.2;
}

function updateWheel(w, level, dt) {
  const halo = HALO[level];
  const core = CORE[level];
  w.clock += dt;
  const flick = 0.5 + 0.5 * Math.sin(w.clock * FLICKER_HZ[0]) * Math.sin(w.clock * FLICKER_HZ[1] + 1); // 0..1

  w.glow.visible = true;
  w.glow.material.color.copy(halo);
  const gs = GLOW_SIZE[level] * (0.9 + 0.1 * flick);
  w.glow.scale.set(gs, gs * 0.8, 1);
  w.glow.position.set(w.wx - 0.1, 0.2 + gs * 0.12, w.wz);
  w.glow.material.opacity = GLOW_OP[level] * (0.75 + 0.25 * flick);

  w.flash.visible = true;
  w.flash.material.color.copy(core);
  const fs = FLASH_SIZE[level] * (0.85 + 0.3 * flick);
  w.flash.scale.set(fs, fs, 1);
  w.flash.position.set(w.wx - 0.05, 0.04 + fs * 0.5, w.wz); // bottom edge stays on the road
  w.flash.material.opacity = 0.9;

  for (let i = 0; i < ARC_POOL; i++) {
    const arc = w.arcs[i];
    const on = i < ARCS[level];
    arc.bolt.visible = on;
    if (!on) continue;
    arc.t -= dt;
    const d = arc.bolt.userData;
    if (arc.t <= 0) {
      // New bolt: another shape, direction, length and root offset, held for 40 to 100 ms.
      pickDir(d, w.side);
      d.jitter = (Math.random() - 0.5) * 0.5;
      arc.shape = Math.floor(Math.random() * 3);
      arc.len = ARC_LEN[level] * (0.7 + Math.random() * 0.6);
      arc.ox = (Math.random() - 0.5) * 0.3;
      arc.flick = 0.7 + Math.random() * 0.3;
      arc.t = 0.04 + Math.random() * 0.06;
    }
    arc.bolt.material.map = textures().arcs[level][arc.shape ?? 0];
    d.aim = true;
    const len = arc.len || ARC_LEN[level];
    arc.bolt.scale.set(len, len * 0.5, 1);
    // The sprite's center sits half a length out along the bolt so its root touches the wheel.
    arc.bolt.position.set(w.wx + arc.ox + d.dx * len * 0.5, 0.28 + d.dy * len * 0.5, w.wz + d.dz * len * 0.5);
    arc.bolt.material.opacity = ARC_OP[level] * arc.flick;
  }

  for (let i = 0; i < STREAK_POOL; i++) {
    const s = w.streaks[i];
    const sp = s.sprite;
    if (i >= STREAKS[level]) {
      sp.visible = false;
      s.life = 0;
      continue;
    }
    if (s.age >= s.life) {
      const first = s.life === 0;
      launchStreak(s, w, level);
      s.age = first ? Math.random() * 0.15 : 0; // first spawn is staggered
    }
    s.age += dt;
    s.vy -= GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.y < STREAK_FLOOR) {
      s.y = STREAK_FLOOR;
      s.vy *= -0.3;
    }
    const f = Math.min(1, s.age / s.life);
    const len = STREAK_LEN[level] * (1 - 0.5 * f);
    const d = sp.userData;
    const sp3 = Math.hypot(s.vx, s.vy, s.vz) || 1;
    d.dx = s.vx / sp3;
    d.dy = s.vy / sp3;
    d.dz = s.vz / sp3;
    d.aim = true;
    sp.visible = true;
    // The head leads the sprite, so the center trails it by half a length.
    sp.position.set(s.x - d.dx * len * 0.5, s.y - d.dy * len * 0.5, s.z - d.dz * len * 0.5);
    sp.scale.set(len, STREAK_W[level], 1);
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

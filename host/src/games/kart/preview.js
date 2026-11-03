// Dev preview for the kart scene: no relay, 4 karts on the grid.
//   /kart-preview.html                 drive kart 0 with arrows / WASD, others idle on the grid
//   /kart-preview.html?shot=<name>     fixed debug camera (see shots.js); karts are placed around the shot
//   /kart-preview.html?ai=1            karts 1-3 drive themselves
//   /kart-preview.html?views=N         split screen with one view per kart, N = 1..4
//   /kart-preview.html?drift=L&dir=D   kart 0 frozen mid-drift at charge level L (0..3), direction D (1 or -1)
//   /kart-preview.html?boost=L         kart 0 frozen mid-boost at boost level L (1..3)
//   /kart-preview.html?item=green&reserve=banana   kart 0 starts holding items (mushroom|banana|green|red)
//   /kart-preview.html?items=1         a banana, a green and a red shell sit near the item row at start+80 (pair with shot=itemRow)
//   /kart-preview.html?items=1&break=1 also breaks box b0_1 ~0.3 s after load, for a shard-burst frame
//   /kart-preview.html?hit=spin|tumble&t=0..1   kart 0 frozen at that point of its hit (pair with shot=hitSide)
//   /kart-preview.html?seed=N          item RNG seed
//   Keys: arrows / WASD steer, Up / Down aim, E / Enter uses an item, Space / Shift drifts.
import { buildTrack } from './track.js';
import { createRace, stepRace } from './race.js';
import { pushEvent } from './items.js';
import { createKartScene } from './scene/createKartScene.js';
import { SHOTS } from './shots.js';
import { autopilotInput } from './autopilot.js';
import { splitLayout } from './hud.js';

const params = new URLSearchParams(location.search);
const track = buildTrack();
const entrants = [
  { id: 'p1', name: 'Red', color: 0xe8423a },
  { id: 'p2', name: 'Blue', color: 0x3a7be8 },
  { id: 'p3', name: 'Yellow', color: 0xf2c230 },
  { id: 'p4', name: 'Green', color: 0x3fb55a },
];

const race = createRace(track, entrants, { seed: Number(params.get('seed')) || 1 });
window.__race = race; // dev-only: lets screenshot tooling read race state
const container = document.getElementById('app');
const scene = createKartScene(container, track);
scene.setKarts(entrants);
scene.setViews(splitLayout(Number(params.get('views')) || 1).views.map((v) => ({ id: entrants[v.slot].id, x: v.x, y: v.y, w: v.w, h: v.h })));
window.addEventListener('resize', () => scene.resize());

// Park the karts around a shot's target so the camera has something to frame.
function placeKartsForShot(name) {
  const shot = SHOTS[name];
  if (!shot || name === 'grid' || name === 'overview') return;
  race.karts.forEach((k, i) => {
    const s = track.wrapS(shot.s + shot.lookAhead * 0.35 + (i >> 1) * 7);
    const lateral = i & 1 ? 3.5 : -3.5;
    const fr = track.frameAt(s);
    Object.assign(k, { s, lateral, x: fr.x + fr.rx * lateral, z: fr.z + fr.rz * lateral, y: track.heightAt(s, lateral), h: fr.h, speed: 0, vx: 0, vz: 0 });
  });
}

// Freeze kart p1 mid-drift (?drift=0..3, &dir=-1|1) or mid-boost (?boost=1..3) on the start
// straight, for comparing the drift effects. Pair with &shot=driftRear or driftQuarter for a close camera.
const pose = params.has('drift') ? 'drift' : params.has('boost') ? 'boost' : params.has('hit') ? 'hit' : null;

function setShot(name) {
  scene.setShot(name || null);
  if (name && !pose && !params.get('items')) placeKartsForShot(name); // item shots keep the karts on the grid, out of frame
}
window.__kartShot = setShot;
setShot(params.get('shot'));

if (pose) {
  const level = pose === 'hit' ? 0 : Number(params.get(pose)) || 0;
  const dir = Number(params.get('dir')) === -1 ? -1 : 1;
  const k = race.karts[0];
  const s = 60;
  const fr = track.frameAt(s);
  Object.assign(k, { s, lateral: 0, x: fr.x, z: fr.z, y: track.heightAt(s, 0), h: fr.h, speed: 18, vx: fr.fx * 18, vz: fr.fz * 18 });
  if (pose === 'drift') {
    k.drift = { sliding: true, dir, charge: level === 0 ? 0.5 : level + 0.5, level };
    k.steerVis = dir;
  } else if (pose === 'hit') {
    const kind = params.get('hit') === 'tumble' ? 'tumble' : 'spin';
    const total = kind === 'spin' ? 1.2 : 1.4;
    const t = Math.min(1, Math.max(0, Number(params.get('t')) || 0));
    k.hit = { kind, t: total * (1 - t), total };
  } else {
    k.boost = 1;
    k.boostLevel = level;
  }
}

// Drop one of each entity beside the first item row so a still shot can see them.
if (params.get('items')) {
  const row = track.itemRows[0].s;
  const at = (kind, ds, lateral) => {
    const fr = track.frameAt(row + ds);
    const y = track.heightAt(row + ds, lateral) + (kind === 'banana' ? 0 : 0.45);
    race.entities.push({ id: `e${race.entitySeq++}`, kind, owner: 'p2', x: fr.x + fr.rx * lateral, y, z: fr.z + fr.rz * lateral, vx: 0, vy: 0, vz: 0, s: row + ds, lateral, age: 0.4, state: kind === 'banana' ? 'ground' : 'moving', bounces: 0, target: null });
  };
  at('banana', 3, -3);
  at('green', 5, 1);
  at('red', 7, 4.5);
}
if (params.get('break')) {
  setTimeout(() => {
    const b = race.boxes.find((x) => x.id === 'b0_1');
    Object.assign(b, { ready: false, respawn: 1.5 });
    pushEvent(race, { type: 'box_break', boxId: b.id, kartId: 'p1', x: b.x, y: b.y, z: b.z });
  }, 300);
}

if (params.get('item')) Object.assign(race.karts[0].item, { main: params.get('item'), reserve: params.get('reserve') || null });

// ── Input ────────────────────────────────────────────────────────────────────

const keys = new Set();
let usePending = false;
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) usePending = true;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
const drive = () => ({
  steer: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0),
  aimY: (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0),
  drift: keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight'),
});

// ── Loop ─────────────────────────────────────────────────────────────────────

let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  const inputs = { p1: { ...drive(), useItem: usePending } };
  usePending = false;
  if (params.get('ai')) for (const k of race.karts.slice(1)) inputs[k.id] = autopilotInput(track, k);
  if (!params.get('shot') && !pose) stepRace(race, inputs, dt, track);
  scene.update(race, dt);
  if (++frames === 10) window.__kartReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

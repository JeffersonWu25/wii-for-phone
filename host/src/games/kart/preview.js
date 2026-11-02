// Dev preview for the kart scene: no relay, 4 karts on the grid.
//   /kart-preview.html                 drive kart 0 with arrows / WASD, others idle on the grid
//   /kart-preview.html?shot=<name>     fixed debug camera (see shots.js); karts are placed around the shot
//   /kart-preview.html?ai=1            karts 1-3 drive themselves
import { buildTrack } from './track.js';
import { createRace, stepRace } from './race.js';
import { createKartScene } from './scene/createKartScene.js';
import { SHOTS } from './shots.js';
import { autopilotInput } from './autopilot.js';

const params = new URLSearchParams(location.search);
const track = buildTrack();
const entrants = [
  { id: 'p1', name: 'Red', color: 0xe8423a },
  { id: 'p2', name: 'Blue', color: 0x3a7be8 },
  { id: 'p3', name: 'Yellow', color: 0xf2c230 },
  { id: 'p4', name: 'Green', color: 0x3fb55a },
];

const race = createRace(track, entrants);
const container = document.getElementById('app');
const scene = createKartScene(container, track);
scene.setKarts(entrants);
scene.setFollow('p1');
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

function setShot(name) {
  scene.setShot(name || null);
  if (name) placeKartsForShot(name);
}
window.__kartShot = setShot;
setShot(params.get('shot'));

// ── Input ────────────────────────────────────────────────────────────────────

const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
const drive = () => ({
  steer: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0),
  gas: keys.has('ArrowUp') || keys.has('KeyW'),
  brake: keys.has('ArrowDown') || keys.has('KeyS'),
});

// ── Loop ─────────────────────────────────────────────────────────────────────

let last = performance.now();
let frames = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const inputs = { p1: drive() };
  if (params.get('ai')) for (const k of race.karts.slice(1)) inputs[k.id] = autopilotInput(track, k);
  if (!params.get('shot')) stepRace(race, inputs, dt, track);
  scene.update(race, dt);
  if (++frames === 10) window.__kartReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

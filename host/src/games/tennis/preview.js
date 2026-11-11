import { createTennisScene } from './scene.js';

const BASE_Z = 11.185;

function player(id, name, side, role, x, z, color, extra = {}) {
  return {
    id,
    name,
    side,
    role,
    x,
    z,
    color,
    swinging: false,
    swingT: -1,
    speed: 0,
    travel: 0,
    hand: 'forehand',
    shape: null,
    struck: false,
    ...extra,
  };
}

function lineup(overrides = {}) {
  const base = {
    near: player('near', 'Ada', 'A', 'back', 0, -BASE_Z, '#2f9e44'),
    nearNet: player('nearNet', 'Bea', 'A', 'net', -2.4, -5.6, '#2f9e44'),
    farNet: player('farNet', 'Cal', 'B', 'net', 2.4, 5.6, '#f76707'),
    far: player('far', 'Dee', 'B', 'back', 0, BASE_Z, '#7048e8'),
  };
  for (const [id, extra] of Object.entries(overrides)) Object.assign(base[id], extra);
  return Object.values(base);
}

const score = { pointsA: '15', pointsB: '30', gamesA: 1, gamesB: 0 };

const contactSwing = { swinging: true, swingT: 0.42, struck: true, faceYaw: 0, facePitch: 0.12 };

// Each pose is a view the host would send; the scene reads the same fields it reads in a match.
const poses = {
  split: {
    phase: 'flight',
    serverId: 'near',
    ball: { x: -0.4, y: 1.6, z: 8.2 },
    players: lineup(),
  },
  forehand: {
    phase: 'flight',
    serverId: 'far',
    ball: { x: 0.52, y: 0.86, z: -BASE_Z + 0.72 },
    players: lineup({ near: { ...contactSwing, hand: 'forehand', shape: 'flat' } }),
  },
  backhand: {
    phase: 'flight',
    serverId: 'far',
    ball: { x: -0.5, y: 0.84, z: -BASE_Z + 0.7 },
    players: lineup({ near: { ...contactSwing, hand: 'backhand', shape: 'flat' } }),
  },
  serve: {
    phase: 'flight',
    serverId: 'near',
    ball: { x: 0.2, y: 2.4, z: -BASE_Z + 0.3 },
    players: lineup({ near: { swinging: true, swingT: 0.42, hand: 'forehand', shape: 'serve', faceYaw: 0, facePitch: -0.1 } }),
  },
  walk: {
    phase: 'flight',
    serverId: 'near',
    ball: { x: 1.4, y: 1.2, z: -3.2 },
    players: lineup({ near: { x: 0.5, z: -BASE_Z + 1.6, speed: 2.6, travel: 0.55 + 2.2 * 3 } }),
  },
};

const params = new URLSearchParams(location.search);
const poseName = poses[params.get('pose')] ? params.get('pose') : 'split';
const view = { ...poses[poseName], call: null, score };
const stage = Number(params.get('t'));
if (params.has('t') && Number.isFinite(stage)) {
  const near = view.players.find((p) => p.id === 'near');
  near.swinging = true;
  near.swingT = Math.min(1, Math.max(0, stage));
  near.struck = false;
}

const shots = {
  broadcast: { pos: [0, 8.5, -20.5], at: [0, 0.8, 1.5], fov: 38 },
  net: { pos: [9.5, 2.4, 0.2], at: [0, 0.9, 0], fov: 32 },
  wall: { pos: [0, 3.2, 4], at: [0, 2.4, 16], fov: 28 },
};

const container = document.getElementById('app');
const scene = createTennisScene(container);
if (shots[params.get('shot')]) scene.lookAt(shots[params.get('shot')]);
scene.setView(view);

function frame() {
  scene.resize();
  scene.render();
  const cam = scene.cameraInfo();
  container.dataset.pose = poseName;
  container.dataset.split = cam.split ? '1' : '0';
  container.dataset.camY = cam.y.toFixed(2);
  container.dataset.fov = String(cam.fov);
  container.dataset.ready = '1';
  requestAnimationFrame(frame);
}
frame();

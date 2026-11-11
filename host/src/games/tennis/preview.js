import { createTennisScene } from './scene.js';

const view = {
  phase: 'flight',
  ball: { x: -0.4, y: 1.6, z: 8.2 },
  call: null,
  score: { pointsA: '15', pointsB: '30', gamesA: 1, gamesB: 0 },
  players: [
    { id: 'near', name: 'Ada', side: 'A', role: 'back', x: 0, z: -11.185, color: '#2f9e44', swinging: false },
    { id: 'nearNet', name: 'Bea', side: 'A', role: 'net', x: -2.4, z: -5.6, color: '#2f9e44', swinging: false },
    { id: 'farNet', name: 'Cal', side: 'B', role: 'net', x: 2.4, z: 5.6, color: '#f76707', swinging: false },
    { id: 'far', name: 'Dee', side: 'B', role: 'back', x: -0.4, z: 11.185, color: '#7048e8', swinging: true },
  ],
};

const params = new URLSearchParams(location.search);
const shot = params.get('shot') || 'broadcast';
const shots = {
  broadcast: { pos: [0, 8.5, -20.5], at: [0, 0.8, 1.5], fov: 38 },
  net: { pos: [9.5, 2.4, 0.2], at: [0, 0.9, 0], fov: 32 },
  wall: { pos: [0, 3.2, 4], at: [0, 2.4, 16], fov: 28 },
};

const container = document.getElementById('app');
const scene = createTennisScene(container);
scene.lookAt(shots[shot] || shots.broadcast);
scene.setView(view);
function frame() {
  scene.resize();
  scene.render();
  container.dataset.ready = '1';
  requestAnimationFrame(frame);
}
frame();

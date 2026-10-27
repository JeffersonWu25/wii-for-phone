import { luigiCircuit } from './track.js';

// Add a map by createTrack(plan, opts) plus one row here.
export const TRACKS = [
  {
    id: 'luigi-circuit',
    name: 'Luigi Circuit',
    blurb: 'Wide asphalt, sand cuts, and dash panels on the final bank.',
    track: luigiCircuit,
  },
];

export function trackById(id) {
  return TRACKS.find((entry) => entry.id === id) || null;
}

const SAMPLES = 96;
const PAD = 10;

export function outlinePath(track) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const pose = track.poseAt(i / SAMPLES);
    pts.push([pose.x, pose.z]);
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const w = maxX - minX || 1;
  const h = maxZ - minZ || 1;
  const size = 100 - PAD * 2;
  const scale = size / Math.max(w, h);
  const ox = 50 - ((minX + maxX) / 2) * scale;
  const oz = 50 - ((minZ + maxZ) / 2) * scale;
  const project = (x, z) => [ox + x * scale, oz + z * scale];
  const d = pts.map((p, i) => {
    const [sx, sy] = project(p[0], p[1]);
    return `${i === 0 ? 'M' : 'L'}${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(' ') + ' Z';
  return { d, project };
}

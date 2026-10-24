import { poseAt } from './track.js';

const SAMPLES = 96;
const PAD = 10;

function trackPath() {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const pose = poseAt(i / SAMPLES);
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

const OUTLINE = trackPath();

export default function Minimap({ players }) {
  const markers = (players || []).map((player) => {
    const [cx, cy] = OUTLINE.project(player.x, player.z);
    return { ...player, cx, cy };
  });

  return (
    <div className="kart-minimap" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="kart-minimap-svg">
        <path
          d={OUTLINE.d}
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={OUTLINE.d}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="5.5"
          strokeLinejoin="round"
        />
        {markers.map((m) => (
          <g key={m.playerId} transform={`translate(${m.cx}, ${m.cy})`}>
            <circle r="3.6" fill="rgba(0,0,0,0.35)" />
            <circle r="3.1" fill={m.color} stroke="#fff" strokeWidth="0.9" />
          </g>
        ))}
      </svg>
    </div>
  );
}

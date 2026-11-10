// Sunny Meadow Circuit: a short two-column-grid loop with one hill and a banked 180° sweeper.
import { edge, grass } from '../track.js';

// The 140 m start straight is split at the line: 100 m ahead of it, 40 m of grid behind it (the last piece).
const pieces = [
  { tag: 'start', kind: 'straight', length: 100, width: 20, left: grass(16), right: grass(12) },
  { tag: 't1', kind: 'arc', turn: 'right', angle: 90, radius: 40, width: 16, left: edge(true, 'sand', 14, true), right: edge(true, 'grass', 10) },
  { tag: 'short', kind: 'straight', length: 30, width: 16, left: grass(), right: grass() },
  { tag: 'sLeft', kind: 'arc', turn: 'left', angle: 45, radius: 50, width: 16, left: edge(true, 'grass', 14), right: grass() },
  { tag: 'sRight', kind: 'arc', turn: 'right', angle: 45, radius: 50, width: 16, left: grass(), right: edge(true, 'grass', 12) },
  { tag: 'hill', kind: 'arc', turn: 'right', angle: 90, radius: 30, width: 16, left: grass(), right: edge(true, 'sand', 10) },
  { tag: 'back', kind: 'straight', length: 179.289322, width: 16, left: grass(), right: grass() },
  { tag: 'sweeper', kind: 'arc', turn: 'right', angle: 180, radius: 85.355339, width: 16, bank: 10, left: edge(true, 'sand', 12, true), right: edge(true, 'sand', 12) },
  { tag: 'grid', kind: 'straight', length: 40, width: 20, left: grass(16), right: grass(12) },
];

const ITEM_ROW_LATERALS = [-4.5, -1.5, 1.5, 4.5];

// Gentle rolling hills for distant scenery, 0..12 m.
function rollingHills(x, z) {
  const v = 0.6 * Math.sin(x / 70 + 1.3) * Math.cos(z / 85 + 0.4) + 0.4 * Math.sin((x + z) / 55 + 2);
  return 6 + 6 * v;
}
const smoothstep = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

export const sunnyMeadow = {
  id: 'sunny-meadow',
  name: 'Sunny Meadow',
  pieces,
  elevation: {
    points: [
      { piece: 'hill', at: 'start', h: 0 },
      { piece: 'hill', at: 'end', h: 5 },
      { piece: 'back', at: 70, h: 5 },
      { piece: 'back', at: 150, h: 0 },
    ],
  },
  boostPads: [
    { piece: 'back', at: 35, lateral: -3 },
    { piece: 'back', at: 115, lateral: 3 },
  ],
  itemRows: [
    { piece: 'start', at: 80 },
    { piece: 'back', at: 90 },
  ].map((r) => ({ ...r, laterals: ITEM_ROW_LATERALS })),
  // Data only for the ramp; nothing consumes it yet.
  ramps: [{ piece: 'back', at: 150, lateral: 0, length: 8, width: 6 }],
  grid: { cols: 2, colGap: 8, rowGap: 8 },
  terrain: (x, z, dist) => rollingHills(x, z) * smoothstep((dist - 120) / 60),
};

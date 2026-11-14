// Clover Meadows: a clockwise countryside loop in seven sections (see the overhead map in the design refs).
// Start straight at the farmhouse, up the left side through the wildflower S-curves, the windmill tunnel (with a longer bypass
// on the left of travel), the wide meadow field, the banked hillside switchbacks, the creek bridge and the cow road home.
// The loop closes analytically: `wildRise` (z) and `cowRun` (x) were solved so position and length meet; angles sum to 360°.
import { grass, hard } from '../track.js';

const road = (id, def) => ({ section: id, ...def });
const verge = (w = 10) => grass(w);

const pieces = [
  // 1 Farmhouse Straight: wide, flat, fast. The 40 m grid apron is the last piece of the lap (it belongs to the cow road).
  road('farmhouse', { tag: 'startStraight', kind: 'straight', length: 85, width: 26, left: verge(12), right: verge(12) }),
  road('farmhouse', { tag: 'farmBend', kind: 'arc', turn: 'right', angle: 90, radius: 50, width: 24, left: verge(12), right: verge(12) }),

  // 2 Wildflower S-Curves: climbing, dished road, two tight corners.
  road('wildflower', { tag: 'wildRise', kind: 'straight', length: 110.590982112, width: 20, dish: 0.6, left: verge(10), right: verge(10) }),
  road('wildflower', { tag: 'wf1', kind: 'arc', turn: 'right', angle: 45, radius: 80, width: 20, dish: 0.6, left: verge(10), right: verge(10) }),
  road('wildflower', { tag: 'wf2', kind: 'arc', turn: 'left', angle: 75, radius: 28, width: 20, dish: 0.6, left: verge(8), right: verge(10) }),
  road('wildflower', { tag: 'wfMid', kind: 'straight', length: 12, width: 20, dish: 0.6, left: verge(10), right: verge(10) }),
  road('wildflower', { tag: 'wf3', kind: 'arc', turn: 'right', angle: 120, radius: 28, width: 20, dish: 0.6, left: verge(10), right: verge(8) }),

  // 3 Windmill Tunnel: the main line runs straight through the windmill base (hard walls).
  road('windmill', { tag: 'windIn', kind: 'straight', length: 36, width: 20, left: verge(14), right: verge(14) }),
  road('windmill', { tag: 'tunnel', kind: 'straight', length: 50, width: 16, tunnel: true, left: hard(), right: hard() }),
  road('windmill', { tag: 'windOut', kind: 'straight', length: 36, width: 20, left: verge(14), right: verge(14) }),

  // 4 Meadow Obstacle Field: the widest road on the course.
  road('meadowfield', { tag: 'mf1', kind: 'straight', length: 25, width: 34, left: verge(14), right: verge(14) }),
  road('meadowfield', { tag: 'mf2', kind: 'arc', turn: 'left', angle: 20, radius: 90, width: 34, left: verge(14), right: verge(14) }),
  road('meadowfield', { tag: 'mf3', kind: 'arc', turn: 'right', angle: 20, radius: 90, width: 34, left: verge(14), right: verge(14) }),
  road('meadowfield', { tag: 'mf4', kind: 'straight', length: 100, width: 34, left: verge(14), right: verge(14) }),
  road('meadowfield', { tag: 'mf5', kind: 'arc', turn: 'right', angle: 90, radius: 55, width: 32, left: verge(14), right: verge(14) }),

  // 5 Hillside Switchbacks: downhill, three banked hairpins (bank is positive for right turns) joined by short straights.
  road('switchbacks', { tag: 'sbIn', kind: 'straight', length: 20, width: 20, left: verge(8), right: verge(8) }),
  road('switchbacks', { tag: 'sb0', kind: 'arc', turn: 'right', angle: 90, radius: 30, width: 20, left: hard(true), right: verge(8) }),
  road('switchbacks', { tag: 'sb1', kind: 'arc', turn: 'left', angle: 180, radius: 22, width: 20, bank: -12, left: verge(6), right: hard(true) }),
  road('switchbacks', { tag: 'sbA', kind: 'straight', length: 22, width: 20, left: verge(8), right: verge(8) }),
  road('switchbacks', { tag: 'sb2', kind: 'arc', turn: 'right', angle: 180, radius: 22, width: 20, bank: 12, left: hard(true), right: verge(6) }),
  road('switchbacks', { tag: 'sbB', kind: 'straight', length: 22, width: 20, left: verge(8), right: verge(8) }),
  road('switchbacks', { tag: 'sb3', kind: 'arc', turn: 'left', angle: 180, radius: 22, width: 20, bank: -12, left: verge(6), right: hard(true) }),

  // 6 Creek Crossing: gentle approach bend, then a narrow wooden bridge with hard walls.
  road('creek', { tag: 'creekIn', kind: 'straight', length: 15, width: 20, left: verge(8), right: verge(8) }),
  road('creek', { tag: 'creekBend', kind: 'arc', turn: 'right', angle: 180, radius: 38, width: 20, left: verge(10), right: verge(10) }),
  road('creek', { tag: 'creekApproach', kind: 'straight', length: 24, width: 20, left: verge(10), right: verge(10) }),
  road('creek', { tag: 'bridge', kind: 'straight', length: 32, width: 11, surface: 'wood', left: hard(), right: hard() }),
  road('creek', { tag: 'creekOut', kind: 'straight', length: 18, width: 20, left: verge(10), right: verge(10) }),

  // 7 Cow Crossing: winding dirt road into the farmhouse straight.
  road('cows', { tag: 'cowA', kind: 'straight', length: 20, width: 22, left: verge(12), right: verge(12) }),
  road('cows', { tag: 'cowB', kind: 'arc', turn: 'left', angle: 20, radius: 80, width: 22, left: verge(12), right: verge(12) }),
  road('cows', { tag: 'cowC', kind: 'arc', turn: 'right', angle: 20, radius: 80, width: 22, left: verge(12), right: verge(12) }),
  road('cows', { tag: 'cowRun', kind: 'straight', length: 23.087473045, width: 22, left: verge(12), right: verge(12) }),
  road('cows', { tag: 'cowD', kind: 'arc', turn: 'right', angle: 20, radius: 70, width: 22, left: verge(12), right: verge(12) }),
  road('cows', { tag: 'cowE', kind: 'arc', turn: 'left', angle: 20, radius: 70, width: 22, left: verge(12), right: verge(12) }),
  road('cows', { tag: 'apron', kind: 'straight', length: 40, width: 24, left: verge(12), right: verge(12) }),
];

const ROW = [-4.5, -1.5, 1.5, 4.5];
const WIDE_ROW = [-9, -3, 3, 9];

const smoothstep = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};
const bump = (x, z, cx, cz, h, sigma) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * sigma * sigma));

// Broad mounds under the climb, the windmill, the field and the switchbacks keep the road's embankments gentle.
const mounds = (x, z) =>
  bump(x, z, 28, 303, 14, 80) + bump(x, z, 120, 240, 7, 90) + bump(x, z, -170, 314, 13, 90) + bump(x, z, -289, 143, 8, 90);

// Cows: a crosser walks `from` to `to` and back; a grazer (from === to) stands on the verge. Periods of 16 s, phases staggered.
const crosser = (id, piece, at, from, to, phase) => ({ id, kind: 'cow', piece, at, from, to, period: 16, phase, pause: 2 });
const grazer = (id, piece, at, lateral, phase) => ({ id, kind: 'cow', piece, at, from: lateral, to: lateral, period: 10, phase, pause: 0 });

export const cloverMeadows = {
  id: 'clover-meadows',
  name: 'Clover Meadows',
  sectionNames: {
    farmhouse: 'Farmhouse Straight',
    wildflower: 'Wildflower S-Curves',
    windmill: 'Windmill Tunnel',
    meadowfield: 'Meadow Obstacle Field',
    switchbacks: 'Hillside Switchbacks',
    creek: 'Creek Crossing',
    cows: 'Cow Crossing',
  },
  pieces,
  // Flat farmhouse, a 15 m climb through the wildflowers, the +17 m peak in the windmill, a 12.5 m descent through the
  // switchbacks to the creek and a gentle run home. Straight ramps blurred over 30 m.
  elevation: {
    smoothing: 30,
    points: [
      { piece: 'farmBend', at: 'end', h: 0 },
      { piece: 'wf1', at: 20, h: 5 },
      { piece: 'wf2', at: 'start', h: 8 },
      { piece: 'wf3', at: 30, h: 13 },
      { piece: 'windIn', at: 'start', h: 15.5 },
      { piece: 'tunnel', at: 25, h: 17 },
      { piece: 'windOut', at: 'end', h: 16.5 },
      { piece: 'mf1', at: 'end', h: 16.2 },
      { piece: 'mf4', at: 50, h: 15.6 },
      { piece: 'mf5', at: 'end', h: 15 },
      { piece: 'sbIn', at: 'start', h: 15 },
      { piece: 'sb3', at: 'end', h: 2.5 },
      { piece: 'creekBend', at: 'end', h: 1.5 },
      { piece: 'bridge', at: 'end', h: 1.4 },
      { piece: 'cowRun', at: 'end', h: 0.6 },
      { piece: 'apron', at: 'start', h: 0 },
    ],
  },
  // The 12 m bypass leaves the road's left edge at the windmill and swings 58 m out around it, rejoining after the exit.
  // It is dirt at road speed but ~35 m longer than the tunnel, so its single boost pad (mid-way) does not pay for itself.
  shortcuts: [
    {
      id: 'bypass',
      width: 12,
      profile: [
        { piece: 'windIn', at: 3, lateral: -11.5 },
        { piece: 'windIn', at: 18, lateral: -34 },
        { piece: 'tunnel', at: 0, lateral: -50 },
        { piece: 'tunnel', at: 25, lateral: -58 },
        { piece: 'tunnel', at: 'end', lateral: -50 },
        { piece: 'windOut', at: 18, lateral: -34 },
        { piece: 'windOut', at: 33, lateral: -11.5 },
      ],
    },
  ],
  boostPads: [{ piece: 'tunnel', at: 25, lateral: -58 }],
  itemRows: [
    { piece: 'startStraight', at: 55, laterals: WIDE_ROW },
    { piece: 'windIn', at: 8, laterals: ROW },
    { piece: 'mf1', at: 12, laterals: [-10, -3.3, 3.3, 10] },
    { piece: 'creekApproach', at: 8, laterals: ROW },
  ],
  // Each ramp sits ~9 m before a grass patch and launches over it.
  ramps: [
    { piece: 'mf4', at: 10, lateral: -9.5, length: 8, width: 7 },
    { piece: 'mf4', at: 44, lateral: 7, length: 8, width: 7 },
    { piece: 'mf4', at: 76, lateral: -3, length: 8, width: 7 },
  ],
  patches: [
    // Wildflower: grass cutting the inside of each corner, and a verge-side blob on the rise.
    { id: 'wf-g1', kind: 'grass', piece: 'wildRise', at: 55, lateral: -7, length: 16, width: 7, seed: 11 },
    { id: 'wf-g2', kind: 'grass', piece: 'wf1', at: 30, lateral: 6, length: 20, width: 8, seed: 12 },
    { id: 'wf-g3', kind: 'grass', piece: 'wf2', at: 18, lateral: -7, length: 14, width: 9, seed: 13 },
    { id: 'wf-g4', kind: 'grass', piece: 'wf3', at: 29, lateral: 7, length: 18, width: 10, seed: 14 },
    // Meadow field: grass behind each ramp, mud and extra blobs in the other lanes.
    { id: 'mf-g1', kind: 'grass', piece: 'mf4', at: 21, lateral: -9.5, length: 10, width: 13, seed: 21 },
    { id: 'mf-g2', kind: 'grass', piece: 'mf4', at: 55, lateral: 7, length: 10, width: 14, seed: 22 },
    { id: 'mf-g3', kind: 'grass', piece: 'mf4', at: 87, lateral: -3, length: 10, width: 13, seed: 23 },
    { id: 'mf-g4', kind: 'grass', piece: 'mf3', at: 22, lateral: -9, length: 14, width: 11, seed: 24 },
    { id: 'mf-g5', kind: 'grass', piece: 'mf5', at: 55, lateral: -6, length: 14, width: 12, seed: 25 },
    { id: 'mf-m1', kind: 'mud', piece: 'mf4', at: 16, lateral: 9, length: 20, width: 13, seed: 31 },
    { id: 'mf-m2', kind: 'mud', piece: 'mf4', at: 52, lateral: -9, length: 18, width: 13, seed: 32 },
    { id: 'mf-m3', kind: 'mud', piece: 'mf3', at: 18, lateral: 8, length: 14, width: 12, seed: 33 },
    { id: 'mf-m4', kind: 'mud', piece: 'mf5', at: 30, lateral: 6, length: 16, width: 13, seed: 34 },
  ],
  obstacles: [
    { id: 'blades', kind: 'blades', piece: 'tunnel', at: 0, period: 4, phase: 0, blockFraction: 0.35 },
    crosser('cow-1', 'cowA', 12, -8, 8, 0),
    crosser('cow-2', 'cowB', 14, 8, -8, 5),
    crosser('cow-3', 'cowC', 12, -7, 7, 10),
    crosser('cow-4', 'cowRun', 10, 8, -8, 2.5),
    crosser('cow-5', 'cowD', 12, -8, 8, 7.5),
    crosser('cow-6', 'cowE', 14, 7, -7, 13),
    grazer('cow-7', 'cowB', 5, 14.5, 0),
    grazer('cow-8', 'cowC', 20, -14.5, 3),
    grazer('cow-9', 'cowRun', 14, 14, 6),
    grazer('cow-10', 'cowD', 6, -14.5, 9),
  ],
  grid: { cols: 4, colGap: 5.5, rowGap: 8 },
  // Gentle rolling meadow hills away from the road, on top of the broad mounds.
  terrain: (x, z, dist) => {
    const hills = 2.4 * Math.sin(x / 57) * Math.cos(z / 71) + 1.4 * Math.sin((x + z) / 33);
    return mounds(x, z) + hills * smoothstep((dist - 25) / 50);
  },
};

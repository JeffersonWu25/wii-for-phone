// Coconut Coast: a 1,100 m counterclockwise island loop in seven sections.
// Start straight along the bottom heading right, up the beach and the pier on the right, across the cliffs at the top,
// through the waterfall tunnel top-left, down the palm-grove hairpin on the left and back along the sandy sprint.
// The loop closes analytically: `sandA/sandB`, `exitLeg` and `bendL` were solved so position, heading and length meet.
import { edge, grass, hard } from '../track.js';

const road = (id, def) => ({ section: id, ...def });
const curbed = (runoff, w) => edge(true, runoff, w);

const pieces = [
  // 1 Coconut Village: wide, flat start/finish straight. The 40 m grid apron is the last piece of the lap.
  road('village', { tag: 'startStraight', kind: 'straight', length: 120, width: 24, left: grass(12), right: edge(false, 'sand', 12) }),

  // 2 Sunshine Bend: long sweeping left along the beach.
  road('sunshine', { tag: 'sunshine', kind: 'arc', turn: 'left', angle: 88, radius: 70, width: 16, left: curbed('grass', 10), right: curbed('sand', 14) }),

  // 3 Pelican Pier: wooden boardwalk, hard walls both sides.
  road('pier', { tag: 'pier1', kind: 'arc', turn: 'left', angle: 15, radius: 150, width: 14, surface: 'wood', left: hard(), right: hard() }),
  road('pier', { tag: 'pierMid', kind: 'straight', length: 10, width: 14, surface: 'wood', left: hard(), right: hard() }),
  road('pier', { tag: 'pier2', kind: 'arc', turn: 'left', angle: 30, radius: 150, width: 14, surface: 'wood', left: hard(), right: hard() }),

  // 4 Lighthouse Cliffs: S-curves climbing to the peak. Rock face on the inside, curb and railing on the drop side.
  road('cliffs', { tag: 'c1', kind: 'arc', turn: 'left', angle: 60, radius: 43, width: 16, left: curbed('grass', 5), right: hard(true) }),
  road('cliffs', { tag: 'c2', kind: 'arc', turn: 'right', angle: 80, radius: 36.3, width: 16, left: hard(true), right: curbed('grass', 5) }),
  road('cliffs', { tag: 'c3', kind: 'arc', turn: 'left', angle: 80, radius: 36.3, width: 16, left: curbed('grass', 5), right: hard(true) }),
  road('cliffs', { tag: 'c4', kind: 'arc', turn: 'right', angle: 70, radius: 36.3, width: 16, left: hard(true), right: curbed('grass', 5) }),
  road('cliffs', { tag: 'c5', kind: 'arc', turn: 'left', angle: 55, radius: 43, width: 16, left: curbed('grass', 5), right: hard(true) }),

  // 5 Hidden Falls: waterfall straight, then a 75 m rock tunnel (inner walls at the hard edges).
  road('falls', { tag: 'waterfall', kind: 'straight', length: 42, width: 16, left: curbed('grass', 6), right: curbed('grass', 6) }),
  road('falls', { tag: 'tunnel', kind: 'arc', turn: 'left', angle: 35, radius: 122.67, width: 14, tunnel: true, left: hard(), right: hard() }),
  road('falls', { tag: 'exitLeg', kind: 'straight', length: 20.545990344, width: 16, left: curbed('grass', 8), right: curbed('grass', 8) }),

  // 6 Palm Grove: downhill hairpin, chevron signs and guardrail on the outside.
  road('palms', { tag: 'palmsIn', kind: 'straight', length: 20, width: 16, left: curbed('grass', 8), right: curbed('grass', 8) }),
  road('palms', { tag: 'hairpin', kind: 'arc', turn: 'left', angle: 109, radius: 28, width: 18, left: curbed('grass', 6), right: hard(true) }),
  road('palms', { tag: 'palmsOut', kind: 'straight', length: 30, width: 16, left: curbed('grass', 8), right: curbed('grass', 8) }),
  road('palms', { tag: 'bendR', kind: 'arc', turn: 'right', angle: 30, radius: 79.5, width: 16, left: curbed('sand', 10), right: curbed('grass', 8) }),
  road('palms', { tag: 'sandA', kind: 'straight', length: 45, width: 16, left: edge(false, 'sand', 10), right: curbed('grass', 8) }),

  // 7 Sandy Sprint: back to sea level and into the start straight.
  road('sandy', { tag: 'sandB', kind: 'straight', length: 48.571213089, width: 16, left: edge(false, 'sand', 10), right: curbed('grass', 8) }),
  road('sandy', { tag: 'bendL', kind: 'arc', turn: 'left', angle: 68, radius: 81.484986844, width: 16, left: curbed('sand', 10), right: curbed('grass', 8) }),
  road('sandy', { tag: 'apron', kind: 'straight', length: 40, width: 24, left: grass(12), right: edge(false, 'sand', 12) }),
];

const ROW = [-4.5, -1.5, 1.5, 4.5];
const SEA_FLOOR = -9;

const smoothstep = (t) => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

export const coconutCoast = {
  id: 'coconut-coast',
  name: 'Coconut Coast',
  sectionNames: {
    village: 'Coconut Village',
    sunshine: 'Sunshine Bend',
    pier: 'Pelican Pier',
    cliffs: 'Lighthouse Cliffs',
    falls: 'Hidden Falls',
    palms: 'Palm Grove',
    sandy: 'Sandy Sprint',
  },
  pieces,
  // Straight ramps (<= 10%) blurred over 30 m: flat village, low pier, climb to the +25 m peak late in the cliffs,
  // then a long descent through the tunnel and the palm grove back to sea level.
  elevation: {
    smoothing: 30,
    points: [
      { piece: 'startStraight', at: 'end', h: 0 },
      { piece: 'sunshine', at: 'start', h: 0 },
      { piece: 'sunshine', at: 40, h: 2 },
      { piece: 'sunshine', at: 'end', h: 0.5 },
      { piece: 'pier1', at: 'start', h: 0.8 },
      { piece: 'pier2', at: 15, h: 0.8 },
      { piece: 'pier2', at: 'end', h: 6.5 },
      { piece: 'c5', at: 18, h: 26 },
      { piece: 'exitLeg', at: 'end', h: 11.5 },
      { piece: 'sandA', at: 'end', h: 5 },
      { piece: 'bendL', at: 'end', h: 0 },
    ],
  },
  // The 8 m sand shortcut runs right beside the road on the inside of the left bend (2 m fence gap): it leaves the road's left
  // edge on the straight after the hairpin (palms) and rejoins on the start apron (sandy), fenced off from the road in between.
  shortcuts: [
    {
      id: 'sand',
      width: 8,
      profile: [
        { piece: 'sandA', at: 0, lateral: -8 },
        { piece: 'sandA', at: 'end', lateral: -13.6 },
        { piece: 'bendL', at: 25, lateral: -15.2 },
        { piece: 'bendL', at: 'end', lateral: -15.2 },
        { piece: 'apron', at: 28, lateral: -8 },
      ],
    },
  ],
  boostPads: [],
  itemRows: [
    { piece: 'apron', at: 38, laterals: [-9, -3, 3, 9] },
    { piece: 'pier1', at: 8, laterals: ROW },
    { piece: 'waterfall', at: 34, laterals: ROW },
  ],
  ramps: [],
  grid: { cols: 4, colGap: 5.5, rowGap: 8 },
  // An island at sea level with open water around it: flat near the road, falling to the sea floor beyond ~40 m.
  terrain: (x, z, dist) => SEA_FLOOR * smoothstep((dist - 40) / 45),
  distantTerrain: () => SEA_FLOOR,
};

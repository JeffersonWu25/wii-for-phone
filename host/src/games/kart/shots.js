// Named debug camera spots per track, shared by the preview page and the screenshot tool.
// SHOTS[trackId][name]. Camera sits at frameAt(s - back), offset sideways by `lateral` (+ = right) and raised by `up`,
// and looks at frameAt(s + lookAhead). A shot with `eye` and `look` ({ x, y, z }) is placed at those world points instead.
import { pieceLength } from './track.js';
import { sunnyMeadow } from './tracks/sunnyMeadow.js';
import { coconutCoast } from './tracks/coconutCoast.js';

function rangeOf(def) {
  const lens = def.pieces.map(pieceLength);
  const lap = lens.reduce((a, b) => a + b, 0);
  const start = (tag) => {
    const i = def.pieces.findIndex((p) => p.tag === tag);
    if (i < 0) throw new Error(`unknown piece ${tag}`);
    return lens.slice(0, i).reduce((a, b) => a + b, 0);
  };
  const mid = (tag, f = 0.5) => start(tag) + lens[def.pieces.findIndex((p) => p.tag === tag)] * f;
  return { lap, start, mid };
}

const sm = rangeOf(sunnyMeadow);
const cc = rangeOf(coconutCoast);

export const SHOTS = {
  'sunny-meadow': {
    // Broadcast aerial from outside the sweeper, across the infield toward the start straight.
    overview: { s: sm.mid('sweeper'), lateral: -45, up: 55, back: 0, lookAhead: sm.lap - sm.mid('sweeper') + 55 },
    grid: { s: -8, lateral: -7, up: 5, back: 20, lookAhead: 40 },
    t1: { s: sm.mid('t1'), lateral: -9, up: 6, back: 18, lookAhead: 25 },
    short: { s: sm.mid('short'), lateral: 7, up: 5, back: 18, lookAhead: 30 },
    sbend: { s: sm.mid('sLeft', 1), lateral: 8, up: 6, back: 24, lookAhead: 26 },
    hill: { s: sm.mid('hill', 0.4), lateral: 8, up: 6, back: 20, lookAhead: 30 },
    back: { s: sm.mid('back', 0.45), lateral: 8, up: 5, back: 22, lookAhead: 28 },
    boost: { s: sm.start('back') + 35, lateral: 6, up: 4, back: 14, lookAhead: 18 },
    sweeper: { s: sm.mid('sweeper', 0.3), lateral: 9, up: 6, back: 22, lookAhead: 30 },
    finish: { s: 0, lateral: -8, up: 6, back: 24, lookAhead: 20 },
    // Close views of the preview's posed kart at s = 60 (see preview.js ?drift / ?boost).
    driftRear: { s: 60, lateral: 0, up: 1.7, back: 4.5, lookAhead: 6 },
    // Item row at start+80 seen from behind, and a side view of the posed kart (?hit=spin|tumble).
    itemRow: { s: sm.start('start') + 80, lateral: 0, up: 2.6, back: 11, lookAhead: 6 },
    hitSide: { s: 60, lateral: 6.5, up: 2, back: 0, lookAhead: 0 },
    driftQuarter: { s: 60, lateral: 3.2, up: 1.4, back: 3.2, lookAhead: 3.5 },
  },
  'coconut-coast': {
    // Behind the grid, looking up the start straight toward the line.
    ccStart: { s: -6, lateral: 0, up: 5, back: 16, lookAhead: 70 },
    ccSunshine: { s: cc.mid('sunshine', 0.45), lateral: 5, up: 5, back: 24, lookAhead: 30 },
    ccPier: { s: cc.start('pier1') + 14, lateral: 0, up: 4.5, back: 20, lookAhead: 45 },
    ccCliffs: { s: cc.mid('c2'), lateral: 4, up: 5.5, back: 24, lookAhead: 28 },
    ccFalls: { s: cc.mid('waterfall', 0.7), lateral: 0, up: 3.5, back: 22, lookAhead: 40 },
    ccPalms: { s: cc.mid('hairpin', 0.35), lateral: 6, up: 6, back: 24, lookAhead: 26 },
    ccSandy: { s: cc.start('sandB') + 20, lateral: 0, up: 4, back: 22, lookAhead: 60 },
    // Straight down onto the island from the south-east, the whole loop in frame.
    ccOverview: { eye: { x: 130, y: 360, z: 150 }, look: { x: -5, y: 0, z: -135 } },
  },
};

export function shotCamera(track, name) {
  const shot = SHOTS[track.id]?.[name];
  if (!shot) return null;
  if (shot.eye) return { position: { ...shot.eye }, target: { ...shot.look } };
  const at = track.frameAt(shot.s - shot.back);
  const to = track.frameAt(shot.s + shot.lookAhead);
  return {
    position: {
      x: at.x + at.rx * shot.lateral,
      y: track.heightAt(at.s, 0) + shot.up,
      z: at.z + at.rz * shot.lateral,
    },
    target: { x: to.x, y: to.y + 1, z: to.z },
  };
}

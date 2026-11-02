// Named debug camera spots, shared by the preview page and the screenshot tool.
// Camera sits at frameAt(s - back), offset sideways by `lateral` (+ = right) and raised by `up`,
// and looks at frameAt(s + lookAhead).
import { PIECES, pieceLength } from './track.js';

function pieceStart(tag) {
  let s = 0;
  for (const p of PIECES) {
    if (p.tag === tag) return s;
    s += pieceLength(p);
  }
  throw new Error(`unknown piece ${tag}`);
}

const LAP = PIECES.reduce((sum, p) => sum + pieceLength(p), 0);
const mid = (tag, f = 0.5) => pieceStart(tag) + pieceLength(PIECES.find((p) => p.tag === tag)) * f;

export const SHOTS = {
  // Broadcast aerial from outside the sweeper, across the infield toward the start straight.
  overview: { s: mid('sweeper'), lateral: -45, up: 55, back: 0, lookAhead: LAP - mid('sweeper') + 55 },
  grid: { s: -8, lateral: -7, up: 5, back: 20, lookAhead: 40 },
  t1: { s: mid('t1'), lateral: -9, up: 6, back: 18, lookAhead: 25 },
  short: { s: mid('short'), lateral: 7, up: 5, back: 18, lookAhead: 30 },
  sbend: { s: mid('sLeft', 1), lateral: 8, up: 6, back: 24, lookAhead: 26 },
  hill: { s: mid('hill', 0.4), lateral: 8, up: 6, back: 20, lookAhead: 30 },
  back: { s: mid('back', 0.45), lateral: 8, up: 5, back: 22, lookAhead: 28 },
  boost: { s: pieceStart('back') + 35, lateral: 6, up: 4, back: 14, lookAhead: 18 },
  sweeper: { s: mid('sweeper', 0.3), lateral: 9, up: 6, back: 22, lookAhead: 30 },
  finish: { s: 0, lateral: -8, up: 6, back: 24, lookAhead: 20 },
  // Close views of the preview's posed kart at s = 60 (see preview.js ?drift / ?boost).
  driftRear: { s: 60, lateral: 0, up: 1.7, back: 4.5, lookAhead: 6 },
  driftQuarter: { s: 60, lateral: 3.2, up: 1.4, back: 3.2, lookAhead: 3.5 },
};

export function shotCamera(track, name) {
  const shot = SHOTS[name];
  if (!shot) return null;
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

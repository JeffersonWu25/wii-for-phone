// Track registry: every playable track, the cups, and the standalone tracks.
import { buildTrack } from '../track.js';
import { sunnyMeadow } from './sunnyMeadow.js';
import { coconutCoast } from './coconutCoast.js';
import { cloverMeadows } from './cloverMeadows.js';

export const TRACKS = {
  'sunny-meadow': sunnyMeadow,
  'coconut-coast': coconutCoast,
  'clover-meadows': cloverMeadows,
};

// A null slot is a locked track that isn't built yet.
export const CUPS = [{ id: 'coconut', name: 'Coconut Cup', tracks: ['coconut-coast', 'clover-meadows', null, null] }];

export const STANDALONE = ['sunny-meadow'];

export function loadTrack(id) {
  const def = TRACKS[id];
  if (!def) throw new Error(`unknown track ${id}`);
  return buildTrack(def);
}

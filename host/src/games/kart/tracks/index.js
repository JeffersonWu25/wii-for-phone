// Track registry: every playable track, the cups, and the standalone tracks.
import { buildTrack } from '../track.js';

export const TRACKS = {
  'sunny-meadow': { id: 'sunny-meadow', name: 'Sunny Meadow' },
  'coconut-coast': { id: 'coconut-coast', name: 'Coconut Coast' },
};

// A null slot is a locked track that isn't built yet.
export const CUPS = [{ id: 'coconut', name: 'Coconut Cup', tracks: ['coconut-coast', null, null, null] }];

export const STANDALONE = ['sunny-meadow'];

export function loadTrack(id) {
  if (!TRACKS[id]) throw new Error(`unknown track ${id}`);
  return buildTrack();
}

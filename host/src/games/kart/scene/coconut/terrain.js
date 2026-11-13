// The island's shoreline. Wraps the track so the shared ground builder sees our terrain: land beside the road runs out to a
// per-section "dry" distance, then slopes into the sea. The pier stands in open water, the beaches slope gently.
import { SEA_LEVEL, keyed, lerp, smooth } from './kit.js';

// [s, metres of dry land beyond the road's outer limit] per side (right = sea side on the straights).
const DRY_R = [[0, 28], [100, 24], [140, 15], [225, 13], [244, -2], [338, -2], [366, 14], [600, 12], [700, 14], [760, 30], [915, 30], [1000, 34], [1100, 28]];
const DRY_L = [[0, 34], [110, 34], [150, 24], [225, 22], [244, -2], [338, -2], [366, 20], [700, 22], [760, 32], [915, 40], [1100, 34]];
const SLOPE = 17; // m over which land falls to the sea floor
const FLOOR = -7;

export function makeIsland(track) {
  const ds = track.sampleStep;
  const N = track.samples.length - 1;
  const dryAt = (side, s) => keyed(side > 0 ? DRY_R : DRY_L, s);

  function terrainHeight(x, z) {
    const p = track.project(x, z);
    const sp = track.samples[Math.round(p.s / ds) % N];
    const side = p.lateral >= 0 ? 1 : -1;
    const a = Math.abs(p.lateral);
    const lim = sp.halfWidth + (side > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
    if (a <= lim) return track.heightAt(p.s, p.lateral);
    const d = a - lim;
    const edgeH = track.heightAt(p.s, side * lim);
    const dry = dryAt(side, p.s);
    let fall = side > 0 ? sp.fallR : sp.fallL;
    if (dry < 3) fall = Math.min(fall, 5);
    const shore = 0.25 + (FLOOR - 0.25) * smooth(dry, dry + SLOPE, d);
    return lerp(edgeH, shore, smooth(0, fall, d));
  }

  const proxy = Object.create(track);
  proxy.terrainHeight = terrainHeight;
  return { track: proxy, heightAt: terrainHeight, dryAt, sea: SEA_LEVEL };
}

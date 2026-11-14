// Hillside Switchbacks: timber rails on the walled (outer) edges, chevron signs on the hairpin outsides, rocks and hillside trees.
import * as THREE from 'three';
import { Batch, chevronTex, mats, propGroup, section, xform } from '../coconut/kit.js';
import { box, cyl } from '../coconut/models.js';
import { fence } from '../coconut/parts.js';
import { flora } from './flora.js';
import { CL, ground, limitAt } from './kit.js';

export function buildSwitchbacks(ctx, sec) {
  const { track } = ctx;
  const g = section('switchbacks');
  const fb = new Batch();
  const sb = new Batch();
  const posts = new Batch();
  for (const piece of track.pieces.filter((p) => p.section === 'switchbacks')) {
    const { s0, s1 } = track.pieceRange(piece.tag);
    for (const side of [-1, 1]) if ((side < 0 ? piece.left : piece.right).wall) fence(track, fb, side, s0 + 1, s1 - 1, 'timber', { off: 0.35 });
    if (piece.kind !== 'arc') continue;
    // Outside of the bend is opposite the turn; a sign every ~14 m, board turned toward oncoming traffic.
    const dir = piece.turn === 'right' ? 1 : -1;
    const side = -dir;
    const n = Math.max(2, Math.round((s1 - s0) / 14));
    for (let i = 0; i < n; i++) {
      const s = s0 + ((i + 0.5) * (s1 - s0)) / n;
      const f = track.frameAt(s);
      const p = ground(track, s, side * (limitAt(track, s, side) + 2.2));
      // face normal: back along the road, leaning toward the road centre
      const nx = -f.fx - side * f.rx * 0.8;
      const nz = -f.fz - side * f.rz * 0.8;
      const yaw = Math.atan2(nx, nz);
      for (const o of [-1.2, 1.2]) {
        const px = p.x + Math.cos(yaw) * o;
        const pz = p.z - Math.sin(yaw) * o;
        posts.add(cyl(0.1, 0.1, 2.6, 5), xform(px, p.y + 1.3, pz), CL.woodDark);
      }
      const board = box(2.9, 1.6, 0.14);
      sb.add(board, xform(p.x, p.y + 2.1, p.z, yaw, dir, 1, 1), 0xffffff, true);
    }
  }
  const mat = new THREE.MeshLambertMaterial({ map: chevronTex(), side: THREE.DoubleSide });
  g.add(propGroup('fence', [fb.mesh(mats.col(), { shadow: true })]), propGroup('signs', [posts.mesh(mats.col()), sb.mesh(mat, { shadow: true })]));
  flora(ctx, g, sec.s0, sec.s1, { trees: 12, bushes: 6, flowers: 14, rocks: 10, seed: 5, treeLats: [6, 70] });
  return g;
}

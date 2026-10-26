const PAD = 8;

function fit(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
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
  return (x, z) => [ox + x * scale, oz + z * scale];
}

function ring(points, project) {
  return points.map((p, i) => {
    const [sx, sy] = project(p.x, p.z);
    return `${i === 0 ? 'M' : 'L'}${sx.toFixed(2)} ${sy.toFixed(2)}`;
  }).join(' ') + ' Z';
}

function stripQuads(poly) {
  const half = poly.length / 2;
  const quads = [];
  for (let i = 0; i < half - 1; i++) {
    quads.push([
      poly[i],
      poly[i + 1],
      poly[poly.length - 2 - i],
      poly[poly.length - 1 - i],
    ]);
  }
  return quads;
}

function courseMap(track) {
  if (!track || typeof track.trackVisuals !== 'function') {
    throw new Error('Minimap requires a track with trackVisuals()');
  }
  const vis = track.trackVisuals();
  const pts = [];
  for (const p of vis.edges.outer) pts.push([p.x, p.z]);
  for (const p of vis.edges.inner) pts.push([p.x, p.z]);
  for (const poly of vis.sand) {
    for (const p of poly) pts.push([p.x, p.z]);
  }
  const project = fit(pts);
  const road = ring([...vis.edges.outer, ...[...vis.edges.inner].reverse()], project);
  const sand = vis.sand.flatMap((poly) => stripQuads(poly).map((quad) => ring(quad, project)));
  const dashes = vis.dashes.map((quad) => ring(quad, project));
  const start = vis.startFinish;
  const rx = Math.cos(start.heading);
  const rz = -Math.sin(start.heading);
  const a = project(start.x - rx * start.width / 2, start.z - rz * start.width / 2);
  const b = project(start.x + rx * start.width / 2, start.z + rz * start.width / 2);
  const stripe = `M${a[0].toFixed(2)} ${a[1].toFixed(2)} L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
  return { road, sand, dashes, stripe, project };
}

export default function Minimap({ players, track }) {
  const map = courseMap(track);
  const markers = (players || []).map((player) => {
    const [cx, cy] = map.project(player.x, player.z);
    return { ...player, cx, cy };
  });

  return (
    <div className="kart-minimap" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="kart-minimap-svg">
        {map.sand.map((d, i) => (
          <path key={`sand-${i}`} d={d} fill="rgba(210,180,130,0.72)" stroke="none" />
        ))}
        <path d={map.road} fill="rgba(255,255,255,0.82)" stroke="rgba(255,255,255,0.95)" strokeWidth="0.6" />
        {map.dashes.map((d, i) => (
          <path key={`dash-${i}`} d={d} fill="rgba(242,122,18,0.95)" stroke="none" />
        ))}
        <path d={map.stripe} fill="none" stroke="#111" strokeWidth="1.1" />
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

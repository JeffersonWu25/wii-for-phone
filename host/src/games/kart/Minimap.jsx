import { useMemo } from 'react';
import { outlinePath } from './tracks.js';

export default function Minimap({ players, track }) {
  const outline = useMemo(() => outlinePath(track), [track]);
  const markers = (players || []).map((player) => {
    const [cx, cy] = outline.project(player.x, player.z);
    return { ...player, cx, cy };
  });

  return (
    <div className="kart-minimap" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="kart-minimap-svg">
        <path
          d={outline.d}
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={outline.d}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="5.5"
          strokeLinejoin="round"
        />
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

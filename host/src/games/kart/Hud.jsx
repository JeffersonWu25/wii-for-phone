import { placeParts } from './hud.js';

// One racer's overlay on their viewport; sized in container units so it scales with the pane.
export function Pane({ view, racer, label }) {
  const { slot, side, x, y, w, h } = view;
  const place = placeParts(racer?.place ?? slot + 1);
  return (
    <div
      className="kart-pane"
      data-slot={slot}
      data-side={side}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
    >
      <div className="kart-items">
        <div className="kart-item-slot main" />
        <div className="kart-item-slot reserve" />
      </div>
      <div className="kart-place"><b>{place.num}</b><small>{place.suffix}</small></div>
      <div className="kart-pills">
        <div className="kart-pill kart-coins">
          <svg viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="9" className="coin-rim" />
            <circle cx="10" cy="10" r="5.5" className="coin-face" />
          </svg>
          <span>00</span>
        </div>
        <div className="kart-pill kart-lapcount">
          <svg viewBox="0 0 20 20">
            <path d="M3 2v17" className="flag-pole" />
            <path d="M4 3h13v10H4z" className="flag-cloth" />
            <path d="M4 3h3.25v3.33H4zM10.5 3h3.25v3.33H10.5zM7.25 6.33h3.25v3.34H7.25zM13.75 6.33H17v3.34h-3.25zM4 9.67h3.25V13H4zM10.5 9.67h3.25V13H10.5z" className="flag-dark" />
          </svg>
          <span><b>{racer?.lap ?? 1}</b><small>/{racer?.laps ?? 3}</small></span>
        </div>
      </div>
      {racer?.wrongWay && <div className="kart-wrongway">WRONG WAY</div>}
      {label && <div className={`kart-countdown${label === 'GO!' ? ' go' : ''}`} key={label}>{label}</div>}
    </div>
  );
}

// Translucent track outline over the 3D scene; markers are moved from the RAF loop through dotRefs.
export function Minimap({ map, dotRefs }) {
  return (
    <svg className="kart-minimap" viewBox={`0 0 ${map.w} ${map.h}`}>
      <path d={map.path} className="kart-map-outline" />
      <line x1={map.tick[0]} y1={map.tick[1]} x2={map.tick[2]} y2={map.tick[3]} className="kart-map-start" />
      {map.entrants.map((e, slot) => (
        <g key={e.id} ref={(el) => { dotRefs.current[e.id] = el; }} className="kart-map-marker" data-slot={slot}>
          <circle r="8" fill={e.css} />
          <text y="3.4">{e.name.charAt(0).toUpperCase()}</text>
        </g>
      ))}
    </svg>
  );
}

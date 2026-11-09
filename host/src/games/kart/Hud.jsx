import { memo, useEffect, useRef } from 'react';
import { ITEM_ICONS } from './itemIcons.js';
import { nextSlotClock, placeParts, ROLL_TOTAL, ROLL_TOTAL_STACKED, slotView } from './hud.js';

// One item slot. The roulette and landing bump run on rAF against the clock, so they stay smooth between 100 ms HUD ticks.
function ItemSlot({ className, kind, rolling, total }) {
  const box = useRef(null);
  const clock = useRef(null);
  useEffect(() => {
    const el = box.current;
    const now0 = performance.now() / 1000;
    clock.current = nextSlotClock(clock.current, rolling, now0, total);
    let raf = 0;
    let shown;
    const frame = () => {
      const now = performance.now() / 1000;
      const view = slotView(clock.current, kind, now);
      if (view.icon !== shown) { shown = view.icon; el.innerHTML = view.icon ? ITEM_ICONS[view.icon] : ''; }
      el.style.transform = view.scale === 1 ? '' : `scale(${view.scale.toFixed(3)})`;
      if (view.rolling || view.scale !== 1) raf = requestAnimationFrame(frame);
    };
    frame();
    if (!raf && !rolling && clock.current.landed && kind) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, rolling, total]);
  return <div className={`kart-item-slot ${className}`} data-rolling={rolling ? '1' : undefined} data-kind={kind ?? undefined}><div className="kart-item-icon" ref={box} /></div>;
}

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
        <ItemSlot className="main" kind={racer?.item?.main} rolling={!!racer?.item?.rolling} total={ROLL_TOTAL} />
        <ItemSlot className="reserve" kind={racer?.item?.reserve} rolling={!!racer?.item?.rollingReserve} total={racer?.item?.rolling ? ROLL_TOTAL_STACKED : ROLL_TOTAL} />
      </div>
      {racer?.incoming && <div className="kart-incoming">!</div>}
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

// Translucent track (dark rim, light road band) over the 3D scene; markers are moved from the RAF loop. Memoized so the markers' refs are not re-attached by HUD ticks.
export const Minimap = memo(function Minimap({ map, dotRefs }) {
  return (
    <svg className="kart-minimap" viewBox={`0 0 ${map.w} ${map.h}`}>
      <path d={map.path} className="kart-map-shade" />
      <path d={map.path} className="kart-map-road" />
      <line x1={map.tick[0]} y1={map.tick[1]} x2={map.tick[2]} y2={map.tick[3]} className="kart-map-start" />
      {map.entrants.map((e, slot) => (
        <g key={e.id} ref={(el) => { dotRefs.current[e.id] = el; }} transform={`translate(${map.start[0].toFixed(1)} ${map.start[1].toFixed(1)})`} className="kart-map-marker" data-slot={slot}>
          <circle r="8" fill={e.css} />
          <text y="3.4">{[...e.name][0]?.toUpperCase() ?? '?'}</text>
        </g>
      ))}
    </svg>
  );
});

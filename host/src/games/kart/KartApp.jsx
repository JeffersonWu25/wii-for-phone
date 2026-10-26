import { useEffect, useRef, useState } from 'react';
import KartScene from './KartScene.jsx';
import Minimap from './Minimap.jsx';
import {
  DEFAULT_TUNING,
  LAPS,
  TUNING_LIMITS,
  createRace,
  applyDrive,
  applyUseItem,
  setTuning,
  snapshot,
  stepRace,
  takeBroadcast,
} from './race.js';
import { viewports } from './layout.js';
import GameSettings from '../../shared/GameSettings.jsx';

const KNOB_COPY = {
  speed: {
    label: 'Speed',
    title: 'Unboosted top speed',
    text: (v) => String(Math.round(v * 32)),
    aria: (v) => `${Math.round(v * 32)} meters per second`,
  },
  turn: {
    label: 'Turning',
    title: 'Steering rate',
    text: (v) => `${Math.round(v * 100)}%`,
    aria: (v) => `${Math.round(v * 100)} percent`,
  },
  drift: {
    label: 'Drift',
    title: 'How much the kart slips and leans in a drift',
    text: (v) => `${Math.round(v * 100)}%`,
    aria: (v) => `${Math.round(v * 100)} percent drift`,
  },
  boost: {
    label: 'Boost',
    title: 'Mini-turbo kick and how long the higher speed holds',
    text: (v) => `${Math.round(v * 100)}%`,
    aria: (v) => `${Math.round(v * 100)} percent boost`,
  },
};

function ItemSlots({ primary, secondary, color, effect }) {
  const fx = effect ? ` kart-fx-${effect}` : '';
  return (
    <div className={`kart-items${fx}`}>
      <div className={`kart-item kart-item-secondary${secondary ? ' is-filled' : ''}`}>
        {secondary ? <span className={`kart-item-icon item-${secondary}`} /> : null}
      </div>
      <div className={`kart-item kart-item-primary${primary ? ' is-filled' : ''}`}>
        {primary ? (
          <span
            className={`kart-item-icon item-${primary}`}
            style={color ? { '--item': color } : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}

function PlaceBadge({ place, placeText }) {
  const tone = place === 1 ? 'first' : place <= 3 ? 'podium' : 'field';
  return <div className={`kart-place kart-place-${tone}`}>{placeText}</div>;
}

function CoinLap({ coins, lap, lapsTotal }) {
  const coinText = String(Math.max(0, Math.min(10, coins | 0))).padStart(2, '0');
  return (
    <div className="kart-coinlap">
      <span className="kart-coin">
        <span className="kart-coin-glyph" aria-hidden="true" />
        <span className="kart-coin-count">{coinText}</span>
      </span>
      <span className="kart-lap">
        <span className="kart-lap-flag" aria-hidden="true" />
        <span className="kart-lap-count">{lap} / {lapsTotal}</span>
      </span>
    </div>
  );
}

export default function KartApp({ wsRef, send, setup, onAbandon }) {
  const setupRef = useRef(setup);
  const startedRef = useRef(false);
  const raceRef = useRef(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [view, setView] = useState(null);
  const [knobs, setKnobs] = useState({ ...DEFAULT_TUNING });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // setup is frozen at Start Race. A later join must not build a second race.
    const race = createRace(setupRef.current.players, performance.now(), setupRef.current.track);
    raceRef.current = race;
    setView(snapshot(race));
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    function onMessage(event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!raceRef.current) return;
      if (msg.type === 'drive') applyDrive(raceRef.current, msg, performance.now());
      else if (msg.type === 'use_item') applyUseItem(raceRef.current, msg);
    }
    ws?.addEventListener('message', onMessage);
    let last = performance.now();
    const timer = window.setInterval(() => {
      const race = raceRef.current;
      if (!race) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepRace(race, dt, now);
      for (const msg of takeBroadcast(race, now)) sendRef.current(msg);
      if (now - (race._hudAt || 0) > 100) {
        race._hudAt = now;
        setView(snapshot(race));
      }
    }, 32);
    return () => {
      window.clearInterval(timer);
      ws?.removeEventListener('message', onMessage);
    };
  }, [wsRef]);

  function slide(key, raw) {
    const value = Number(raw);
    setKnobs((prev) => ({ ...prev, [key]: value }));
    if (raceRef.current) setTuning(raceRef.current, { [key]: value });
  }

  const count = view?.players.length || setup.players.length || 1;
  const panes = viewports(count, 100, 100);
  const lapsTotal = view?.lapsTotal || LAPS;

  return (
    <div className="kart-layout">
      <KartScene raceRef={raceRef} track={setup.track} />
      <div className="kart-hud">
        {view?.players.map((player, i) => (
          <div key={player.playerId} className="kart-pane" style={panes[i].css}>
            <ItemSlots
              primary={player.itemPrimary}
              secondary={player.itemSecondary}
              color={player.itemColor}
              effect={player.effect}
            />
            <CoinLap coins={player.coins} lap={player.lap} lapsTotal={lapsTotal} />
            <PlaceBadge place={player.place} placeText={player.placeText} />
          </div>
        ))}
        {view?.players?.length ? <Minimap players={view.players} track={setup.track} /> : null}
        {view?.phase === 'countdown' && view.countdown > 0 && (
          <div className="kart-countdown">{view.countdown}</div>
        )}
        {view?.phase === 'finished' && (
          <div className="kart-results">
            <h2>Finish</h2>
            <ol>
              {view.results.map((row) => (
                <li key={row.playerId}>
                  <b style={{ color: row.color }}>{row.characterName}</b>
                  <span>{row.name}</span>
                  <span>{row.timeMs == null ? 'DNF' : `${(row.timeMs / 1000).toFixed(2)}s`}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={onAbandon}>Back to games</button>
          </div>
        )}
      </div>
      {view?.phase !== 'finished' && (
        <button type="button" className="btn-abandon" onClick={onAbandon}>← Games</button>
      )}
      {view?.phase !== 'finished' && (
        <GameSettings open={settingsOpen} onToggle={() => setSettingsOpen((open) => !open)}>
          <form className="game-settings-form" onSubmit={(event) => event.preventDefault()}>
            {Object.keys(TUNING_LIMITS).map((key) => {
              const copy = KNOB_COPY[key];
              if (!copy) throw new Error(`missing tuning label for ${key}`);
              const limit = TUNING_LIMITS[key];
              return (
                <label key={key} title={copy.title}>
                  {copy.label}
                  <input
                    type="range"
                    min={limit.min}
                    max={limit.max}
                    step={limit.step}
                    value={knobs[key]}
                    aria-valuetext={copy.aria(knobs[key])}
                    onChange={(event) => slide(key, event.target.value)}
                  />
                  <span>{copy.text(knobs[key])}</span>
                </label>
              );
            })}
          </form>
          <button type="button" className="game-settings-action" onClick={onAbandon}>
            Back to games
          </button>
        </GameSettings>
      )}
    </div>
  );
}

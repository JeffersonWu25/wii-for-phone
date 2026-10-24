import { useEffect, useRef, useState } from 'react';
import KartScene from './KartScene.jsx';
import Minimap from './Minimap.jsx';
import { LAPS, createRace, applyDrive, applyUseItem, setTuning, snapshot, stepRace, takeBroadcast } from './race.js';
import { viewports } from './layout.js';

function ItemSlots({ primary, secondary }) {
  return (
    <div className="kart-items">
      <div className={`kart-item kart-item-secondary${secondary ? ' is-filled' : ''}`}>
        {secondary ? <span className={`kart-item-icon item-${secondary}`} /> : null}
      </div>
      <div className={`kart-item kart-item-primary${primary ? ' is-filled' : ''}`}>
        {primary ? <span className={`kart-item-icon item-${primary}`} /> : null}
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

export default function KartApp({ wsRef, send, players, onAbandon }) {
  const raceRef = useRef(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [view, setView] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [turn, setTurn] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const rosterRef = useRef(players);

  useEffect(() => {
    const race = createRace(rosterRef.current, performance.now());
    raceRef.current = race;
    setView(snapshot(race));

    const ws = wsRef.current;
    function onMessage(event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
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

  const count = view?.players.length || players.length || 1;
  const panes = viewports(count, 100, 100);
  const lapsTotal = view?.lapsTotal || LAPS;

  return (
    <div className="kart-layout">
      <KartScene raceRef={raceRef} />
      <div className="kart-hud">
        {view?.players.map((player, i) => (
          <div key={player.playerId} className="kart-pane" style={panes[i].css}>
            <ItemSlots primary={player.itemPrimary} secondary={player.itemSecondary} />
            <CoinLap coins={player.coins} lap={player.lap} lapsTotal={lapsTotal} />
            <PlaceBadge place={player.place} placeText={player.placeText} />
          </div>
        ))}
        {view?.players?.length ? <Minimap players={view.players} /> : null}
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
        <div className="kart-chrome">
          <button type="button" className="kart-back" onClick={onAbandon}>Back</button>
          <button
            type="button"
            className="kart-settings-toggle"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            Tuning
          </button>
          {settingsOpen && (
            <form className="kart-settings" onSubmit={(event) => event.preventDefault()}>
              <label>
                Speed
                <input
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.05"
                  value={speed}
                  aria-valuetext={`${Math.round(speed * 32)} meters per second`}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setSpeed(next);
                    if (raceRef.current) setTuning(raceRef.current, { speed: next, turn });
                  }}
                />
                <span>{Math.round(speed * 32)}</span>
              </label>
              <label>
                Turning
                <input
                  type="range"
                  min="0.4"
                  max="2.2"
                  step="0.05"
                  value={turn}
                  aria-valuetext={`${Math.round(turn * 100)} percent`}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setTurn(next);
                    if (raceRef.current) setTuning(raceRef.current, { speed, turn: next });
                  }}
                />
                <span>{Math.round(turn * 100)}%</span>
              </label>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

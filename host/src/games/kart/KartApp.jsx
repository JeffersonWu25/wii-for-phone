import { useEffect, useRef, useState } from 'react';
import KartScene from './KartScene.jsx';
import { LAPS, createRace, applyDrive, snapshot, stepRace, takeBroadcast } from './race.js';
import { viewports } from './layout.js';

export default function KartApp({ wsRef, send, players, onAbandon }) {
  const raceRef = useRef(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [view, setView] = useState(null);

  const rosterRef = useRef(players);

  useEffect(() => {
    const race = createRace(rosterRef.current, performance.now());
    raceRef.current = race;
    setView(snapshot(race));

    const ws = wsRef.current;
    function onMessage(event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type !== 'drive') return;
      applyDrive(raceRef.current, msg, performance.now());
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
      if (now - (race._hudAt || 0) > 200) {
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

  return (
    <div className="kart-layout">
      <KartScene raceRef={raceRef} />
      <div className="kart-hud">
        {view?.players.map((player, i) => (
          <div key={player.playerId} className="kart-pane" style={{ ...panes[i].css, borderColor: player.color }}>
            <div className="kart-pane-tag" style={{ background: player.color }}>
              <span>P{player.place}</span>
              <strong>{player.characterName}</strong>
              <span>{player.name}</span>
            </div>
            <div className="kart-pane-lap">Lap {player.lap} / {LAPS}</div>
          </div>
        ))}
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
        <button type="button" className="kart-back" onClick={onAbandon}>Back</button>
      )}
    </div>
  );
}

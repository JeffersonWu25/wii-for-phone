import { useEffect, useRef, useState } from 'react';
import TeamSelect from './TeamSelect.jsx';
import { createMatch, step, view } from './rally.js';
import { createTennisScene } from './scene.js';
import { afterPhysics, begin, createFlow, onPhone, winnerNames } from './flow.js';
import './match.css';

// Self-contained tennis match.
export default function TennisApp({ wsRef, send, players, disconnectedPlayerIds, onGameOver, onAbandon }) {
  const [lineup, setLineup] = useState(null);
  const [winner, setWinner] = useState(null);

  const containerRef = useRef(null);
  const flowRef = useRef(null);
  const startedRef = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  const disconnectedRef = useRef(disconnectedPlayerIds);
  disconnectedRef.current = disconnectedPlayerIds;

  // Start once. StrictMode runs effects twice; the ref keeps a single match
  // the way bowling keeps a single BowlingGame.
  useEffect(() => {
    if (!lineup || startedRef.current) return;
    startedRef.current = true;
    const match = createMatch({
      players: players.map((player) => ({ id: player.playerId, name: player.name })),
      sideA: lineup.sideA,
      sideB: lineup.sideB,
      bestOf: lineup.bestOf,
    });
    const flow = createFlow(match);
    const msg = begin(flow, performance.now());
    if (msg) sendRef.current(msg);
    flowRef.current = flow;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup]);

  useEffect(() => {
    const flow = flowRef.current;
    const court = containerRef.current;
    if (!lineup || !flow || !court) return undefined;

    const match = flow.match;
    const scene = createTennisScene(court);
    const readView = () => view(match);
    window.__tennisView = readView;

    const ws = wsRef.current;
    function onSocket(event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const out = onPhone(flow, msg, performance.now());
      if (out) sendRef.current(out);
    }
    ws?.addEventListener('message', onSocket);

    let raf = 0;
    let last = performance.now();
    let disposed = false;
    let announced = false;

    function frame(now) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(Math.max(0, now - last) / 1000, 0.05);
      last = now;
      step(match, dt);
      const msg = afterPhysics(flow, now, disconnectedRef.current);
      scene.resize();
      scene.setView(view(match));
      scene.render();
      if (msg) sendRef.current(msg);
      if (!announced) {
        const names = winnerNames(flow);
        if (names) {
          announced = true;
          setWinner(names);
        }
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ws?.removeEventListener('message', onSocket);
      scene.dispose();
      if (window.__tennisView === readView) delete window.__tennisView;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup]);

  if (!lineup) {
    return (
      <TeamSelect
        players={players}
        onBack={onAbandon}
        onStart={setLineup}
      />
    );
  }

  const winnerText = winner ? winner.join(' and ') : '';

  return (
    <div className="tennis-app">
      <div className="tennis-court" ref={containerRef} />
      <button type="button" className="tennis-quit" onClick={onAbandon}>Quit</button>
      {winner && (
        <div className="tennis-winner">
          <p className="tennis-winner-names">{winnerText}</p>
          <button type="button" className="tennis-back-hub" onClick={onGameOver}>Back to games</button>
        </div>
      )}
    </div>
  );
}

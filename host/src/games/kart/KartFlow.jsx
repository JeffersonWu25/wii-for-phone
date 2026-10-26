import { useEffect, useRef, useState } from 'react';
import KartApp from './KartApp.jsx';
import {
  commands,
  createLobby,
  eventFromPhone,
  project,
  reduce,
} from './onboarding.js';

export default function KartFlow({ wsRef, send, players, disconnectedPlayerIds, onAbandon }) {
  const playersRef = useRef(players);
  playersRef.current = players;
  const lobbyRef = useRef(null);
  if (lobbyRef.current === null) {
    lobbyRef.current = createLobby(players, disconnectedPlayerIds);
  }
  const [lobby, setLobby] = useState(lobbyRef.current);
  const [raceSetup, setRaceSetup] = useState(null);
  const raceSetupRef = useRef(null);
  const commitRef = useRef(null);

  function commit(event) {
    if (raceSetupRef.current) return;
    const next = reduce(lobbyRef.current, event);
    if (next === lobbyRef.current) return;
    lobbyRef.current = next;
    setLobby(next);
    const projected = project(next, playersRef.current);
    send(projected.wire);
    if (projected.setup) {
      raceSetupRef.current = projected.setup;
      setRaceSetup(projected.setup);
    }
  }
  commitRef.current = commit;

  useEffect(() => {
    if (raceSetupRef.current) return;
    const entries = players.map((player) => ({
      playerId: player.playerId,
      connected: !disconnectedPlayerIds.has(player.playerId),
    }));
    const next = reduce(lobbyRef.current, commands.rosterSync(entries));
    if (next !== lobbyRef.current) {
      lobbyRef.current = next;
      setLobby(next);
    }
    // Reclaim does not append a player, so the same seats still need a snapshot.
    send(project(lobbyRef.current, players).wire);
  }, [players, disconnectedPlayerIds, send]);

  useEffect(() => {
    if (raceSetup) return undefined;
    const ws = wsRef.current;
    if (!ws) return undefined;
    function onMessage(socketEvent) {
      let msg;
      try { msg = JSON.parse(socketEvent.data); } catch { return; }
      const domainEvent = eventFromPhone(msg);
      if (domainEvent) commitRef.current(domainEvent);
    }
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [wsRef, raceSetup]);

  if (raceSetup) {
    return <KartApp wsRef={wsRef} send={send} setup={raceSetup} onAbandon={onAbandon} />;
  }

  const { view } = project(lobby, players);
  return (
    <OnboardingScreen
      view={view}
      onPrimary={() => { if (view.primary.enabled) commit(view.primary.event); }}
      onBack={() => {
        if (view.back.kind === 'abandon') onAbandon();
        else commit(commands.back());
      }}
      onSelectTrack={(trackId) => commit(commands.selectTrack(trackId))}
    />
  );
}

function OnboardingScreen({ view, onPrimary, onBack, onSelectTrack }) {
  return (
    <div className="kart-onboard">
      <button type="button" className="kart-stage-back" onClick={onBack}>{view.back.label}</button>
      <div className="kart-onboard-stage">
        {view.phase === 'menu' && (
          <div className="kart-menu">
            <h1>Mario Kart</h1>
            <p>Phones pick the racers. This screen picks the course.</p>
          </div>
        )}
        {view.phase === 'characters' && (
          <div className="kart-mirror">
            {view.catalog.map((character) => (
              <div
                key={character.id}
                className={character.pickedBy.length ? 'kart-character is-picked' : 'kart-character'}
                style={{ background: character.css }}
              >
                <span className="kart-character-name">{character.name}</span>
                {character.pickedBy.map((racer) => (
                  <span key={racer.playerId} className="kart-character-pick">{racer.name}</span>
                ))}
              </div>
            ))}
          </div>
        )}
        {view.phase === 'track' && (
          <TrackPreview tracks={view.tracks} outline={view.track.outline} onSelectTrack={onSelectTrack} />
        )}
        {view.phase === 'lobby' && <LobbyList racers={view.racers} />}
      </div>
      <div className="kart-onboard-actions">
        <button type="button" className="kart-primary" disabled={!view.primary.enabled} onClick={onPrimary}>
          {view.primary.label}
        </button>
        {view.primary.hint ? <p className="kart-hint">{view.primary.hint}</p> : null}
      </div>
    </div>
  );
}

function TrackPreview({ tracks, outline, onSelectTrack }) {
  const index = Math.max(0, tracks.findIndex((track) => track.selected));
  const track = tracks[index];
  const prev = index > 0 ? tracks[index - 1] : null;
  const next = index < tracks.length - 1 ? tracks[index + 1] : null;
  return (
    <div className="kart-track-preview">
      <button
        type="button"
        className="kart-track-arrow"
        disabled={!prev}
        onClick={() => { if (prev) onSelectTrack(prev.id); }}
      >
        Previous
      </button>
      <div className="kart-track-card">
        <h1>{track.name}</h1>
        <p>{track.blurb}</p>
        <svg viewBox="0 0 100 100" className="kart-track-outline" aria-hidden="true">
          <path d={outline} />
        </svg>
      </div>
      <button
        type="button"
        className="kart-track-arrow"
        disabled={!next}
        onClick={() => { if (next) onSelectTrack(next.id); }}
      >
        Next
      </button>
    </div>
  );
}

function LobbyList({ racers }) {
  return (
    <div className="kart-lobby">
      <h1>Race lobby</h1>
      <ul>
        {racers.map((racer) => (
          <li
            key={racer.playerId}
            className={racer.connected ? 'kart-lobby-row' : 'kart-lobby-row is-disconnected'}
          >
            <span className="kart-lobby-name">{racer.name}</span>
            <span className="kart-lobby-character">{racer.characterName || 'Choosing'}</span>
            <span className={racer.ready ? 'kart-lobby-ready is-ready' : 'kart-lobby-ready'}>
              {racer.ready ? 'Ready' : 'Not ready'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

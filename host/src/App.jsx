import { useState, useCallback } from 'react';
import { useRelay } from './shared/useRelay.js';
import LobbyScreen from './shared/LobbyScreen.jsx';
import GameSelectScreen from './shared/GameSelectScreen.jsx';
import BowlingApp from './games/bowling/BowlingApp.jsx';

// ── App — thin 3-screen router ────────────────────────────────────────────────
// Screens: 'lobby' → 'game-select' → [game]
// Owns: WebSocket (via useRelay), player list, current screen, selected game.
// All game-specific logic lives inside each game's App component.

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [players, setPlayers] = useState([]);
  const [disconnectedPlayerIds, setDisconnectedPlayerIds] = useState(() => new Set());

  const onMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'player_joined':
        setPlayers((prev) => [...prev, { playerId: msg.playerId, name: msg.name }]);
        break;
      case 'player_disconnected':
        setDisconnectedPlayerIds((prev) => new Set([...prev, msg.playerId]));
        break;
      case 'player_reconnected':
        setDisconnectedPlayerIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.playerId);
          return next;
        });
        break;
      // All game-specific messages (pos, aim, throw, etc.) are handled
      // inside each game component via their own ws.addEventListener.
    }
  }, []);

  const { sessionId, connected, send, reconnect, wsRef } = useRelay(onMessage);

  function handleGameSelect(gameId) {
    setScreen(gameId);
  }

  function handleGameOver() {
    setScreen('game-select');
  }

  function handleAbandon() {
    setScreen('game-select');
  }

  function handleReconnect() {
    setPlayers([]);
    setScreen('lobby');
    reconnect();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!connected) {
    return <LostConnectionScreen onReconnect={handleReconnect} />;
  }

  if (screen === 'lobby') {
    return (
      <LobbyScreen
        sessionId={sessionId}
        players={players}
        onStart={() => setScreen('game-select')}
      />
    );
  }

  if (screen === 'game-select') {
    return (
      <GameSelectScreen
        send={send}
        onSelect={handleGameSelect}
      />
    );
  }

  if (screen === 'bowling') {
    return (
      <BowlingApp
        wsRef={wsRef}
        send={send}
        players={players}
        disconnectedPlayerIds={disconnectedPlayerIds}
        onGameOver={handleGameOver}
        onAbandon={handleAbandon}
      />
    );
  }

  // Unimplemented game selected — show coming-soon placeholder
  return <ComingSoonScreen onBack={() => setScreen('game-select')} />;
}

// ── LostConnectionScreen ──────────────────────────────────────────────────────

function LostConnectionScreen({ onReconnect }) {
  return (
    <div className="lost-connection">
      <h1>Lost Connection</h1>
      <p>Could not reach the relay server.</p>
      <button onClick={onReconnect}>Reconnect</button>
    </div>
  );
}

// ── ComingSoonScreen ──────────────────────────────────────────────────────────

function ComingSoonScreen({ onBack }) {
  return (
    <div className="coming-soon-screen">
      <div className="coming-soon-emoji">🚧</div>
      <h1>Coming Soon</h1>
      <p>This game is still in development. Check back later!</p>
      <button onClick={onBack}>← Back to Games</button>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';

const RELAY_URL = `wss://${import.meta.env.VITE_LOCAL_IP}:8080`;
const PHONE_BASE = `https://${import.meta.env.VITE_LOCAL_IP}:5174`;

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const canvasRef = useRef(null);

  const connect = useCallback(() => {
    // Reset session state on each (re)connect
    setSessionId(null);
    setPlayers([]);
    setGameStarted(false);

    const ws = new WebSocket(`${RELAY_URL}?role=host`);
    wsRef.current = ws;

    ws.addEventListener('open', () => setConnected(true));

    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'session_created') {
        setSessionId(msg.sessionId);
      } else if (msg.type === 'player_joined') {
        setPlayers((prev) => [...prev, { playerId: msg.playerId, name: msg.name }]);
      }
    });

    ws.addEventListener('close', () => setConnected(false));
    ws.addEventListener('error', () => setConnected(false));
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  // Render QR code whenever sessionId is set and canvas is in the DOM
  useEffect(() => {
    if (!sessionId || !canvasRef.current) return;
    const url = `${PHONE_BASE}?session=${sessionId}`;
    QRCode.toCanvas(canvasRef.current, url, { width: 260, margin: 2 });
  }, [sessionId]);

  function startGame() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || players.length === 0) return;

    setGameStarted(true);
    ws.send(JSON.stringify({ type: 'game_started' }));
    ws.send(JSON.stringify({ type: 'your_turn', playerId: players[0].playerId }));
  }

  if (!connected) {
    return <LostConnectionScreen onReconnect={connect} />;
  }

  if (gameStarted) {
    return <GameScreen players={players} />;
  }

  return (
    <LobbyScreen
      sessionId={sessionId}
      players={players}
      canvasRef={canvasRef}
      onStart={startGame}
    />
  );
}

function LobbyScreen({ sessionId, players, canvasRef, onStart }) {
  return (
    <div className="lobby">
      <div className="lobby-left">
        <h1>Wii Bowling</h1>
        <p className="lobby-sub">Scan to join on your phone</p>
        <div className="qr-wrap">
          {sessionId ? (
            <canvas ref={canvasRef} />
          ) : (
            <div className="qr-placeholder">Connecting...</div>
          )}
        </div>
        {sessionId && (
          <p className="session-id">Session: <strong>{sessionId}</strong></p>
        )}
      </div>

      <div className="lobby-right">
        <h2>Players <span className="player-count">({players.length})</span></h2>
        <ul className="player-list">
          {players.length === 0 ? (
            <li className="player-empty">Waiting for players...</li>
          ) : (
            players.map((p) => (
              <li key={p.playerId} className="player-item">
                {p.name}
              </li>
            ))
          )}
        </ul>
        <button
          className="btn-start"
          disabled={players.length === 0}
          onClick={onStart}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}

function GameScreen({ players }) {
  return (
    <div className="game-placeholder">
      <h1>Game Started</h1>
      <p>Players: {players.map((p) => p.name).join(', ')}</p>
      <p className="sub">3D scene coming in Part 4</p>
    </div>
  );
}

function LostConnectionScreen({ onReconnect }) {
  return (
    <div className="lost-connection">
      <h1>Lost Connection</h1>
      <p>Could not reach the relay server.</p>
      <button onClick={onReconnect}>Reconnect</button>
    </div>
  );
}

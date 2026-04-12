import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

const PHONE_BASE = import.meta.env.VITE_PHONE_URL;

// Lobby screen — shows QR code, live player list, and a button to advance.
// Owns canvasRef internally so App doesn't need to manage it.
export default function LobbyScreen({ sessionId, players, onStart }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!sessionId || !canvasRef.current) return;
    const base = PHONE_BASE?.startsWith('http') ? PHONE_BASE : `https://${PHONE_BASE}`;
    const url = `${base}?session=${sessionId}`;
    QRCode.toCanvas(canvasRef.current, url, { width: 260, margin: 2 });
  }, [sessionId]);

  return (
    <div className="lobby">
      <div className="lobby-left">
        <h1>WildHacks Arcade</h1>
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
              <li key={p.playerId} className="player-item">{p.name}</li>
            ))
          )}
        </ul>
        <button
          className="btn-start"
          disabled={players.length === 0}
          onClick={onStart}
        >
          Select Game
        </button>
      </div>
    </div>
  );
}

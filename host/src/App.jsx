import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import Scene from './Scene.jsx';
import { BowlingGame } from './BowlingGame.js';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;
const PHONE_BASE = import.meta.env.VITE_PHONE_URL;
const RESET_DELAY_MS = 1500;

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [scores, setScores] = useState([]);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [frameResultLabel, setFrameResultLabel] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);

  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const bowlingGameRef = useRef(null);
  const throwInFlight = useRef(false);
  const pinsStandingBeforeRoll = useRef(10);
  // Ref copy of currentPlayerId so callbacks don't capture stale state
  const currentPlayerIdRef = useRef(null);

  useEffect(() => {
    currentPlayerIdRef.current = currentPlayerId;
  }, [currentPlayerId]);

  // ── Incoming phone message handlers ────────────────────────────────────────

  function handlePos(msg) {
    if (!bowlingGameRef.current) return;
    if (msg.playerId !== currentPlayerIdRef.current) return;
    if (throwInFlight.current) return;
    sceneRef.current?.previewBall(msg.aimOffset ?? 0, msg.aimAngle ?? 0);
  }

  function handleAim(msg) {
    if (!bowlingGameRef.current) return;
    if (msg.playerId !== currentPlayerIdRef.current) return;
    if (throwInFlight.current) return;
    sceneRef.current?.previewBall(msg.aimOffset ?? 0, msg.aimAngle ?? 0);
  }

  function handleThrow(msg) {
    if (!bowlingGameRef.current) return;
    if (msg.playerId !== currentPlayerIdRef.current) return;
    if (throwInFlight.current) return;
    throwInFlight.current = true;
    sceneRef.current?.throwBall(msg.power, msg.aimAngle ?? 0, msg.spin, msg.aimOffset ?? 0);
  }

  // ── Settle callback (called by physics after pins come to rest) ─────────────

  function handleSettle(standingCount) {
    const game = bowlingGameRef.current;
    const ws = wsRef.current;
    if (!game) return;

    const isFirstRoll = game.currentRoll === 0;
    const pinsKnocked = isFirstRoll
      ? 10 - standingCount
      : pinsStandingBeforeRoll.current - standingCount;

    // Derive strike/spare BEFORE recordRoll mutates the frame state
    const pinsRemaining = game.pinsRemainingThisFrame();
    const frameScore =
      isFirstRoll && pinsKnocked === 10 ? 'strike' :
      !isFirstRoll && pinsKnocked >= pinsRemaining ? 'spare' :
      null;

    const { advancedPlayer, gameOver } = game.recordRoll(pinsKnocked);
    const updatedScores = game.getScores();
    setScores(updatedScores);

    // Find running total for the current player to report to phone
    const playerRow = updatedScores.find((s) => s.id === currentPlayerIdRef.current);
    const totalScore = playerRow?.frames
      .map((f) => f.runningTotal)
      .filter((t) => t !== null)
      .at(-1) ?? 0;

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'throw_result',
        playerId: currentPlayerIdRef.current,
        pinsKnocked,
        frameScore,
        totalScore,
      }));
    }

    // Brief overlay for strikes and spares
    if (frameScore) {
      setFrameResultLabel(frameScore === 'strike' ? 'STRIKE!' : 'SPARE!');
      setTimeout(() => setFrameResultLabel(null), RESET_DELAY_MS);
    }

    if (advancedPlayer) {
      // Frame complete — reset pins after a beat, then advance turn
      setTimeout(() => {
        sceneRef.current?.resetPins();
        pinsStandingBeforeRoll.current = 10;
        throwInFlight.current = false;

        if (gameOver) {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'game_over', scores: updatedScores }));
          }
          setIsGameOver(true);
        } else {
          const nextPlayer = game.getCurrentPlayer();
          const nextId = nextPlayer.id;
          // Update ref immediately so the next message handler sees the right player
          currentPlayerIdRef.current = nextId;
          setCurrentPlayerId(nextId);
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'your_turn', playerId: nextId }));
          }
        }
      }, RESET_DELAY_MS);
    } else {
      // First roll done, second roll coming — reset ball, re-signal same player
      pinsStandingBeforeRoll.current = standingCount;
      setTimeout(() => {
        sceneRef.current?.resetBall();
        throwInFlight.current = false;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'your_turn', playerId: currentPlayerIdRef.current }));
        }
      }, RESET_DELAY_MS);
    }
  }

  // ── Message handler ref — updated every render so it always sees fresh state ─

  const onMessageRef = useRef(null);
  useEffect(() => {
    onMessageRef.current = (msg) => {
      switch (msg.type) {
        case 'session_created':
          setSessionId(msg.sessionId);
          break;
        case 'player_joined':
          setPlayers((prev) => [...prev, { playerId: msg.playerId, name: msg.name }]);
          break;
        case 'aim':
          handleAim(msg);
          break;
        case 'pos':
          handlePos(msg);
          break;
        case 'throw':
          handleThrow(msg);
          break;
      }
    };
  });

  // ── WebSocket connection ────────────────────────────────────────────────────

  const connect = useCallback(() => {
    setSessionId(null);
    setPlayers([]);
    setGameStarted(false);
    setIsGameOver(false);
    setScores([]);
    setCurrentPlayerId(null);
    bowlingGameRef.current = null;
    throwInFlight.current = false;

    const ws = new WebSocket(`${RELAY_URL}?role=host`);
    wsRef.current = ws;

    ws.addEventListener('open', () => setConnected(true));
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      onMessageRef.current?.(msg);
    });
    ws.addEventListener('close', () => setConnected(false));
    ws.addEventListener('error', () => setConnected(false));
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  useEffect(() => {
    if (!sessionId || !canvasRef.current) return;
    const base = PHONE_BASE?.startsWith('http') ? PHONE_BASE : `https://${PHONE_BASE}`;
    const url = `${base}?session=${sessionId}`;
    QRCode.toCanvas(canvasRef.current, url, { width: 260, margin: 2 });
  }, [sessionId]);

  // ── Game start ──────────────────────────────────────────────────────────────

  function startGame() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || players.length === 0) return;

    const game = new BowlingGame();
    players.forEach((p) => game.addPlayer(p.playerId, p.name));
    bowlingGameRef.current = game;

    const firstId = players[0].playerId;
    currentPlayerIdRef.current = firstId;
    setGameStarted(true);
    setScores(game.getScores());
    setCurrentPlayerId(firstId);

    ws.send(JSON.stringify({ type: 'game_started' }));
    ws.send(JSON.stringify({ type: 'your_turn', playerId: firstId }));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!connected) return <LostConnectionScreen onReconnect={connect} />;
  if (isGameOver) return <GameOverScreen scores={scores} />;

  if (gameStarted) {
    return (
      <GameScreen
        sceneRef={sceneRef}
        onSettle={handleSettle}
        scores={scores}
        players={players}
        currentPlayerId={currentPlayerId}
        frameResultLabel={frameResultLabel}
      />
    );
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

// ── GameScreen ────────────────────────────────────────────────────────────────

function GameScreen({ sceneRef, onSettle, scores, players, currentPlayerId, frameResultLabel }) {
  return (
    <div className="game-layout">
      <div className="game-canvas-wrap">
        <Scene ref={sceneRef} onSettle={onSettle} />
        {frameResultLabel && (
          <div className="frame-result-overlay">{frameResultLabel}</div>
        )}
      </div>
      <Scoreboard scores={scores} currentPlayerId={currentPlayerId} />
    </div>
  );
}

// ── Scoreboard ────────────────────────────────────────────────────────────────

function Scoreboard({ scores, currentPlayerId }) {
  return (
    <div className="scoreboard">
      <div className="scoreboard-title">Scores</div>
      {scores.map((playerScore) => (
        <div
          key={playerScore.id}
          className={`scoreboard-player${playerScore.id === currentPlayerId ? ' active' : ''}`}
        >
          <div className="scoreboard-name">{playerScore.name}</div>
          <div className="scoreboard-frames">
            {playerScore.frames.map((frame, i) => (
              <div key={i} className={`scoreboard-frame${i === 9 ? ' tenth' : ''}`}>
                <div className="frame-rolls">
                  {renderFrameRolls(frame.rolls, i)}
                </div>
                <div className="frame-total">
                  {frame.runningTotal ?? ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderFrameRolls(rolls, frameIndex) {
  if (frameIndex < 9) {
    const r0 = rolls[0];
    const r1 = rolls[1];
    if (r0 === 10) {
      return <><span className="roll-cell"></span><span className="roll-cell strike">X</span></>;
    }
    const s0 = r0 !== undefined ? String(r0) : '';
    const s1 = r1 !== undefined
      ? (r0 + r1 === 10 ? '/' : String(r1))
      : '';
    return <><span className="roll-cell">{s0}</span><span className="roll-cell">{s1}</span></>;
  }

  // 10th frame — up to 3 rolls
  return rolls.slice(0, 3).map((r, i) => {
    let label = String(r);
    if (r === 10) {
      label = 'X';
    } else if (i === 1 && rolls[0] !== 10 && rolls[0] + r === 10) {
      label = '/';
    } else if (i === 2 && rolls[1] !== 10 && rolls[1] + r === 10) {
      label = '/';
    }
    return <span key={i} className={`roll-cell${label === 'X' ? ' strike' : ''}`}>{label}</span>;
  });
}

// ── LobbyScreen ───────────────────────────────────────────────────────────────

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
              <li key={p.playerId} className="player-item">{p.name}</li>
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

// ── GameOverScreen ────────────────────────────────────────────────────────────

function GameOverScreen({ scores }) {
  const getTotal = (s) =>
    s.frames.map((f) => f.runningTotal).filter((t) => t !== null).at(-1) ?? 0;

  const sorted = [...scores].sort((a, b) => getTotal(b) - getTotal(a));

  return (
    <div className="game-over">
      <h1>Game Over</h1>
      <ol className="game-over-list">
        {sorted.map((s) => (
          <li key={s.id} className="game-over-item">
            <span className="go-name">{s.name}</span>
            <span className="go-score">{getTotal(s)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
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

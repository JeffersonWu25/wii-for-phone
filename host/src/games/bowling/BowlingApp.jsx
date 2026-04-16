import { useState, useEffect, useRef } from 'react';
import Scene from './Scene.jsx';
import { BowlingGame } from './BowlingGame.js';

const RESET_DELAY_MS = 1500;

// Self-contained bowling game component.
// Props:
//   wsRef      — ref to the live WebSocket (used to subscribe to messages)
//   send       — stable send(obj) function from useRelay
//   players    — [{ playerId, name }] from lobby
//   onGameOver — called when game ends (returns to hub)
//   onAbandon  — called when host quits mid-game (returns to game-select)
export default function BowlingApp({ wsRef, send, players, disconnectedPlayerIds, onGameOver, onAbandon }) {
  const [scores, setScores] = useState([]);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [frameResultLabel, setFrameResultLabel] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [waitingForReconnect, setWaitingForReconnect] = useState(null); // { playerId, name } | null

  const sceneRef = useRef(null);
  const bowlingGameRef = useRef(null);
  const throwInFlight = useRef(false);
  const pinsStandingBeforeRoll = useRef(10);
  const currentPlayerIdRef = useRef(null);
  const startedRef = useRef(false);
  const waitingForReconnectRef = useRef(null);
  const disconnectedPlayerIdsRef = useRef(disconnectedPlayerIds);

  // Keep refs in sync with state/props so stale setTimeout closures see current values.
  useEffect(() => {
    currentPlayerIdRef.current = currentPlayerId;
  }, [currentPlayerId]);

  useEffect(() => {
    waitingForReconnectRef.current = waitingForReconnect;
  }, [waitingForReconnect]);

  useEffect(() => {
    disconnectedPlayerIdsRef.current = disconnectedPlayerIds;
  }, [disconnectedPlayerIds]);

  // ── Start game on mount (guarded against StrictMode double-invocation) ───────

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const game = new BowlingGame();
    players.forEach((p) => game.addPlayer(p.playerId, p.name));
    bowlingGameRef.current = game;

    const firstId = players[0].playerId;
    currentPlayerIdRef.current = firstId;
    setScores(game.getScores());
    setCurrentPlayerId(firstId);

    send({ type: 'game_started' });
    send({ type: 'your_turn', playerId: firstId, game_type: 'bowling' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Subscribe to phone messages via the shared WebSocket ─────────────────────

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    function onMessage(e) {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'pos':
        case 'aim':
          if (msg.playerId !== currentPlayerIdRef.current) return;
          if (throwInFlight.current) return;
          sceneRef.current?.previewBall(msg.aimOffset ?? 0, msg.aimAngle ?? 0);
          break;
        case 'throw':
          if (msg.playerId !== currentPlayerIdRef.current) return;
          if (throwInFlight.current) return;
          throwInFlight.current = true;
          sceneRef.current?.throwBall(msg.power, msg.aimAngle ?? 0, msg.spin, msg.aimOffset ?? 0);
          break;
        case 'player_disconnected':
          // If the current player disconnects before throwing, pause immediately.
          if (msg.playerId === currentPlayerIdRef.current && !throwInFlight.current) {
            throwInFlight.current = true;
            setWaitingForReconnect({ playerId: msg.playerId, name: msg.name });
          }
          break;
        case 'player_reconnected':
          if (waitingForReconnectRef.current?.playerId === msg.playerId) {
            throwInFlight.current = false;
            setWaitingForReconnect(null);
            send({ type: 'your_turn', playerId: msg.playerId, game_type: 'bowling' });
          }
          break;
      }
    }

    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  // wsRef is a stable ref object — this effect runs once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Turn advancement ──────────────────────────────────────────────────────────

  // Sends your_turn to a player, or pauses if they are currently disconnected.
  function sendYourTurnOrPause(id) {
    if (disconnectedPlayerIdsRef.current.has(id)) {
      const info = players.find((p) => p.playerId === id);
      throwInFlight.current = true;
      setWaitingForReconnect({ playerId: id, name: info?.name ?? id });
    } else {
      throwInFlight.current = false;
      setWaitingForReconnect(null);
      send({ type: 'your_turn', playerId: id, game_type: 'bowling' });
    }
  }

  // Skip the disconnected player's remaining rolls this frame (records 0s).
  function handleSkip() {
    const game = bowlingGameRef.current;
    if (!game) return;

    const skippedId = waitingForReconnectRef.current?.playerId ?? currentPlayerIdRef.current;

    let result;
    do {
      result = game.recordRoll(0);
    } while (!result.advancedPlayer);

    const updatedScores = game.getScores();
    setScores(updatedScores);
    send({ type: 'throw_result', playerId: skippedId, pinsKnocked: 0, frameScore: null, totalScore: 0 });
    setWaitingForReconnect(null);

    if (result.gameOver) {
      throwInFlight.current = false;
      send({ type: 'game_over', scores: updatedScores });
      setIsGameOver(true);
    } else {
      sceneRef.current?.resetPins();
      pinsStandingBeforeRoll.current = 10;
      const nextId = game.getCurrentPlayer().id;
      currentPlayerIdRef.current = nextId;
      setCurrentPlayerId(nextId);
      sendYourTurnOrPause(nextId);
    }
  }

  // ── Settle callback (called by physics after pins come to rest) ───────────────

  function handleSettle(standingCount) {
    const game = bowlingGameRef.current;
    if (!game) return;

    const isFirstRoll = game.currentRoll === 0;
    const pinsKnocked = isFirstRoll
      ? 10 - standingCount
      : pinsStandingBeforeRoll.current - standingCount;

    const pinsRemaining = game.pinsRemainingThisFrame();
    const frameScore =
      isFirstRoll && pinsKnocked === 10 ? 'strike' :
      !isFirstRoll && pinsKnocked >= pinsRemaining ? 'spare' :
      null;

    const { advancedPlayer, gameOver } = game.recordRoll(pinsKnocked);
    const updatedScores = game.getScores();
    setScores(updatedScores);

    const playerRow = updatedScores.find((s) => s.id === currentPlayerIdRef.current);
    const totalScore = playerRow?.frames
      .map((f) => f.runningTotal)
      .filter((t) => t !== null)
      .at(-1) ?? 0;

    send({
      type: 'throw_result',
      playerId: currentPlayerIdRef.current,
      pinsKnocked,
      frameScore,
      totalScore,
    });

    if (frameScore) {
      setFrameResultLabel(frameScore === 'strike' ? 'STRIKE!' : 'SPARE!');
      setTimeout(() => setFrameResultLabel(null), RESET_DELAY_MS);
    }

    if (advancedPlayer) {
      setTimeout(() => {
        sceneRef.current?.resetPins();
        pinsStandingBeforeRoll.current = 10;

        if (gameOver) {
          throwInFlight.current = false;
          send({ type: 'game_over', scores: updatedScores });
          setIsGameOver(true);
        } else {
          const nextId = game.getCurrentPlayer().id;
          currentPlayerIdRef.current = nextId;
          setCurrentPlayerId(nextId);
          sendYourTurnOrPause(nextId);
        }
      }, RESET_DELAY_MS);
    } else {
      pinsStandingBeforeRoll.current = standingCount;
      setTimeout(() => {
        sceneRef.current?.resetBall();
        sendYourTurnOrPause(currentPlayerIdRef.current);
      }, RESET_DELAY_MS);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isGameOver) {
    return <GameOverScreen scores={scores} onReturnToHub={onGameOver} />;
  }

  return (
    <div className="game-layout">
      <div className="game-canvas-wrap">
        <Scene ref={sceneRef} onSettle={handleSettle} />
        {frameResultLabel && (
          <div className="frame-result-overlay">{frameResultLabel}</div>
        )}
        {waitingForReconnect && (
          <div className="reconnect-overlay">
            <p>Waiting for <strong>{waitingForReconnect.name}</strong> to reconnect…</p>
            <button className="btn-skip" onClick={handleSkip}>Skip Turn</button>
          </div>
        )}
        <button className="btn-abandon" onClick={onAbandon}>← Games</button>
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

  return rolls.slice(0, 3).map((r, i) => {
    let label = String(r);
    if (r === 10) label = 'X';
    else if (i === 1 && rolls[0] !== 10 && rolls[0] + r === 10) label = '/';
    else if (i === 2 && rolls[1] !== 10 && rolls[1] + r === 10) label = '/';
    return <span key={i} className={`roll-cell${label === 'X' ? ' strike' : ''}`}>{label}</span>;
  });
}

// ── GameOverScreen ────────────────────────────────────────────────────────────

function GameOverScreen({ scores, onReturnToHub }) {
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
      <button className="btn-start" onClick={onReturnToHub}>Back to Games</button>
    </div>
  );
}

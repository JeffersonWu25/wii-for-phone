import { useState } from 'react';
import { lineupFromAssignments, seatPlayers } from './teamSeat.js';
import './team.css';

const LENGTHS = [
  { bestOf: 1, label: 'One game' },
  { bestOf: 3, label: 'Best of 3' },
  { bestOf: 5, label: 'Best of 5' },
];

export default function TeamSelect({ players, onStart, onBack }) {
  const [setup, setSetup] = useState(() => seatPlayers(players));
  const lineup = lineupFromAssignments(players, setup.assignments);
  const formatLabel = lineup.format ?? 'Need 2 to 4 players';

  function assign(playerId, seat) {
    setSetup((current) => ({
      ...current,
      assignments: { ...current.assignments, [playerId]: seat },
    }));
  }

  function start() {
    if (!lineup.legal) return;
    onStart({
      sideA: lineup.sideA,
      sideB: lineup.sideB,
      bestOf: setup.bestOf,
    });
  }

  return (
    <div className="tennis-teams">
      <header className="tennis-top">
        <h1 className="tennis-title">Choose sides</h1>
        <p className="tennis-format">{formatLabel}</p>
      </header>
      <ol className="tennis-roster">
        {players.map((player) => {
          const seat = setup.assignments[player.playerId] ?? 'out';
          return (
            <li
              key={player.playerId}
              className="tennis-player"
              data-player-id={player.playerId}
            >
              <span className="tennis-name">{player.name}</span>
              <div className="tennis-seats">
                <button
                  type="button"
                  className="tennis-side-a"
                  aria-pressed={seat === 'A'}
                  onClick={() => assign(player.playerId, 'A')}
                >
                  Side A
                </button>
                <button
                  type="button"
                  className="tennis-side-b"
                  aria-pressed={seat === 'B'}
                  onClick={() => assign(player.playerId, 'B')}
                >
                  Side B
                </button>
                <button
                  type="button"
                  className="tennis-sit"
                  aria-pressed={seat === 'out'}
                  onClick={() => assign(player.playerId, 'out')}
                >
                  Sit out
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="tennis-lengths">
        <p className="tennis-length-label">Match length</p>
        <div className="tennis-length-options">
          {LENGTHS.map(({ bestOf, label }) => (
            <button
              key={bestOf}
              type="button"
              className="tennis-length"
              data-best-of={bestOf}
              aria-pressed={setup.bestOf === bestOf}
              onClick={() => setSetup((current) => ({ ...current, bestOf }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tennis-actions">
        <button type="button" className="tennis-back" onClick={onBack}>
          Back
        </button>
        <button type="button" className="tennis-start" disabled={!lineup.legal} onClick={start}>
          Start
        </button>
      </div>
    </div>
  );
}

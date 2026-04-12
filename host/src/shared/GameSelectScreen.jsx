// Game selection screen — shown after lobby, before a game starts.
// Broadcasts game_selected to the relay so phones can load the right UI.
// Only Bowling is active; all other games show "Coming Soon".

const GAMES = [
  { id: 'bowling',     label: 'Bowling',       emoji: '🎳', active: true  },
  { id: 'wizard-duel', label: 'Wizard Duel',   emoji: '🧙', active: false },
  { id: '3pt-contest', label: '3PT Contest',   emoji: '🏀', active: false },
  { id: 'tennis',      label: 'Tennis',        emoji: '🎾', active: false },
  { id: 'golf',        label: 'Golf',          emoji: '⛳', active: false },
  { id: 'piano-master',label: 'Piano Master',  emoji: '🎹', active: false },
];

export default function GameSelectScreen({ send, onSelect }) {
  function handleSelect(game) {
    if (!game.active) return;
    send({ type: 'game_selected', game: game.id });
    onSelect(game.id);
  }

  return (
    <div className="game-select-screen">
      <h1 className="game-select-title">Choose a Game</h1>
      <div className="game-select-grid">
        {GAMES.map((game) => (
          <button
            key={game.id}
            className={`game-card${game.active ? '' : ' disabled'}`}
            onClick={() => handleSelect(game)}
            disabled={!game.active}
          >
            <span className="game-card-emoji">{game.emoji}</span>
            <span className="game-card-label">{game.label}</span>
            {!game.active && <span className="game-card-soon">Coming Soon</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

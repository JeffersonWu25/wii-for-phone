// Game selection screen — shown after lobby, before a game starts.
// Broadcasts game_selected to the relay so phones can load the right UI.

const GAMES = [
  { id: 'bowling',      label: 'Bowling',      emoji: '🎳', built: true  },
  { id: 'wizard-duel',  label: 'Wizard Duel',  emoji: '🧙', built: false },
  { id: '3pt-contest',  label: '3PT Contest',  emoji: '🏀', built: false },
  { id: 'tennis',       label: 'Tennis',       emoji: '🎾', built: false },
  { id: 'golf',         label: 'Golf',         emoji: '⛳', built: false },
  { id: 'piano-master', label: 'Piano Master', emoji: '🎹', built: false },
];

export default function GameSelectScreen({ send, onSelect }) {
  function handleSelect(game) {
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
            className={`game-card${game.built ? '' : ' coming-soon'}`}
            onClick={() => handleSelect(game)}
          >
            <span className="game-card-emoji">{game.emoji}</span>
            <span className="game-card-label">{game.label}</span>
            {!game.built && <span className="game-card-soon">Coming Soon</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

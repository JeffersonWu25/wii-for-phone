export default function GameSettings({ open, onToggle, children }) {
  return (
    <div className="game-settings">
      <button
        type="button"
        className="game-settings-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        Settings
      </button>
      {open && (
        <div className="game-settings-panel" onClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import GameSettings from '../../shared/GameSettings.jsx';
import { KART_CONTROLS, clampKartTuning, saveKartTuning } from './tuning.js';

export default function KartSettings({ tuning, onChange }) {
  const [open, setOpen] = useState(false);

  function setKey(key, value) {
    const next = clampKartTuning({ ...tuning, [key]: value });
    saveKartTuning(next);
    onChange(next);
  }

  return (
    <GameSettings open={open} onToggle={() => setOpen((value) => !value)}>
      <div className="game-settings-form">
        {KART_CONTROLS.map(({ key, label, min, max, step }) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={tuning[key]}
              aria-label={label}
              onChange={(event) => setKey(key, Number(event.target.value))}
            />
            <span>{tuning[key].toFixed(2)}×</span>
          </label>
        ))}
      </div>
    </GameSettings>
  );
}

import { useEffect, useState } from 'react';
import { FEEL_CONTROLS, clampTuning, loadHostFeel, saveHostFeel } from '../../../phone/src/games/bowling/tuning.js';

export default function FeelSettings({ send, status }) {
  const [open, setOpen] = useState(false);
  const [feel, setFeel] = useState(loadHostFeel);

  useEffect(() => {
    if (status !== 'open') return;
    send({ type: 'feel', ...feel });
  }, [feel, status, send]);

  function setKey(key, value) {
    const next = clampTuning({ ...feel, [key]: value });
    setFeel(next);
    saveHostFeel(next);
  }

  return (
    <div className="feel-settings">
      <button type="button" className="feel-settings-btn" onClick={() => setOpen((value) => !value)}>
        Settings
      </button>
      {open && (
        <div className="feel-panel" role="dialog" aria-label="Bowling feel">
          {FEEL_CONTROLS.map(({ key, label, min, max, step }) => (
            <label key={key} className="feel-row">
              <span className="feel-name">{label}</span>
              <span className="feel-scale">
                <span>Less</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={feel[key]}
                  aria-label={label}
                  onChange={(event) => setKey(key, Number(event.target.value))}
                />
                <span>More</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

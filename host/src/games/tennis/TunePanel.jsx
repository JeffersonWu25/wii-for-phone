import { useState } from 'react';
import { getTuning, resetTuning, setTuning } from './tuning.js';

const GROUPS = [
  {
    title: 'Timing',
    controls: [
      { key: 'timingWindowMs', label: 'Swing timing forgiveness', min: 40, max: 400, step: 1 },
      { key: 'directionSensitivity', label: 'Shot direction sensitivity', min: 0, max: 2.5, step: 0.05 },
      { key: 'swingCooldown', label: 'Swing cooldown', min: 0, max: 1.2, step: 0.01 },
    ],
  },
  {
    title: 'Movement',
    controls: [
      { key: 'interceptLead', label: 'Interception lead time', min: 0, max: 0.8, step: 0.01 },
      { key: 'moveSpeed', label: 'Player movement speed', min: 4, max: 16, step: 0.1 },
      { key: 'reach', label: 'Racket hitbox size', min: 0.6, max: 3.5, step: 0.05 },
      { key: 'cpuDifficulty', label: 'CPU difficulty', min: 0, max: 1, step: 0.05 },
    ],
    checkbox: { key: 'volleyPriority', label: 'Automatic volley priority' },
  },
  {
    title: 'Shots',
    controls: [
      { key: 'powerSensitivity', label: 'Swing power sensitivity', min: 0.2, max: 2, step: 0.05 },
      { key: 'lobSlice', label: 'Lob and slice intensity', min: 0, max: 2, step: 0.05 },
    ],
  },
];

function decimalsFor(step) {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function formatStep(value, step) {
  return Number(value).toFixed(decimalsFor(step));
}

export function TuneButton({ pressed, onToggle }) {
  return (
    <button
      type="button"
      className="tennis-tune"
      aria-pressed={pressed}
      onClick={onToggle}
    >
      Tune
    </button>
  );
}

export default function TunePanel({ open }) {
  const [values, setValues] = useState(() => getTuning());

  function apply(partial) {
    setValues(setTuning(partial));
  }

  return (
    <div className="tennis-tune-panel" hidden={!open}>
      {GROUPS.map((group) => (
        <section key={group.title} className="tennis-tune-group">
          <h2>{group.title}</h2>
          {group.controls.map((control) => (
            <label key={control.key} className="tennis-tune-row">
              <span className="tennis-tune-label">{control.label}</span>
              <span className="tennis-tune-value">{formatStep(values[control.key], control.step)}</span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={values[control.key]}
                aria-label={control.label}
                onChange={(event) => apply({ [control.key]: Number(event.target.value) })}
              />
            </label>
          ))}
          {group.checkbox && (
            <label className="tennis-tune-check">
              <input
                type="checkbox"
                checked={values[group.checkbox.key]}
                aria-label={group.checkbox.label}
                onChange={(event) => apply({ [group.checkbox.key]: event.target.checked })}
              />
              <span className="tennis-tune-label">{group.checkbox.label}</span>
              <span className="tennis-tune-value">{values[group.checkbox.key] ? 'on' : 'off'}</span>
            </label>
          )}
        </section>
      ))}
      <button
        type="button"
        className="tennis-tune-reset"
        onClick={() => setValues(resetTuning())}
      >
        Reset
      </button>
    </div>
  );
}

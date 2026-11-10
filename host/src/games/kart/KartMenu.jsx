import { useEffect, useMemo, useState } from 'react';
import { CUPS, STANDALONE, TRACKS, loadTrack } from './tracks/index.js';
import { fitMinimap, ordinal } from './hud.js';

const THUMB_W = 150;
const THUMB_H = 96;

// Small outline of a track from its samples.
function TrackThumb({ trackId }) {
  const path = useMemo(() => fitMinimap(loadTrack(trackId).samples, THUMB_W, THUMB_H, 10, 8).path, [trackId]);
  return (
    <svg className="kart-thumb" viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} aria-hidden="true">
      <path d={path} className="kart-thumb-shade" />
      <path d={path} className="kart-thumb-road" />
    </svg>
  );
}

function CupCard({ cup, selected, onPick, onHover }) {
  return (
    <div className="kart-cup-card" data-cup={cup.id} data-selected={selected ? '1' : undefined} role="button" tabIndex={-1} onClick={onPick} onMouseEnter={onHover}>
      <h2>{cup.name}</h2>
      <div className="kart-cup-slots">
        {cup.tracks.map((id, i) => (id ? (
          <div className="kart-cup-slot" data-track={id} key={i}>
            <TrackThumb trackId={id} />
            <span className="kart-cup-slot-name">{TRACKS[id].name}</span>
          </div>
        ) : (
          <div className="kart-cup-slot" data-locked="1" key={i}>
            <span className="kart-lock" aria-hidden="true">🔒</span>
            <span className="kart-cup-slot-name">Coming soon</span>
          </div>
        )))}
      </div>
    </div>
  );
}

function TrackCard({ id, selected, onPick, onHover }) {
  return (
    <div className="kart-track-card" data-track={id} data-selected={selected ? '1' : undefined} role="button" tabIndex={-1} onClick={onPick} onMouseEnter={onHover}>
      <TrackThumb trackId={id} />
      <h2>{TRACKS[id].name}</h2>
    </div>
  );
}

// Arrow keys move between the cards, Enter picks, Escape leaves.
export function KartMenu({ onPickCup, onPickTrack, onBack }) {
  const cards = useMemo(() => [
    ...CUPS.map((c) => ({ kind: 'cup', id: c.id })),
    ...STANDALONE.map((id) => ({ kind: 'track', id })),
  ], []);
  const [index, setIndex] = useState(0);

  const pick = (card) => (card.kind === 'cup' ? onPickCup(card.id) : onPickTrack(card.id));

  useEffect(() => {
    function onKey(e) {
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') setIndex((i) => (i + 1) % cards.length);
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') setIndex((i) => (i + cards.length - 1) % cards.length);
      else if (e.code === 'Enter') pick(cards[index]);
      else if (e.code === 'Escape') onBack();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="kart-menu">
      <button className="kart-menu-back" onClick={onBack}>Back</button>
      <h1>Choose a map</h1>
      <div className="kart-menu-cards">
        {cards.map((card, i) => (card.kind === 'cup'
          ? <CupCard key={card.id} cup={CUPS.find((c) => c.id === card.id)} selected={i === index} onPick={() => pick(card)} onHover={() => setIndex(i)} />
          : <TrackCard key={card.id} id={card.id} selected={i === index} onPick={() => pick(card)} onHover={() => setIndex(i)} />))}
      </div>
      <p className="kart-menu-hint">Arrows to choose, Enter to race</p>
    </div>
  );
}

function StandingRow({ row }) {
  return (
    <li>
      <span className="kart-res-place">{ordinal(row.rank)}</span>
      <span className="kart-dot" style={{ background: row.color }} />
      <span className="kart-res-name">{row.name}</span>
      <span className="kart-res-time">{row.points} pts</span>
    </li>
  );
}

function useKeys(onEnter, onEscape) {
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Enter') onEnter();
      else if (e.code === 'Escape') onEscape();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

// Points so far, between two races of a cup.
export function CupStandings({ cup, standings, raceNumber, raceCount, onNext, onQuit }) {
  useKeys(onNext, onQuit);
  return (
    <div className="kart-menu kart-cup-standings">
      <div className="kart-results-card">
        <h1>{cup.name}</h1>
        <p className="kart-sub">Standings after race {raceNumber} of {raceCount}</p>
        <ol>{standings.map((row) => <StandingRow key={row.playerId} row={row} />)}</ol>
        <button className="btn-start" onClick={onNext}>Next race</button>
      </div>
    </div>
  );
}

// Top three of the finished cup, plus everyone else's points.
export function CupPodium({ cup, standings, onDone }) {
  useKeys(onDone, onDone);
  const top = standings.slice(0, 3);
  // Mario Kart order: 2nd, 1st, 3rd, so the winner stands in the middle.
  const stage = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="kart-menu kart-podium">
      <div className="kart-results-card">
        <h1>{cup.name} Podium</h1>
        <div className="kart-podium-stage">
          {stage.map((row) => (
            <div className="kart-podium-step" data-rank={row.rank} key={row.playerId}>
              <span className="kart-dot" style={{ background: row.color }} />
              <span className="kart-podium-name">{row.name}</span>
              <span className="kart-podium-pts">{row.points} pts</span>
              <div className="kart-podium-block">{row.rank}</div>
            </div>
          ))}
        </div>
        {standings.length > 3 && <ol>{standings.slice(3).map((row) => <StandingRow key={row.playerId} row={row} />)}</ol>}
        <button className="btn-start" onClick={onDone}>Back to menu</button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { CUPS } from './tracks/index.js';
import { cupStandings } from './cup.js';
import { KartMenu, CupStandings, CupPodium } from './KartMenu.jsx';
import KartRace from './KartRace.jsx';
import { loadKartTuning } from './tuning.js';

// Kart Racer host: map select, then a race per track. A cup chains its unlocked tracks and keeps points.
// view: { name: 'menu' } | { name: 'race', trackId, cup, key } | { name: 'standings' | 'podium', cup }
// cup: { def, queue, index, races } while a cup is running, else null.
export default function KartApp({ wsRef, send, players, disconnectedPlayerIds, onAbandon }) {
  const [view, setView] = useState({ name: 'menu' });
  const [tuning, setTuning] = useState(loadKartTuning);

  const toMenu = () => setView({ name: 'menu' });
  const startRace = (trackId, cup) => setView({ name: 'race', trackId, cup, key: (view.key ?? 0) + 1 });

  function pickCup(id) {
    const def = CUPS.find((c) => c.id === id);
    const queue = def.tracks.filter(Boolean);
    const cup = { def, queue, index: 0, races: [] };
    startRace(queue[0], cup);
  }

  function raceDone(results) {
    const cup = view.cup;
    if (!cup) return toMenu();
    const next = { ...cup, races: [...cup.races, results] };
    setView({ name: next.races.length < cup.queue.length ? 'standings' : 'podium', cup: next });
  }

  if (view.name === 'menu') {
    return <KartMenu onPickCup={pickCup} onPickTrack={(id) => startRace(id, null)} onBack={onAbandon} />;
  }
  if (view.name === 'standings') {
    const { cup } = view;
    return (
      <CupStandings
        cup={cup.def}
        standings={cupStandings(cup.races)}
        raceNumber={cup.races.length}
        raceCount={cup.queue.length}
        onNext={() => startRace(cup.queue[cup.races.length], { ...cup, index: cup.races.length })}
        onQuit={toMenu}
      />
    );
  }
  if (view.name === 'podium') {
    return <CupPodium cup={view.cup.def} standings={cupStandings(view.cup.races)} onDone={toMenu} />;
  }
  return (
    <KartRace
      key={view.key}
      trackId={view.trackId}
      wsRef={wsRef}
      send={send}
      players={players}
      disconnectedPlayerIds={disconnectedPlayerIds}
      tuning={tuning}
      onTuningChange={setTuning}
      doneLabel={view.cup ? 'Continue' : 'Back to menu'}
      onDone={raceDone}
      onQuit={toMenu}
    />
  );
}

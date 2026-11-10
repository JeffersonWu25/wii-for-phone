import { useState, useEffect, useRef } from 'react';
import { loadTrack } from './tracks/index.js';
import { createRace, stepRace, formatTime } from './race.js';
import { createKartScene } from './scene/createKartScene.js';
import {
  buildResults, buildStatus, countdownLabel, countdownLights, cssColor, fitMinimap, isIncoming, itemState, ordinal, playerColor, splitLayout, startTick, statusKey,
} from './hud.js';
import { Minimap, Pane } from './Hud.jsx';
import KartSettings from './KartSettings.jsx';
import { loadKartTuning } from './tuning.js';

const STATUS_INTERVAL_MS = 250; // 4 Hz; the relay allows the host 60 msgs/s
const HUD_INTERVAL_MS = 100;
const RESULTS_AUTO_EXIT_MS = 10_000;
const MAP_LONG = 260;
const MAP_SHORT = 150;
const MAX_RACERS = 4;
const DEBUG_ENTRANT = { id: 'debug', name: 'Debug' };
// The kart always accelerates: a racer with no phone input yet still drives, a disconnected one coasts.
const IDLE = { steer: 0, aimY: 0, drift: false };
const COAST = { steer: 0, aimY: 0, drift: false, throttle: 0 };
const PHONE_STALE_MS = 500; // a phone that stops streaming (backgrounded tab) falls back to IDLE
const DRIVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'];

// Self-contained Kart Racer host component. Props mirror BowlingApp.
export default function KartApp({ wsRef, send, players, disconnectedPlayerIds, onGameOver, onAbandon }) {
  const [hud, setHud] = useState(null);
  const [label, setLabel] = useState(null);
  const [results, setResults] = useState(null);
  const [map, setMap] = useState(null);
  const [layout, setLayout] = useState(null);
  const [tuning, setTuning] = useState(loadKartTuning);

  const containerRef = useRef(null);
  const dotRefs = useRef({});
  const startedRef = useRef(false);
  const disconnectedRef = useRef(disconnectedPlayerIds);
  const callbacks = useRef({});
  const resultsShownRef = useRef(false);
  const tuningRef = useRef(tuning);

  tuningRef.current = tuning;
  disconnectedRef.current = disconnectedPlayerIds;
  callbacks.current = { send, onGameOver, onAbandon };

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      send({ type: 'game_started' });
    }

    // ── Setup ─────────────────────────────────────────────────────────────────
    const lobby = players.length ? players.slice(0, MAX_RACERS).map((p) => ({ id: p.playerId, name: p.name })) : [DEBUG_ENTRANT];
    const entrants = lobby.map((p, i) => ({ ...p, color: playerColor(i) }));
    const cssById = Object.fromEntries(entrants.map((e) => [e.id, cssColor(e.color)]));
    const keyboardId = entrants[0].id;

    const track = loadTrack('sunny-meadow');
    const race = createRace(track, entrants, { seed: (Math.random() * 2 ** 32) >>> 0 });
    const scene = createKartScene(containerRef.current, track);
    scene.setKarts(entrants);
    const split = splitLayout(entrants.length);
    scene.setViews(split.views.map((v) => ({ id: entrants[v.slot].id, x: v.x, y: v.y, w: v.w, h: v.h })));
    setLayout(split);

    const mapW = split.mapTall ? MAP_SHORT : MAP_LONG;
    const mapH = split.mapTall ? MAP_LONG : MAP_SHORT;
    const fit = fitMinimap(track.samples, mapW, mapH, 14, 8, split.mapTall);
    const tick = startTick(fit.project, track.samples[0]);
    setMap({ path: fit.path, tick, start: fit.project(track.samples[0].x, track.samples[0].z), w: mapW, h: mapH, entrants: entrants.map((e) => ({ id: e.id, name: e.name, css: cssById[e.id] })) });
    resultsShownRef.current = false;
    setResults(null);

    // ── Input ─────────────────────────────────────────────────────────────────
    const phoneInputs = {};
    const pendingUse = new Set(); // player ids that pressed use since the last step
    const keys = new Set();
    const ws = wsRef.current;
    function onMessage(e) {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (!cssById[msg.playerId]) return;
      if (msg.type === 'use_item') {
        pendingUse.add(msg.playerId);
        return;
      }
      if (msg.type !== 'drive') return;
      phoneInputs[msg.playerId] = {
        steer: Math.max(-1, Math.min(1, Number(msg.steer) || 0)),
        aimY: Math.max(-1, Math.min(1, Number(msg.aimY) || 0)),
        drift: msg.drift === true,
        at: performance.now(),
      };
    }
    ws?.addEventListener('message', onMessage);

    function onKeyDown(e) {
      if (DRIVE_KEYS.includes(e.code)) {
        keys.add(e.code);
        e.preventDefault();
      } else if (e.code === 'Escape') {
        callbacks.current.onAbandon();
      } else if (e.code === 'Enter' && resultsShownRef.current) {
        callbacks.current.onGameOver();
      } else if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) {
        pendingUse.add(keyboardId);
      }
    }
    const onKeyUp = (e) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    const onResize = () => scene.resize();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);

    function keyboardInput() {
      if (!keys.size) return null;
      return {
        steer: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0),
        aimY: (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0),
        drift: keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
    }

    // ── Debug snapshot for automation ─────────────────────────────────────────
    const snapshot = {
      phase: race.phase, time: 0, countdown: race.countdown, trackLength: track.length,
      karts: race.karts.map((k) => ({ id: k.id, name: k.name })),
    };
    window.__kartState = snapshot;
    window.__kartTrack = track;
    window.__kartRace = race; // live race for the verify harness (read-only): events, entities

    // ── Loop ──────────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let statusAt = 0;
    let lastStatusKey = '';
    let lastLights = -1;
    let lastLabel = null;
    let finishHandled = false;
    let exitTimer = null;
    let disposed = false;
    const inputs = {};

    const hudSnapshot = () => ({
      slots: entrants.map((e) => {
        const k = race.karts.find((r) => r.id === e.id);
        return {
          lap: Math.min(k.lap + 1, race.laps), laps: race.laps, place: k.place, wrongWay: k.wrongWay,
          ...itemState(k), hit: k.hit?.kind ?? null, incoming: isIncoming(race, k),
        };
      }),
    });
    setHud(hudSnapshot());

    function publish(now) {
      const status = buildStatus(race, cssById);
      const key = statusKey(status);
      if (key !== lastStatusKey && now - statusAt >= STATUS_INTERVAL_MS) {
        lastStatusKey = key;
        statusAt = now;
        callbacks.current.send(status);
      }
      if (now - hudAt >= HUD_INTERVAL_MS) {
        hudAt = now;
        setHud(hudSnapshot());
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      for (const k of race.karts) {
        const phone = phoneInputs[k.id];
        inputs[k.id] = disconnectedRef.current.has(k.id) ? COAST : phone && now - phone.at < PHONE_STALE_MS ? phone : IDLE;
      }
      const kb = keyboardInput();
      if (kb) inputs[keyboardId] = kb;
      // The latest input is the aim; a use press rides on a copy so the shared IDLE / COAST stay clean.
      for (const id of pendingUse) inputs[id] = { ...inputs[id], useItem: true };
      pendingUse.clear();

      stepRace(race, inputs, dt, track, tuningRef.current);
      scene.update(race, dt);

      const lights = countdownLights(race);
      if (lights !== lastLights) {
        lastLights = lights;
        scene.setStartLights(lights);
      }
      const text = countdownLabel(race);
      if (text !== lastLabel) {
        lastLabel = text;
        setLabel(text);
      }

      for (const k of race.karts) {
        const dot = dotRefs.current[k.id];
        if (dot) {
          const [px, py] = fit.project(k.x, k.z);
          dot.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
        }
      }

      snapshot.phase = race.phase;
      snapshot.time = race.time;
      snapshot.countdown = race.countdown;
      snapshot.entities = race.entities.map((en) => ({ id: en.id, kind: en.kind, owner: en.owner, x: en.x, y: en.y, z: en.z, state: en.state, target: en.target }));
      snapshot.boxes = race.boxes.map((b) => ({ id: b.id, ready: b.ready, stacked: b.stacked }));
      race.karts.forEach((k, i) => {
        const o = snapshot.karts[i];
        o.s = k.s; o.lateral = k.lateral; o.h = k.h;
        o.x = k.x; o.y = k.y; o.z = k.z;
        o.speed = k.speed; o.lap = k.lap; o.place = k.place; o.finished = k.finished;
        o.surface = k.surface; o.wrongWay = k.wrongWay; o.nextCheckpoint = k.nextCheckpoint;
        o.vx = k.vx; o.vz = k.vz; o.boost = k.boost; o.boostLevel = k.boostLevel;
        o.drift = Object.assign(o.drift ?? {}, k.drift);
        o.item = { ...k.item }; o.hit = k.hit?.kind ?? null; o.invuln = k.invuln; o.mushroom = k.mushroom;
      });

      publish(now);

      if (race.phase === 'finished' && !finishHandled) {
        finishHandled = true;
        const payload = buildResults(race, cssById);
        resultsShownRef.current = true;
        setResults(payload.results);
        callbacks.current.send(payload);
        exitTimer = setTimeout(() => { if (!disposed) callbacks.current.onGameOver(); }, RESULTS_AUTO_EXIT_MS);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(exitTimer);
      ws?.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      scene.dispose();
      delete window.__kartState;
      delete window.__kartTrack;
      delete window.__kartRace;
    };
  // Mount-only: the race is built once from the lobby as it stands now.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="kart-app" data-players={layout?.views.length}>
      <div className="kart-canvas" ref={containerRef} />
      {layout?.views.map((v) => (
        <Pane key={v.slot} view={v} racer={hud?.slots[v.slot]} label={label} />
      ))}
      {map && (layout.map === 'quadrant'
        ? <div className="kart-map-quadrant"><Minimap map={map} dotRefs={dotRefs} /></div>
        : <Minimap map={map} dotRefs={dotRefs} />)}
      <KartSettings tuning={tuning} onChange={setTuning} />
      <button className="kart-quit" onClick={onAbandon}>Quit</button>
      {results && (
        <div className="kart-results">
          <div className="kart-results-card">
            <h1>Race Results</h1>
            <ol>
              {results.map((r) => (
                <li key={r.playerId}>
                  <span className="kart-res-place">{ordinal(r.place)}</span>
                  <span className="kart-dot" style={{ background: r.color }} />
                  <span className="kart-res-name">{r.name}</span>
                  <span className="kart-res-time">{r.time == null ? 'DNF' : formatTime(r.time)}</span>
                  <span className="kart-res-best">{r.bestLap == null ? '' : `best ${formatTime(r.bestLap)}`}</span>
                </li>
              ))}
            </ol>
            <button className="btn-start" onClick={onGameOver}>Back to games</button>
          </div>
        </div>
      )}
    </div>
  );
}

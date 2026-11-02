import { useState, useEffect, useRef } from 'react';
import { buildTrack } from './track.js';
import { createRace, stepRace, formatTime } from './race.js';
import { createKartScene } from './scene/createKartScene.js';
import {
  buildResults, buildStatus, countdownLabel, countdownLights, cssColor, fitMinimap, ordinal, playerColor, startTick, statusKey,
} from './hud.js';

const STATUS_INTERVAL_MS = 250; // 4 Hz; the relay allows the host 60 msgs/s
const HUD_INTERVAL_MS = 100;
const RESULTS_AUTO_EXIT_MS = 10_000;
const MAP_SIZE = 190;
const DEBUG_ENTRANT = { id: 'debug', name: 'Debug' };
const DRIVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

// Self-contained Kart Racer host component. Props mirror BowlingApp.
export default function KartApp({ wsRef, send, players, disconnectedPlayerIds, onGameOver, onAbandon }) {
  const [hud, setHud] = useState(null);
  const [label, setLabel] = useState(null);
  const [results, setResults] = useState(null);
  const [map, setMap] = useState(null);

  const containerRef = useRef(null);
  const dotRefs = useRef({});
  const startedRef = useRef(false);
  const disconnectedRef = useRef(disconnectedPlayerIds);
  const callbacks = useRef({});
  const resultsShownRef = useRef(false);

  disconnectedRef.current = disconnectedPlayerIds;
  callbacks.current = { send, onGameOver, onAbandon };

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      send({ type: 'game_started' });
    }

    // ── Setup ─────────────────────────────────────────────────────────────────
    const lobby = players.length ? players.map((p) => ({ id: p.playerId, name: p.name })) : [DEBUG_ENTRANT];
    const entrants = lobby.map((p, i) => ({ ...p, color: playerColor(i) }));
    const cssById = Object.fromEntries(entrants.map((e) => [e.id, cssColor(e.color)]));
    const followId = entrants[0].id;

    const track = buildTrack();
    const race = createRace(track, entrants);
    const scene = createKartScene(containerRef.current, track);
    scene.setKarts(entrants);
    scene.setFollow(followId);

    const fit = fitMinimap(track.samples, MAP_SIZE, MAP_SIZE, 14);
    const tick = startTick(fit.project, track.samples[0]);
    setMap({ path: fit.path, tick, entrants: entrants.map((e) => ({ id: e.id, css: cssById[e.id] })) });
    resultsShownRef.current = false;
    setResults(null);

    // ── Input ─────────────────────────────────────────────────────────────────
    const phoneInputs = {};
    const keys = new Set();
    const ws = wsRef.current;
    function onMessage(e) {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type !== 'drive' || !cssById[msg.playerId]) return;
      phoneInputs[msg.playerId] = {
        steer: Math.max(-1, Math.min(1, Number(msg.steer) || 0)),
        gas: msg.gas === true,
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
        gas: keys.has('ArrowUp') || keys.has('KeyW'),
        brake: keys.has('ArrowDown') || keys.has('KeyS'),
      };
    }

    // ── Debug snapshot for automation ─────────────────────────────────────────
    const snapshot = {
      phase: race.phase, time: 0, countdown: race.countdown, trackLength: track.length,
      karts: race.karts.map((k) => ({ id: k.id, name: k.name })),
    };
    window.__kartState = snapshot;
    window.__kartTrack = track;

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

    function publish(now) {
      const f = race.karts.find((k) => k.id === followId);
      const status = buildStatus(race, cssById);
      const key = statusKey(status);
      if (key !== lastStatusKey && now - statusAt >= STATUS_INTERVAL_MS) {
        lastStatusKey = key;
        statusAt = now;
        callbacks.current.send(status);
      }
      if (now - hudAt >= HUD_INTERVAL_MS) {
        hudAt = now;
        setHud({
          lap: Math.min(f.lap + 1, race.laps),
          laps: race.laps,
          time: race.time,
          place: f.place,
          total: race.karts.length,
          wrongWay: f.wrongWay,
          standings: race.standings.map((id) => ({ id, name: race.karts.find((k) => k.id === id).name, css: cssById[id] })),
        });
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      for (const k of race.karts) {
        inputs[k.id] = disconnectedRef.current.has(k.id) ? { steer: 0, gas: false } : phoneInputs[k.id] ?? { steer: 0, gas: false };
      }
      const kb = keyboardInput();
      if (kb) inputs[followId] = kb;

      stepRace(race, inputs, dt, track);
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
          dot.setAttribute('cx', px.toFixed(1));
          dot.setAttribute('cy', py.toFixed(1));
        }
      }

      snapshot.phase = race.phase;
      snapshot.time = race.time;
      snapshot.countdown = race.countdown;
      race.karts.forEach((k, i) => {
        const o = snapshot.karts[i];
        o.s = k.s; o.lateral = k.lateral; o.h = k.h;
        o.x = k.x; o.y = k.y; o.z = k.z;
        o.speed = k.speed; o.lap = k.lap; o.place = k.place; o.finished = k.finished;
        o.surface = k.surface; o.wrongWay = k.wrongWay; o.nextCheckpoint = k.nextCheckpoint;
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
    };
  // Mount-only: the race is built once from the lobby as it stands now.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="kart-app">
      <div className="kart-canvas" ref={containerRef} />
      {hud && (
        <>
          <div className="kart-panel kart-lap">LAP <b>{hud.lap}</b>/{hud.laps}</div>
          <div className="kart-panel kart-timer">{formatTime(hud.time)}</div>
          <div className="kart-place">
            <span className="kart-place-big">{ordinal(hud.place)}</span>
            <span className="kart-place-total">/{hud.total}</span>
          </div>
          <ol className="kart-standings">
            {hud.standings.map((s) => (
              <li key={s.id}><span className="kart-dot" style={{ background: s.css }} />{s.name}</li>
            ))}
          </ol>
          {hud.wrongWay && <div className="kart-wrongway">WRONG WAY</div>}
        </>
      )}
      {map && (
        <svg className="kart-minimap" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}>
          <path d={map.path} className="kart-map-outline" />
          <path d={map.path} className="kart-map-road" />
          <line x1={map.tick[0]} y1={map.tick[1]} x2={map.tick[2]} y2={map.tick[3]} className="kart-map-start" />
          {map.entrants.map((e) => (
            <circle key={e.id} ref={(el) => { dotRefs.current[e.id] = el; }} r="5" fill={e.css} className="kart-map-dot" />
          ))}
        </svg>
      )}
      {label && <div className={`kart-countdown${label === 'GO!' ? ' go' : ''}`} key={label}>{label}</div>}
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

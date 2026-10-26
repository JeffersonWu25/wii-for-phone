import { PLAYABLE_IDS, characterById, playableCharacters } from './characters.js';
import { TRACKS, outlinePath, trackById } from './tracks.js';

const PICK_PHASES = new Set(['characters', 'track', 'lobby']);

export function createLobby(roster, disconnectedIds) {
  const seats = {};
  for (const player of roster) {
    seats[player.playerId] = {
      connected: !disconnectedIds.has(player.playerId),
      characterId: null,
      ready: false,
    };
  }
  return {
    phase: 'menu',
    trackId: TRACKS[0].id,
    revision: 1,
    seats,
  };
}

export function reduce(state, event) {
  if (state.phase === 'started') return state;
  switch (event.type) {
    case 'advance':
      return reduceAdvance(state);
    case 'back':
      return reduceBack(state);
    case 'select_track':
      return reduceSelectTrack(state, event);
    case 'start':
      return reduceStart(state);
    case 'roster_sync':
      return reduceRoster(state, event);
    case 'pick':
      return reducePick(state, event);
    case 'ready':
      return reduceReady(state, event);
    default:
      return state;
  }
}

export function project(state, roster) {
  const entry = trackById(state.trackId);
  if (!entry) throw new Error(`unknown track ${state.trackId}`);
  const racers = roster.map((row) => racerRow(state, row));
  const catalog = playableCharacters().map((character) => ({
    id: character.id,
    name: character.name,
    css: character.css,
    pickedBy: racers
      .filter((racer) => racer.characterId === character.id)
      .map((racer) => ({ playerId: racer.playerId, name: racer.name })),
  }));
  const view = {
    phase: state.phase,
    revision: state.revision,
    track: {
      id: entry.id,
      name: entry.name,
      blurb: entry.blurb,
      outline: outlinePath(entry.track).d,
    },
    tracks: TRACKS.map((row) => ({
      id: row.id,
      name: row.name,
      blurb: row.blurb,
      selected: row.id === state.trackId,
    })),
    catalog,
    racers,
    primary: primaryView(state, roster),
    back: state.phase === 'menu'
      ? { label: 'Back to games', kind: 'abandon' }
      : { label: 'Back', kind: 'back' },
  };
  const wire = {
    type: 'kart_lobby',
    revision: state.revision,
    phase: state.phase,
    trackId: entry.id,
    trackName: entry.name,
    catalog: catalog.map(({ id, name, css }) => ({ id, name, css })),
    racers,
  };
  return {
    view,
    wire,
    setup: state.phase === 'started' ? handoff(state, roster) : null,
  };
}

export function eventFromPhone(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (typeof msg.playerId !== 'string' || msg.playerId === '') return null;
  if (msg.type === 'kart_pick' && typeof msg.characterId === 'string') {
    return { type: 'pick', playerId: msg.playerId, characterId: msg.characterId };
  }
  if (msg.type === 'kart_ready' && typeof msg.ready === 'boolean') {
    return { type: 'ready', playerId: msg.playerId, ready: msg.ready };
  }
  return null;
}

export const commands = {
  advance() {
    return { type: 'advance' };
  },
  back() {
    return { type: 'back' };
  },
  selectTrack(trackId) {
    return { type: 'select_track', trackId };
  },
  start() {
    return { type: 'start' };
  },
  rosterSync(entries) {
    return { type: 'roster_sync', entries };
  },
};

function nextState(state, patch) {
  return {
    phase: patch.phase === undefined ? state.phase : patch.phase,
    trackId: patch.trackId === undefined ? state.trackId : patch.trackId,
    revision: state.revision + 1,
    seats: patch.seats === undefined ? state.seats : patch.seats,
  };
}

function connectedSeats(state) {
  const seats = [];
  for (const seat of Object.values(state.seats)) {
    if (seat.connected) seats.push(seat);
  }
  return seats;
}

function characterGate(state) {
  const seats = connectedSeats(state);
  return seats.length > 0 && seats.every((seat) => seat.characterId);
}

function readyGate(state) {
  const seats = connectedSeats(state);
  return seats.length > 0 && seats.every((seat) => seat.ready);
}

function reduceAdvance(state) {
  if (state.phase === 'menu') return nextState(state, { phase: 'characters' });
  if (state.phase === 'characters') {
    if (!characterGate(state)) return state;
    return nextState(state, { phase: 'track' });
  }
  if (state.phase === 'track') return nextState(state, { phase: 'lobby' });
  return state;
}

function reduceBack(state) {
  if (state.phase === 'characters') return nextState(state, { phase: 'menu' });
  if (state.phase === 'track') return nextState(state, { phase: 'characters' });
  if (state.phase === 'lobby') {
    return nextState(state, { phase: 'track', seats: clearReady(state.seats) });
  }
  return state;
}

function clearReady(seats) {
  let next = seats;
  let dirty = false;
  for (const [playerId, seat] of Object.entries(seats)) {
    if (!seat.ready) continue;
    if (!dirty) {
      next = { ...seats };
      dirty = true;
    }
    next[playerId] = { ...seat, ready: false };
  }
  return next;
}

function reduceSelectTrack(state, event) {
  if (state.phase !== 'track') return state;
  const entry = trackById(event.trackId);
  if (!entry || entry.id === state.trackId) return state;
  return nextState(state, { trackId: entry.id });
}

function reduceStart(state) {
  if (state.phase !== 'lobby' || !readyGate(state)) return state;
  return nextState(state, { phase: 'started' });
}

function reduceRoster(state, event) {
  let seats = state.seats;
  let dirty = false;
  for (const entry of event.entries) {
    const prev = seats[entry.playerId];
    if (prev && prev.connected === entry.connected) continue;
    if (!dirty) {
      seats = { ...seats };
      dirty = true;
    }
    if (!prev) {
      seats[entry.playerId] = {
        connected: entry.connected,
        characterId: null,
        ready: false,
      };
      continue;
    }
    seats[entry.playerId] = {
      connected: entry.connected,
      characterId: prev.characterId,
      ready: false,
    };
  }
  if (!dirty) return state;
  return nextState(state, { seats });
}

function reducePick(state, event) {
  if (!PICK_PHASES.has(state.phase)) return state;
  if (!PLAYABLE_IDS.includes(event.characterId)) return state;
  const prev = state.seats[event.playerId];
  if (!prev) {
    return nextState(state, {
      seats: {
        ...state.seats,
        [event.playerId]: {
          connected: true,
          characterId: event.characterId,
          ready: false,
        },
      },
    });
  }
  if (!prev.connected || prev.characterId === event.characterId) return state;
  return nextState(state, {
    seats: {
      ...state.seats,
      [event.playerId]: {
        connected: prev.connected,
        characterId: event.characterId,
        ready: false,
      },
    },
  });
}

function reduceReady(state, event) {
  if (state.phase !== 'lobby') return state;
  const prev = state.seats[event.playerId];
  if (!prev || !prev.connected || !prev.characterId) return state;
  if (prev.ready === event.ready) return state;
  return nextState(state, {
    seats: {
      ...state.seats,
      [event.playerId]: { ...prev, ready: event.ready },
    },
  });
}

function seatSurface(phase, seat) {
  const picked = seat.characterId != null;
  if (phase === 'menu') return 'splash';
  if (phase === 'characters') return 'pick';
  if (phase === 'track') return picked ? 'holding' : 'pick';
  if (phase === 'lobby') return picked ? 'ready' : 'pick';
  if (phase === 'started') return 'holding';
  return 'splash';
}

function racerRow(state, row) {
  const seat = state.seats[row.playerId] || {
    connected: true,
    characterId: null,
    ready: false,
  };
  const character = seat.characterId ? characterById(seat.characterId) : null;
  return {
    playerId: row.playerId,
    name: row.name,
    characterId: seat.characterId,
    characterName: character ? character.name : null,
    css: character ? character.css : null,
    ready: seat.ready,
    connected: seat.connected,
    surface: seatSurface(state.phase, seat),
  };
}

function blockerHint(state, roster, blocks) {
  const names = [];
  for (const row of roster) {
    const seat = state.seats[row.playerId];
    if (!seat || !seat.connected || !blocks(seat)) continue;
    names.push(row.name);
  }
  if (names.length === 0) return 'Waiting for racers';
  return `Waiting for ${names.join(', ')}`;
}

function primaryView(state, roster) {
  if (state.phase === 'menu') {
    return { label: 'Race', event: { type: 'advance' }, enabled: true, hint: null };
  }
  if (state.phase === 'characters') {
    const enabled = characterGate(state);
    return {
      label: 'Continue',
      event: { type: 'advance' },
      enabled,
      hint: enabled ? null : blockerHint(state, roster, (seat) => !seat.characterId),
    };
  }
  if (state.phase === 'track') {
    return { label: 'Continue', event: { type: 'advance' }, enabled: true, hint: null };
  }
  if (state.phase === 'lobby') {
    const enabled = readyGate(state);
    return {
      label: 'Start Race',
      event: { type: 'start' },
      enabled,
      hint: enabled ? null : blockerHint(state, roster, (seat) => !seat.ready),
    };
  }
  return { label: 'Start Race', event: { type: 'start' }, enabled: false, hint: null };
}

function handoff(state, roster) {
  const entry = trackById(state.trackId);
  if (!entry) throw new Error(`unknown track ${state.trackId}`);
  const players = [];
  for (const row of roster) {
    const seat = state.seats[row.playerId];
    if (!seat || !seat.connected) continue;
    if (!seat.characterId) throw new Error(`connected racer ${row.playerId} has no character`);
    players.push({
      playerId: row.playerId,
      name: row.name,
      characterId: seat.characterId,
    });
  }
  if (players.length === 0) throw new Error('no connected racers');
  return { players, track: entry.track };
}

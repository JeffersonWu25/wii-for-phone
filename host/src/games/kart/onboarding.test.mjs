import test from 'node:test';
import assert from 'node:assert/strict';
import { poseAt } from './track.js';
import { commands, createLobby, eventFromPhone, project, reduce } from './onboarding.js';

const ada = { playerId: 'ada', name: 'Ada' };
const bo = { playerId: 'bo', name: 'Bo' };
const cy = { playerId: 'cy', name: 'Cy' };

function lobby(players, disconnected = []) {
  return createLobby(players, new Set(disconnected));
}

function pick(state, playerId, characterId) {
  return reduce(state, { type: 'pick', playerId, characterId });
}

function ready(state, playerId, value) {
  return reduce(state, { type: 'ready', playerId, ready: value });
}

test('a fresh lobby is the menu on Luigi Circuit and seats disconnected rows', () => {
  const state = lobby([ada, bo], ['bo']);
  assert.equal(state.phase, 'menu');
  assert.equal(state.revision, 1);
  assert.equal(state.trackId, 'luigi-circuit');
  assert.deepEqual(state.seats.ada, { connected: true, characterId: null, ready: false });
  assert.deepEqual(state.seats.bo, { connected: false, characterId: null, ready: false });

  const projected = project(state, [ada, bo]);
  assert.equal(projected.setup, null);
  assert.equal(projected.view.primary.label, 'Race');
  assert.equal(projected.view.primary.enabled, true);
  assert.equal(projected.view.primary.hint, null);
  assert.deepEqual(projected.view.back, { label: 'Back to games', kind: 'abandon' });
  assert.equal(projected.wire.type, 'kart_lobby');
  assert.equal(projected.wire.revision, 1);
  assert.equal(projected.wire.phase, 'menu');
  assert.equal(projected.wire.trackId, 'luigi-circuit');
  assert.equal(projected.wire.trackName, 'Luigi Circuit');
  assert.equal(projected.wire.racers[0].surface, 'splash');
  assert.equal(projected.wire.racers[1].surface, 'splash');
  assert.equal(projected.wire.racers[1].connected, false);
});

test('Race stays enabled when nobody has joined', () => {
  const projected = project(lobby([]), []);
  assert.equal(projected.view.phase, 'menu');
  assert.equal(projected.view.primary.enabled, true);
  assert.equal(projected.view.primary.event.type, 'advance');
});

test('two phones can pick the same character and reach the start gate', () => {
  let state = lobby([ada, bo]);
  state = reduce(state, commands.advance());
  assert.equal(state.phase, 'characters');
  assert.equal(state.revision, 2);

  const blocked = reduce(state, commands.advance());
  assert.equal(blocked, state);
  assert.equal(project(state, [ada, bo]).view.primary.enabled, false);
  assert.equal(project(state, [ada, bo]).view.primary.hint, 'Waiting for Ada, Bo');

  state = pick(state, 'ada', 'peach');
  assert.equal(project(state, [ada, bo]).view.primary.hint, 'Waiting for Bo');
  state = pick(state, 'bo', 'peach');
  const characters = project(state, [ada, bo]);
  assert.equal(characters.view.primary.enabled, true);
  assert.equal(characters.view.primary.hint, null);
  const peach = characters.view.catalog.find((row) => row.id === 'peach');
  assert.deepEqual(peach.pickedBy.map((racer) => racer.name), ['Ada', 'Bo']);

  state = reduce(state, characters.view.primary.event);
  assert.equal(state.phase, 'track');
  assert.equal(state.trackId, 'luigi-circuit');
  const trackView = project(state, [ada, bo]).view;
  assert.equal(trackView.primary.label, 'Continue');
  assert.equal(trackView.primary.enabled, true);
  assert.equal(trackView.tracks.filter((row) => row.selected).length, 1);
  assert.ok(trackView.track.outline.startsWith('M'));
  assert.ok(trackView.track.outline.endsWith('Z'));

  state = reduce(state, commands.advance());
  assert.equal(state.phase, 'lobby');
  const lobbyView = project(state, [ada, bo]);
  assert.equal(lobbyView.view.primary.label, 'Start Race');
  assert.equal(lobbyView.view.primary.enabled, false);
  assert.equal(lobbyView.view.primary.hint, 'Waiting for Ada, Bo');
  assert.equal(lobbyView.wire.racers[0].surface, 'ready');
  assert.equal(lobbyView.wire.racers[0].ready, false);

  const still = reduce(state, commands.start());
  assert.equal(still, state);

  state = ready(state, 'ada', true);
  assert.equal(project(state, [ada, bo]).view.primary.hint, 'Waiting for Bo');
  state = ready(state, 'bo', true);
  assert.equal(project(state, [ada, bo]).view.primary.enabled, true);

  const started = reduce(state, commands.start());
  assert.equal(started.phase, 'started');
  assert.ok(started.revision > state.revision);
  const raced = project(started, [ada, bo]);
  assert.equal(raced.setup.players.map((row) => row.characterId).join(), 'peach,peach');
  assert.equal(raced.setup.players.map((row) => row.playerId).join(), 'ada,bo');
  assert.equal(raced.setup.track.poseAt, poseAt);
  assert.equal(raced.wire.phase, 'started');
  assert.equal(raced.wire.racers[0].surface, 'holding');
  assert.equal(raced.wire.racers[1].surface, 'holding');
});

test('an empty character screen and a failed ready gate keep the same state', () => {
  const characters = reduce(lobby([]), commands.advance());
  assert.equal(reduce(characters, commands.advance()), characters);
  assert.equal(project(characters, []).view.primary.hint, 'Waiting for racers');

  let state = reduce(lobby([ada]), commands.advance());
  state = pick(state, 'ada', 'mario');
  state = reduce(state, commands.advance());
  state = reduce(state, commands.advance());
  assert.equal(state.phase, 'lobby');
  assert.equal(reduce(state, commands.start()), state);
  assert.equal(project(state, [ada]).view.primary.hint, 'Waiting for Ada');

  const alone = reduce(state, commands.rosterSync([{ playerId: 'ada', connected: false }]));
  assert.equal(project(alone, [ada]).view.primary.enabled, false);
  assert.equal(project(alone, [ada]).view.primary.hint, 'Waiting for racers');
});

test('eventFromPhone accepts only stamped pick and ready bodies', () => {
  assert.equal(eventFromPhone(null), null);
  assert.equal(eventFromPhone({ type: 'kart_pick', characterId: 'peach' }), null);
  assert.equal(eventFromPhone({ type: 'kart_pick', playerId: 'ada', characterId: 1 }), null);
  assert.equal(eventFromPhone({ type: 'kart_ready', playerId: 'ada', ready: 'true' }), null);
  assert.equal(eventFromPhone({ type: 'kart_ready', playerId: '', ready: true }), null);
  assert.equal(eventFromPhone({ type: 'kart_lobby', playerId: 'ada', phase: 'menu' }), null);
  assert.equal(eventFromPhone({ type: 'drive', playerId: 'ada', gas: true }), null);

  const pickEvent = eventFromPhone({
    type: 'kart_pick',
    playerId: 'ada',
    characterId: 'not-a-racer',
    revision: 9,
    phase: 'started',
  });
  assert.deepEqual(pickEvent, { type: 'pick', playerId: 'ada', characterId: 'not-a-racer' });

  let state = reduce(lobby([ada]), commands.advance());
  assert.equal(reduce(state, pickEvent), state);

  assert.deepEqual(
    eventFromPhone({ type: 'kart_ready', playerId: 'ada', ready: false }),
    { type: 'ready', playerId: 'ada', ready: false },
  );
});

test('ready is ignored without a character, off the lobby, or while disconnected', () => {
  let state = reduce(lobby([ada, bo], ['bo']), commands.advance());
  state = pick(state, 'ada', 'luigi');
  state = reduce(state, commands.advance());
  assert.equal(state.phase, 'track');
  assert.equal(ready(state, 'ada', true), state);

  state = reduce(state, commands.advance());
  assert.equal(ready(state, 'bo', true), state);
  state = reduce(state, commands.rosterSync([
    { playerId: 'ada', connected: true },
    { playerId: 'cy', connected: true },
  ]));
  assert.equal(state.phase, 'lobby');
  assert.equal(ready(state, 'cy', true), state);
  assert.equal(state.seats.cy.characterId, null);
});

test('a different character clears ready and the same character does not', () => {
  let state = reduce(lobby([ada]), commands.advance());
  state = pick(state, 'ada', 'peach');
  state = reduce(state, commands.advance());
  state = reduce(state, commands.advance());
  state = ready(state, 'ada', true);
  assert.equal(state.seats.ada.ready, true);

  const same = pick(state, 'ada', 'peach');
  assert.equal(same, state);
  assert.equal(same.seats.ada.ready, true);

  const changed = pick(state, 'ada', 'daisy');
  assert.equal(changed.seats.ada.characterId, 'daisy');
  assert.equal(changed.seats.ada.ready, false);
  assert.notEqual(changed, state);
});

test('back from the lobby clears ready and keeps the character and the track', () => {
  let state = reduce(lobby([ada, bo]), commands.advance());
  state = pick(state, 'ada', 'daisy');
  state = pick(state, 'bo', 'mario');
  state = reduce(state, commands.advance());
  assert.equal(reduce(state, commands.selectTrack('luigi-circuit')), state);
  assert.equal(reduce(state, commands.selectTrack('rainbow')), state);
  state = reduce(state, commands.advance());
  state = ready(state, 'ada', true);
  state = ready(state, 'bo', true);

  const track = reduce(state, commands.back());
  assert.equal(track.phase, 'track');
  assert.equal(track.trackId, 'luigi-circuit');
  assert.equal(track.seats.ada.characterId, 'daisy');
  assert.equal(track.seats.bo.characterId, 'mario');
  assert.equal(track.seats.ada.ready, false);
  assert.equal(track.seats.bo.ready, false);

  const characters = reduce(track, commands.back());
  assert.equal(characters.phase, 'characters');
  assert.equal(characters.trackId, 'luigi-circuit');
  assert.equal(characters.seats.ada.characterId, 'daisy');

  const menu = reduce(characters, commands.back());
  assert.equal(menu.phase, 'menu');
  assert.equal(menu.trackId, 'luigi-circuit');
  assert.equal(menu.seats.ada.characterId, 'daisy');
  assert.equal(project(menu, [ada, bo]).wire.racers[0].surface, 'splash');
  assert.equal(reduce(menu, commands.back()), menu);
});

test('roster sync clears ready on disconnect, leaves a rejoin unready, and keeps other ready seats', () => {
  let state = reduce(lobby([ada]), commands.advance());
  state = pick(state, 'ada', 'peach');
  state = reduce(state, commands.advance());
  state = reduce(state, commands.advance());
  state = ready(state, 'ada', true);

  const same = reduce(state, commands.rosterSync([{ playerId: 'ada', connected: true }]));
  assert.equal(same, state);

  const dropped = reduce(state, commands.rosterSync([{ playerId: 'ada', connected: false }]));
  assert.equal(dropped.seats.ada.connected, false);
  assert.equal(dropped.seats.ada.ready, false);
  assert.equal(dropped.seats.ada.characterId, 'peach');

  const rejoined = reduce(dropped, commands.rosterSync([{ playerId: 'ada', connected: true }]));
  assert.equal(rejoined.seats.ada.connected, true);
  assert.equal(rejoined.seats.ada.ready, false);
  assert.equal(rejoined.seats.ada.characterId, 'peach');

  const withBo = reduce(state, commands.rosterSync([
    { playerId: 'ada', connected: true },
    { playerId: 'bo', connected: true },
  ]));
  assert.equal(withBo.seats.ada.ready, true);
  assert.deepEqual(withBo.seats.bo, { connected: true, characterId: null, ready: false });
  assert.equal(state.seats.bo, undefined);
});

test('a pick for an unknown seat upserts a connected racer and survives roster sync', () => {
  const menu = lobby([]);
  assert.equal(pick(menu, 'ada', 'peach'), menu);
  let state = reduce(menu, commands.advance());

  const seated = pick(state, 'ada', 'daisy');
  assert.deepEqual(seated.seats.ada, { connected: true, characterId: 'daisy', ready: false });
  assert.equal(pick(seated, 'ada', 'nope'), seated);
  assert.equal(pick(reduce(lobby([bo], ['bo']), commands.advance()), 'bo', 'mario').seats.bo.characterId, null);

  const joined = reduce(seated, commands.rosterSync([{ playerId: 'ada', connected: true }]));
  assert.equal(joined.seats.ada.characterId, 'daisy');
  assert.equal(joined.seats.ada.connected, true);
  assert.equal(joined.seats.ada.ready, false);
  const row = project(joined, [ada]).wire.racers[0];
  assert.equal(row.characterName, 'Daisy');
  assert.equal(row.css, '#f5a423');
  assert.equal(row.surface, 'pick');
});

test('every event after the start returns the same state', () => {
  let state = reduce(lobby([ada]), commands.advance());
  state = pick(state, 'ada', 'mario');
  state = reduce(state, commands.advance());
  state = reduce(state, commands.advance());
  state = ready(state, 'ada', true);
  state = reduce(state, commands.start());
  assert.equal(state.phase, 'started');
  const events = [
    commands.advance(),
    commands.back(),
    commands.selectTrack('luigi-circuit'),
    commands.start(),
    commands.rosterSync([{ playerId: 'ada', connected: false }, { playerId: 'bo', connected: true }]),
    { type: 'pick', playerId: 'ada', characterId: 'peach' },
    { type: 'ready', playerId: 'ada', ready: false },
    { type: 'unknown' },
  ];
  for (const event of events) assert.equal(reduce(state, event), state);
});

test('the start handoff keeps roster order and drops a disconnected middle seat', () => {
  let state = lobby([ada, bo, cy], ['bo']);
  state = reduce(state, commands.advance());
  state = pick(state, 'ada', 'peach');
  state = pick(state, 'cy', 'daisy');
  assert.equal(project(state, [ada, bo, cy]).view.primary.enabled, true);
  state = reduce(state, commands.advance());
  state = reduce(state, commands.advance());
  assert.equal(ready(state, 'bo', true), state);
  state = ready(state, 'ada', true);
  state = ready(state, 'cy', true);
  assert.equal(project(state, [ada, bo, cy]).setup, null);

  const started = reduce(state, commands.start());
  const projected = project(started, [ada, bo, cy]);
  assert.deepEqual(projected.setup.players, [
    { playerId: 'ada', name: 'Ada', characterId: 'peach' },
    { playerId: 'cy', name: 'Cy', characterId: 'daisy' },
  ]);
  assert.equal(projected.setup.track.poseAt, poseAt);
  assert.equal(projected.view.racers.map((racer) => racer.playerId).join(), 'ada,bo,cy');
  assert.equal(projected.view.racers[1].connected, false);
});

test('the wire catalog is the four playable racers and surfaces follow the phase table', () => {
  const fresh = project(lobby([ada]), [ada]).wire;
  assert.deepEqual(fresh.catalog, [
    { id: 'mario', name: 'Mario', css: '#e52521' },
    { id: 'luigi', name: 'Luigi', css: '#3caa2a' },
    { id: 'peach', name: 'Peach', css: '#f28cb6' },
    { id: 'daisy', name: 'Daisy', css: '#f5a423' },
  ]);
  assert.notEqual(fresh.catalog[1].css, fresh.catalog[3].css);

  let state = reduce(lobby([ada]), commands.advance());
  assert.equal(project(state, [ada]).wire.racers[0].surface, 'pick');
  state = pick(state, 'ada', 'peach');
  assert.equal(project(state, [ada]).wire.racers[0].surface, 'pick');

  state = reduce(state, commands.advance());
  let wire = project(state, [ada, cy]).wire;
  assert.equal(wire.racers[0].surface, 'holding');
  assert.equal(wire.racers[1].surface, 'pick');
  assert.equal(wire.racers[1].connected, true);
  assert.equal(wire.racers[1].characterId, null);

  state = reduce(state, commands.rosterSync([
    { playerId: 'ada', connected: true },
    { playerId: 'cy', connected: true },
  ]));
  state = reduce(state, commands.advance());
  wire = project(state, [ada, cy]).wire;
  assert.equal(state.phase, 'lobby');
  assert.equal(wire.racers[0].surface, 'ready');
  assert.equal(wire.racers[1].surface, 'pick');

  state = ready(state, 'ada', true);
  state = pick(state, 'cy', 'mario');
  state = ready(state, 'cy', true);
  state = reduce(state, commands.start());
  wire = project(state, [ada, cy]).wire;
  assert.equal(wire.racers[0].surface, 'holding');
  assert.equal(wire.racers[1].surface, 'holding');
});

test('a roster name is joined at project time and a missing seat reads as unpicked', () => {
  const state = lobby([]);
  const row = project(state, [ada]).view.racers[0];
  assert.equal(row.connected, true);
  assert.equal(row.characterId, null);
  assert.equal(row.ready, false);
  assert.equal(row.surface, 'splash');
  assert.equal(row.name, 'Ada');
  assert.equal(state.phase, 'menu');
  assert.equal(state.revision, 1);
});

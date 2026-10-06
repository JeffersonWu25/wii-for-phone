import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 9877;
const RELAY_URL = `ws://localhost:${TEST_PORT}`;

let relayProc;

before(async () => {
  relayProc = await new Promise((resolve, reject) => {
    const proc = spawn('node', [join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: String(TEST_PORT) },
    });
    proc.stdout.on('data', (d) => {
      if (d.toString().includes('Listening')) resolve(proc);
    });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('error', reject);
    setTimeout(() => reject(new Error('relay failed to start within 5s')), 5000);
  });
});

after(() => relayProc?.kill());

// ── Helpers ───────────────────────────────────────────────────────────────────

function connect(role, sessionId) {
  return new Promise((resolve, reject) => {
    const url = `${RELAY_URL}?role=${role}${sessionId ? `&session=${sessionId}` : ''}`;
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMsg(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    ws.once('error', reject);
  });
}

function closeAndWait(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', resolve);
    ws.close();
  });
}

async function createSession() {
  const host = await connect('host');
  const msg = await nextMsg(host);
  assert.equal(msg.type, 'session_created');
  return { host, sessionId: msg.sessionId };
}

async function joinPhone(sessionId, name) {
  const phone = await connect('phone', sessionId);
  phone.send(JSON.stringify({ type: 'join', name }));
  const msg = await nextMsg(phone);
  return { phone, msg };
}

// ── Part 1: Unique name enforcement ──────────────────────────────────────────

test('Part 1 — duplicate name from connected player is rejected', async () => {
  const { host, sessionId } = await createSession();

  const { phone: phone1, msg: r1 } = await joinPhone(sessionId, 'Alice');
  assert.equal(r1.type, 'joined');
  await nextMsg(host); // player_joined

  const { phone: phone2, msg: r2 } = await joinPhone(sessionId, 'Alice');
  assert.equal(r2.type, 'name_taken');

  await Promise.all([closeAndWait(host), closeAndWait(phone1), closeAndWait(phone2)]);
});

test('Part 1 — different names are both accepted', async () => {
  const { host, sessionId } = await createSession();

  const { phone: phone1, msg: r1 } = await joinPhone(sessionId, 'Alice');
  assert.equal(r1.type, 'joined');
  await nextMsg(host); // player_joined Alice

  const { phone: phone2, msg: r2 } = await joinPhone(sessionId, 'Bob');
  assert.equal(r2.type, 'joined');
  await nextMsg(host); // player_joined Bob

  await Promise.all([closeAndWait(host), closeAndWait(phone1), closeAndWait(phone2)]);
});

// ── Part 3: player_disconnected broadcast ────────────────────────────────────

test('Part 3 — host notified when named player disconnects', async () => {
  const { host, sessionId } = await createSession();

  const { phone, msg: joined } = await joinPhone(sessionId, 'Alice');
  assert.equal(joined.type, 'joined');
  const { playerId } = await nextMsg(host); // player_joined

  await closeAndWait(phone);

  const disconnected = await nextMsg(host);
  assert.equal(disconnected.type, 'player_disconnected');
  assert.equal(disconnected.playerId, playerId);
  assert.equal(disconnected.name, 'Alice');

  await closeAndWait(host);
});

test('Part 3 — anonymous phone (no join sent) closing does NOT notify host', async () => {
  const { host, sessionId } = await createSession();
  const phone = await connect('phone', sessionId);

  await closeAndWait(phone);

  // Host should stay silent — give it 150ms to prove it
  const result = await Promise.race([
    nextMsg(host).then(() => 'got_message'),
    new Promise((r) => setTimeout(() => r('silence'), 150)),
  ]);
  assert.equal(result, 'silence');

  await closeAndWait(host);
});

// ── Part 4: Reconnect matching ───────────────────────────────────────────────

test('Part 4 — reconnecting with same name restores original playerId', async () => {
  const { host, sessionId } = await createSession();

  const { phone: phone1, msg: joined } = await joinPhone(sessionId, 'Alice');
  assert.equal(joined.type, 'joined');
  const originalId = joined.playerId;
  await nextMsg(host); // player_joined

  await closeAndWait(phone1);
  await nextMsg(host); // player_disconnected

  // Reconnect
  const { phone: phone2, msg: rejoined } = await joinPhone(sessionId, 'Alice');
  assert.equal(rejoined.type, 'rejoined');
  assert.equal(rejoined.playerId, originalId);

  const reconnected = await nextMsg(host);
  assert.equal(reconnected.type, 'player_reconnected');
  assert.equal(reconnected.playerId, originalId);
  assert.equal(reconnected.name, 'Alice');

  await Promise.all([closeAndWait(host), closeAndWait(phone2)]);
});

test('Part 4 — disconnected player name does not trigger name_taken', async () => {
  const { host, sessionId } = await createSession();

  const { phone: phone1 } = await joinPhone(sessionId, 'Alice');
  await nextMsg(host); // player_joined

  await closeAndWait(phone1);
  await nextMsg(host); // player_disconnected

  const { phone: phone2, msg } = await joinPhone(sessionId, 'Alice');
  assert.notEqual(msg.type, 'name_taken');
  assert.equal(msg.type, 'rejoined');

  await Promise.all([closeAndWait(host), closeAndWait(phone2)]);
});

test('Part 4 — after reconnect, second disconnect fires player_disconnected with original id', async () => {
  const { host, sessionId } = await createSession();

  const { phone: phone1, msg: joined } = await joinPhone(sessionId, 'Alice');
  const originalId = joined.playerId;
  await nextMsg(host); // player_joined

  await closeAndWait(phone1);
  await nextMsg(host); // player_disconnected

  const { phone: phone2 } = await joinPhone(sessionId, 'Alice');
  await nextMsg(host); // player_reconnected

  await closeAndWait(phone2);

  const disconnected = await nextMsg(host);
  assert.equal(disconnected.type, 'player_disconnected');
  assert.equal(disconnected.playerId, originalId);
  assert.equal(disconnected.name, 'Alice');

  await closeAndWait(host);
});

test('Part 4 — game_selected is sent to reconnecting player if game is active', async () => {
  const { host, sessionId } = await createSession();

  const { phone: phone1, msg: joined } = await joinPhone(sessionId, 'Alice');
  assert.equal(joined.type, 'joined');
  await nextMsg(host); // player_joined

  // Host selects a game
  host.send(JSON.stringify({ type: 'game_selected', game: 'bowling' }));
  const gameSelectedOnPhone = await nextMsg(phone1);
  assert.equal(gameSelectedOnPhone.type, 'game_selected');

  await closeAndWait(phone1);
  await nextMsg(host); // player_disconnected

  // Reconnect — should get rejoined + game_selected
  const phone2 = await connect('phone', sessionId);
  phone2.send(JSON.stringify({ type: 'join', name: 'Alice' }));

  const msg1 = await nextMsg(phone2);
  const msg2 = await nextMsg(phone2);
  const types = [msg1.type, msg2.type];

  assert.ok(types.includes('rejoined'), `expected rejoined, got ${types}`);
  assert.ok(types.includes('game_selected'), `expected game_selected, got ${types}`);

  const gsMsg = [msg1, msg2].find((m) => m.type === 'game_selected');
  assert.equal(gsMsg.game, 'bowling');

  await nextMsg(host); // player_reconnected
  await Promise.all([closeAndWait(host), closeAndWait(phone2)]);
});

test('drive packets are forwarded to the host with the player id', async () => {
  const { host, sessionId } = await createSession();
  const { phone, msg } = await joinPhone(sessionId, 'Mario');
  assert.equal(msg.type, 'joined');
  await nextMsg(host);

  phone.send(JSON.stringify({ type: 'drive', steer: -0.4, gas: true, drift: false, seq: 3 }));
  const fwd = await nextMsg(host);
  assert.equal(fwd.type, 'drive');
  assert.equal(fwd.steer, -0.4);
  assert.equal(fwd.gas, true);
  assert.equal(fwd.playerId, msg.playerId);

  await Promise.all([closeAndWait(host), closeAndWait(phone)]);
});

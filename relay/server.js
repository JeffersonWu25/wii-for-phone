import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

const PORT = process.env.PORT || 8080;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MSGS = 60; // max messages per second per connection

const server = http.createServer((_req, res) => {
  res.writeHead(200);
  res.end('ok');
});

const wss = new WebSocketServer({ server });

// sessions: { [sessionId]: { hostWs, players: [{ id, ws, name, disconnected }], currentGame: null | string } }
const sessions = {};

function generateSessionId() {
  return crypto.randomBytes(3).toString('hex'); // 6 char hex
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const sessionId = url.searchParams.get('session');

  let msgCount = 0;
  let windowStart = Date.now();

  function isRateLimited() {
    const now = Date.now();
    if (now - windowStart >= RATE_LIMIT_WINDOW_MS) {
      msgCount = 0;
      windowStart = now;
    }
    msgCount++;
    return msgCount > RATE_LIMIT_MAX_MSGS;
  }

  if (role === 'host') {
    const id = generateSessionId();
    sessions[id] = { hostWs: ws, players: [], currentGame: null };
    send(ws, { type: 'session_created', sessionId: id });
    console.log(`[relay] Session created: ${id}`);

    ws.on('message', (data) => {
      if (isRateLimited()) return;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      const session = sessions[id];
      if (!session) return;

      // Store selected game so late-joining / reconnecting phones get it immediately.
      if (msg.type === 'game_selected') {
        session.currentGame = msg.game;
      }

      // Forward all host messages to connected phones only.
      for (const player of session.players) {
        if (!player.disconnected) send(player.ws, msg);
      }
    });

    ws.on('close', () => {
      const session = sessions[id];
      if (!session) return;
      for (const player of session.players) {
        send(player.ws, { type: 'session_ended' });
      }
      delete sessions[id];
      console.log(`[relay] Session ended: ${id}`);
    });

  } else if (role === 'phone') {
    const session = sessions[sessionId];
    if (!session) {
      send(ws, { type: 'error', message: 'Session not found' });
      ws.close();
      return;
    }

    const playerId = crypto.randomBytes(4).toString('hex');
    const player = { id: playerId, ws, name: null, disconnected: false };
    session.players.push(player);
    console.log(`[relay] Phone connected to session ${sessionId}, playerId: ${playerId}`);

    ws.on('message', (data) => {
      if (isRateLimited()) return;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      const session = sessions[sessionId];
      if (!session) return;

      if (msg.type === 'join') {
        // Block duplicate names among currently connected players only.
        const nameTaken = session.players.some(
          (p) => p.name === msg.name && p.id !== playerId && !p.disconnected
        );
        if (nameTaken) {
          send(ws, { type: 'name_taken' });
          return;
        }

        // Reconnect: name matches a disconnected player — restore their identity.
        // We update the current player entry in place (taking over the old id/name)
        // and remove the stale old entry. This keeps the close-handler closure valid.
        const returning = session.players.find(
          (p) => p.name === msg.name && p.disconnected
        );
        if (returning) {
          session.players = session.players.filter((p) => p !== returning);
          player.id = returning.id;
          player.name = returning.name;
          send(ws, { type: 'rejoined', playerId: returning.id });
          send(session.hostWs, { type: 'player_reconnected', playerId: returning.id, name: returning.name });
          if (session.currentGame) {
            send(ws, { type: 'game_selected', game: session.currentGame });
          }
          console.log(`[relay] Player reconnected: ${returning.name} (${returning.id})`);
          return;
        }

        // Fresh join.
        player.name = msg.name;
        send(ws, { type: 'joined', playerId });
        send(session.hostWs, { type: 'player_joined', playerId, name: msg.name });
        // If a game is already running, tell this phone immediately so it loads
        // the right UI without waiting for another game_selected broadcast.
        if (session.currentGame) {
          send(ws, { type: 'game_selected', game: session.currentGame });
        }
        console.log(`[relay] Player joined: ${msg.name} (${playerId})`);
      } else if (msg.type === 'pos' || msg.type === 'throw' || msg.type === 'aim') {
        send(session.hostWs, { ...msg, playerId: player.id });
      }
    });

    ws.on('close', () => {
      const session = sessions[sessionId];
      if (!session) return;
      // Only notify host if the player had fully joined (has a name).
      // Anonymous connections that never completed join are just pruned.
      if (!player.name) {
        session.players = session.players.filter((p) => p.id !== playerId);
        return;
      }
      player.disconnected = true;
      send(session.hostWs, { type: 'player_disconnected', playerId: player.id, name: player.name });
      console.log(`[relay] Phone disconnected: ${player.name} (${playerId})`);
    });

  } else {
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`[relay] Listening on port ${PORT}`);
});

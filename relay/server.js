import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

const PORT = process.env.PORT || 8080;

const server = http.createServer((_req, res) => {
  res.writeHead(200);
  res.end('ok');
});

const wss = new WebSocketServer({ server });

// sessions: { [sessionId]: { hostWs, players: [{ id, ws, name }], currentGame: null | string } }
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

  if (role === 'host') {
    const id = generateSessionId();
    sessions[id] = { hostWs: ws, players: [], currentGame: null };
    send(ws, { type: 'session_created', sessionId: id });
    console.log(`[relay] Session created: ${id}`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      const session = sessions[id];
      if (!session) return;

      // Store selected game so late-joining / reconnecting phones get it immediately.
      if (msg.type === 'game_selected') {
        session.currentGame = msg.game;
      }

      // Forward all host messages to all phones.
      for (const player of session.players) {
        send(player.ws, msg);
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
    const player = { id: playerId, ws, name: null };
    session.players.push(player);
    console.log(`[relay] Phone connected to session ${sessionId}, playerId: ${playerId}`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      const session = sessions[sessionId];
      if (!session) return;

      if (msg.type === 'join') {
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
        send(session.hostWs, { ...msg, playerId });
      }
    });

    ws.on('close', () => {
      const session = sessions[sessionId];
      if (!session) return;
      session.players = session.players.filter((p) => p.id !== playerId);
      console.log(`[relay] Phone disconnected: ${playerId}`);
    });

  } else {
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`[relay] Listening on port ${PORT}`);
});

import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

const PORT = 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.resolve(__dirname, '../certs');

const server = https.createServer({
  key: fs.readFileSync(`${CERT_DIR}/10.105.169.219-key.pem`),
  cert: fs.readFileSync(`${CERT_DIR}/10.105.169.219.pem`),
});

const wss = new WebSocketServer({ server });

// sessions: { [sessionId]: { hostWs, players: [{ id, ws, name }] } }
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
  const url = new URL(req.url, `https://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const sessionId = url.searchParams.get('session');

  if (role === 'host') {
    const id = generateSessionId();
    sessions[id] = { hostWs: ws, players: [] };
    send(ws, { type: 'session_created', sessionId: id });
    console.log(`[relay] Session created: ${id}`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      const session = sessions[id];
      if (!session) return;
      // Forward host messages to all phones
      for (const player of session.players) {
        send(player.ws, msg);
      }
    });

    ws.on('close', () => {
      const session = sessions[id];
      if (!session) return;
      // Notify all phones then clean up
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
        // Consumed by relay — register name, confirm to phone, notify host
        player.name = msg.name;
        send(ws, { type: 'joined', playerId });
        send(session.hostWs, { type: 'player_joined', playerId, name: msg.name });
        console.log(`[relay] Player joined: ${msg.name} (${playerId})`);
      } else if (msg.type === 'pos' || msg.type === 'throw') {
        // Forward to host
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
  console.log(`[relay] Listening on wss://10.105.169.219:${PORT}`);
});

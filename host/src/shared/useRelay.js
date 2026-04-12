import { useState, useEffect, useRef, useCallback } from 'react';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;

// Manages the host WebSocket connection to the relay.
// Handles session creation internally; all other messages are forwarded to onMessage.
// Returns a stable `send` function (memoized) safe to pass as props.
export function useRelay(onMessage) {
  const [sessionId, setSessionId] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  // Keep the callback current every render so callers can pass a fresh closure
  // without triggering reconnections.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  // Stable send — safe to pass as a prop without causing child re-renders.
  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }, []);

  const reconnect = useCallback(() => {
    setSessionId(null);
    setConnected(false);

    const ws = new WebSocket(`${RELAY_URL}?role=host`);
    wsRef.current = ws;

    ws.addEventListener('open', () => setConnected(true));
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      // session_created is consumed here — sets sessionId, not forwarded.
      if (msg.type === 'session_created') {
        setSessionId(msg.sessionId);
        return;
      }
      onMessageRef.current?.(msg);
    });
    ws.addEventListener('close', () => setConnected(false));
    ws.addEventListener('error', () => setConnected(false));
  }, []);

  useEffect(() => {
    reconnect();
    return () => wsRef.current?.close();
  }, [reconnect]);

  return { sessionId, connected, send, reconnect, wsRef };
}

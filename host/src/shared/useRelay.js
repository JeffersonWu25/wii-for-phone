import { useState, useEffect, useRef, useCallback } from 'react';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;

// Manages the host WebSocket connection to the relay.
// Handles session creation internally; all other messages are forwarded to onMessage.
// Returns a stable `send` function (memoized) safe to pass as props.
export function useRelay(onMessage) {
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('connecting');
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
    setStatus('connecting');

    const ws = new WebSocket(`${RELAY_URL}?role=host`);
    wsRef.current = ws;

    // StrictMode closes the first socket immediately. Its error and close
    // events must not mark the replacement socket as lost.
    const isCurrent = () => wsRef.current === ws;

    ws.addEventListener('open', () => {
      if (!isCurrent()) return;
      setStatus('open');
    });
    ws.addEventListener('message', (e) => {
      if (!isCurrent()) return;
      const msg = JSON.parse(e.data);
      // session_created is consumed here — sets sessionId, not forwarded.
      if (msg.type === 'session_created') {
        setSessionId(msg.sessionId);
        return;
      }
      onMessageRef.current?.(msg);
    });
    ws.addEventListener('close', () => {
      if (!isCurrent()) return;
      setStatus('lost');
    });
    ws.addEventListener('error', () => {
      if (!isCurrent()) return;
      setStatus('lost');
    });
  }, []);

  useEffect(() => {
    reconnect();
    return () => wsRef.current?.close();
  }, [reconnect]);

  return { sessionId, status, send, reconnect, wsRef };
}

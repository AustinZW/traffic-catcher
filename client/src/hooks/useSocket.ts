import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth-store';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined; // undefined = same origin

let globalSocket: Socket | null = null;

export function getSocket(): Socket | null {
  return globalSocket;
}

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      if (globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
        setReady(false);
      }
      return;
    }

    // Reuse existing socket whether connected or not (Socket.io buffers)
    if (globalSocket) {
      if (globalSocket.connected) {
        setReady(true);
      } else {
        globalSocket.once('connect', () => setReady(true));
      }
      return;
    }

    // Create new socket
    const s = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });

    s.on('connect', () => {
      console.log('Socket connected:', s.id);
      setReady(true);
    });

    s.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    s.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    globalSocket = s;

    return () => {
      // Keep socket alive across page navigations
    };
  }, [token]);

  return ready ? globalSocket : null;
}

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket } from './useSocket';
import { C2S } from '@traffic-ghost/shared';

interface LocationState {
  lat: number;
  lng: number;
  accuracy: number;
  error: string | null;
  permission: 'prompt' | 'granted' | 'denied' | 'unavailable';
}

export function useLocation(enabled: boolean = true) {
  const [location, setLocation] = useState<LocationState>({
    lat: 0,
    lng: 0,
    accuracy: 0,
    error: null,
    permission: 'prompt',
  });
  const watchId = useRef<number | null>(null);
  const lastEmit = useRef<number>(0);
  const firstEmit = useRef<boolean>(true);

  // Throttled emit to server — send first position immediately
  const emitLocation = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    const minInterval = firstEmit.current ? 0 : 1000;
    if (now - lastEmit.current < minInterval) return;
    lastEmit.current = now;
    firstEmit.current = false;

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit(C2S.LOCATION_UPDATE, { lat, lng });
    }
  }, []);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      if (!navigator.geolocation) {
        setLocation((prev) => ({ ...prev, error: 'Geolocation not supported', permission: 'unavailable' }));
      }
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocation({ lat: latitude, lng: longitude, accuracy, error: null, permission: 'granted' });
        emitLocation(latitude, longitude);
      },
      (err) => {
        let permission: LocationState['permission'] = 'denied';
        if (err.code === err.PERMISSION_DENIED) permission = 'denied';
        else if (err.code === err.TIMEOUT) permission = 'prompt';
        setLocation((prev) => ({ ...prev, error: err.message, permission }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [enabled, emitLocation]);

  return location;
}

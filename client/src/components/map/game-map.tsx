import { useEffect, useRef, useState } from 'react';
import { loadAMap } from '../../lib/gaode-maps';
import { useGameStore } from '../../stores/game-store';
import { useAuthStore } from '../../stores/auth-store';
import { DEFAULT_CENTER } from '@traffic-ghost/shared';

interface Props {
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm?: number;
}

export function GameMap({ zoneLat, zoneLng, zoneRadiusKm }: Props) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const zoneCircleRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const players = useGameStore((s) => s.players);
  const userId = useAuthStore((s) => s.user?.id);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    loadAMap()
      .then((AMap) => {
        const center = zoneLat && zoneLng
          ? [zoneLng, zoneLat]
          : [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];

        const map = new AMap.Map(containerRef.current!, {
          zoom: 15,
          center,
          resizeEnable: true,
          mapStyle: 'amap://styles/light',
        });

        // Add geolocation control
        AMap.plugin('AMap.Geolocation', () => {
          const geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            showButton: true,
            buttonPosition: 'RB',
            buttonOffset: [10, 100],
            panToLocation: true,
          });
          map.addControl(geolocation);
        });

        mapRef.current = map;
        setLoaded(true);
      })
      .catch((err) => {
        console.error('Map load failed:', err);
        setError('地图加载失败，请确认高德地图 API Key 已配置');
      });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw zone circle
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    if (zoneCircleRef.current) {
      mapRef.current.remove(zoneCircleRef.current);
    }

    if (zoneLat && zoneLng && zoneRadiusKm) {
      zoneCircleRef.current = new AMap.Circle({
        center: [zoneLng, zoneLat],
        radius: zoneRadiusKm * 1000,
        strokeColor: '#FF5722',
        strokeWeight: 2,
        strokeOpacity: 0.6,
        fillColor: '#FF5722',
        fillOpacity: 0.1,
      });
      mapRef.current.add(zoneCircleRef.current);
    }
  }, [loaded, zoneLat, zoneLng, zoneRadiusKm]);

  // Update player markers
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    const currentMarkers = markersRef.current;

    // Remove old markers
    for (const [, marker] of currentMarkers) {
      mapRef.current.remove(marker);
    }
    currentMarkers.clear();

    // Add markers for players with location
    for (const p of players) {
      if (!p.lat || !p.lng) continue;

      const isMe = p.userId === userId;
      const color = p.role === 'ghost' ? '#EF4444' : '#3B82F6';
      const label = p.isCaught ? 'X' : p.role === 'ghost' ? '鬼' : '人';

      const markerContent = document.createElement('div');
      markerContent.innerHTML = isMe
        ? `<div style="width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px #3B82F6;animation:pulse 1.5s infinite"></div>`
        : `<div style="width:28px;height:28px;background:${color};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${label}</div>`;

      const marker = new AMap.Marker({
        position: [p.lng, p.lat],
        content: markerContent,
        offset: new AMap.Pixel(-14, -14),
        zIndex: isMe ? 100 : 50,
      });

      marker.setMap(mapRef.current);
      currentMarkers.set(p.userId, marker);
    }
  }, [loaded, players, userId]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-400 text-sm">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}

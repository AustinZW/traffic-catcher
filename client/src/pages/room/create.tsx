import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomApi } from '../../services/room-api';
import { DEFAULT_CENTER } from '@traffic-ghost/shared';

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [zoneLat, setZoneLat] = useState(String(DEFAULT_CENTER.lat));
  const [zoneLng, setZoneLng] = useState(String(DEFAULT_CENTER.lng));
  const [zoneRadius, setZoneRadius] = useState(5);
  const [duration, setDuration] = useState(45);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const room = await roomApi.create({
        name,
        maxPlayers,
        zoneLat: parseFloat(zoneLat) || undefined,
        zoneLng: parseFloat(zoneLng) || undefined,
        zoneRadiusKm: zoneRadius,
        durationMin: duration,
      });
      navigate(`/rooms/${room.code}`);
    } catch (err: any) {
      setError(err.response?.data?.error || '创建失败');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="btn-touch text-blue-600 font-semibold">← 返回</button>
        <h1 className="text-lg font-bold">创建房间</h1>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">房间名称（选填）</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给房间起个名字"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">最大人数</label>
            <select
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {[4, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n} 人</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">游戏时长（分钟）</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="360"
                step="1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min="1"
                max="360"
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(360, Number(e.target.value) || 1)))}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">区域中心纬度</label>
              <input
                type="number"
                step="0.0001"
                value={zoneLat}
                onChange={(e) => setZoneLat(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">区域中心经度</label>
              <input
                type="number"
                step="0.0001"
                value={zoneLng}
                onChange={(e) => setZoneLng(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">游戏区域半径（公里）</label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={zoneRadius}
              onChange={(e) => setZoneRadius(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-center text-sm text-gray-500">{zoneRadius} 公里</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold text-base disabled:opacity-50 btn-touch"
          >
            {loading ? '创建中...' : '创建房间'}
          </button>
        </form>
      </main>
    </div>
  );
}

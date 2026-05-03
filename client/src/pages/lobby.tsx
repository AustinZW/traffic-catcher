import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useRoomStore } from '../stores/room-store';
import { roomApi } from '../services/room-api';
import type { RoomInfo } from '@traffic-ghost/shared';

export default function LobbyPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { rooms, setRooms, isLoading, setLoading } = useRoomStore();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState('');

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const list = await roomApi.list('waiting');
      setRooms(list);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoinErr('');
    try {
      const code = joinCode.trim().toUpperCase();
      await roomApi.join(code);
      navigate(`/rooms/${code}`);
    } catch (err: any) {
      setJoinErr(err.response?.data?.error || '加入失败');
    }
  };

  const handleEnterRoom = async (code: string) => {
    try {
      await roomApi.join(code);
    } catch {}
    navigate(`/rooms/${code}`);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold">交通鬼抓人</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.username}</span>
          <button onClick={logout} className="text-sm text-red-500 btn-touch px-2">退出</button>
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        {/* Join by code */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入房间码"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinErr(''); }}
              maxLength={6}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-base uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleJoin} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold btn-touch">
              加入
            </button>
          </div>
          {joinErr && <p className="text-red-500 text-sm mt-2">{joinErr}</p>}
        </div>

        {/* Create button */}
        <button
          onClick={() => navigate('/rooms/create')}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-base mb-6 btn-touch"
        >
          创建新房间
        </button>

        {/* Room list */}
        <h2 className="text-sm font-semibold text-gray-500 mb-3">等待中的房间</h2>
        {isLoading && rooms.length === 0 ? (
          <p className="text-gray-400 text-center py-8">加载中...</p>
        ) : rooms.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
            <p>暂无房间</p>
            <p className="text-sm mt-1">创建一个房间开始游戏吧</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room: RoomInfo) => (
              <div
                key={room.id}
                onClick={() => handleEnterRoom(room.code)}
                className="bg-white rounded-xl shadow p-4 active:bg-gray-50 cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-base">{room.name || `房间 ${room.code}`}</p>
                    <p className="text-sm text-gray-500">房间码: {room.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-blue-600">{room.playerCount}/{room.maxPlayers} 人</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

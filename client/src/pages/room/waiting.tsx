import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store';
import { roomApi } from '../../services/room-api';
import { useSocket } from '../../hooks/useSocket';
import type { RoomDetail } from '@traffic-ghost/shared';
import { S2C, C2S } from '@traffic-ghost/shared';

export default function WaitingRoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const socket = useSocket();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomCode) return;
    // Initial load from REST API
    roomApi.detail(roomCode).then((r) => {
      setRoom(r);
      const me = r.players.find((p) => p.userId === user?.id);
      if (me) setIsReady(me.isReady);
    }).catch(() => setError('房间不存在'));

    if (!socket) return;

    socket.emit(C2S.ROOM_JOIN, { roomCode });

    const onRoomState = (state: any) => {
      if (state.players) {
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            phase: state.phase || prev.phase,
            players: state.players.map((p: any) => ({
              id: p.id, userId: p.userId, username: p.username,
              role: p.role, teamId: p.teamId, teamName: p.teamName,
              isReady: p.isReady ?? false, score: p.score || 0,
            })),
          };
        });
        const me = state.players.find((p: any) => p.userId === user?.id);
        if (me) setIsReady(me.isReady);
      }
    };

    const onPlayerJoined = (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        if (prev.players.find((p) => p.userId === data.userId)) return prev;
        return {
          ...prev,
          players: [...prev.players, {
            id: '', userId: data.userId, username: data.username,
            role: 'human', isReady: false,
          }],
        };
      });
    };

    const onPlayerLeft = (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.filter((p) => p.userId !== data.userId),
        };
      });
    };

    const onPlayerReady = (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.userId === data.userId ? { ...p, isReady: data.isReady } : p
          ),
        };
      });
      if (data.userId === user?.id) setIsReady(data.isReady);
    };

    const onRoleUpdated = (data: { userId: string; role: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.userId === data.userId ? { ...p, role: data.role } : p
          ),
        };
      });
    };

    const onPhaseChange = (data: { phase: string; gameId?: string }) => {
      if (data.phase === 'countdown' || data.phase === 'playing') {
        navigate(`/game/${room?.id || data.gameId}?code=${roomCode}`);
      }
    };

    socket.on(S2C.ROOM_STATE, onRoomState);
    socket.on(S2C.PLAYER_JOINED, onPlayerJoined);
    socket.on(S2C.PLAYER_LEFT, onPlayerLeft);
    socket.on(S2C.PLAYER_READY, onPlayerReady);
    socket.on('player:role_updated', onRoleUpdated);
    socket.on(S2C.GAME_PHASE_CHANGE, onPhaseChange);

    return () => {
      socket.emit(C2S.ROOM_LEAVE, { roomCode });
      socket.off(S2C.ROOM_STATE, onRoomState);
      socket.off(S2C.PLAYER_JOINED, onPlayerJoined);
      socket.off(S2C.PLAYER_LEFT, onPlayerLeft);
      socket.off(S2C.PLAYER_READY, onPlayerReady);
      socket.off('player:role_updated', onRoleUpdated);
      socket.off(S2C.GAME_PHASE_CHANGE, onPhaseChange);
    };
  }, [roomCode, socket, user?.id]);

  const handleReady = () => {
    if (!socket || !roomCode) return;
    const newReady = !isReady;
    setIsReady(newReady);
    socket.emit(C2S.PLAYER_READY, { roomCode, isReady: newReady });
  };

  const handleStart = () => {
    if (!socket || !roomCode) return;
    socket.emit(C2S.GAME_START, { roomCode });
  };

  const handleRoleChange = (newRole: string) => {
    if (!socket || !roomCode) return;
    socket.emit('player:updateRole', { roomCode, role: newRole });
    // Optimistic update
    setRoom((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map((p) =>
          p.userId === user?.id ? { ...p, role: newRole } : p
        ),
      };
    });
  };

  const handleLeave = async () => {
    try {
      await roomApi.leave(roomCode!);
    } catch {}
    navigate('/lobby');
  };

  const myPlayer = room?.players.find((p) => p.userId === user?.id);
  const isReferee = myPlayer?.role === 'referee';
  const canChangeRole = myPlayer && myPlayer.role !== 'referee' && room?.phase === 'waiting';
  const allReady = room?.players.filter((p) => p.role !== 'referee').every((p) => p.isReady) ?? false;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <button onClick={() => navigate('/lobby')} className="text-blue-600 font-semibold">返回大厅</button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={handleLeave} className="btn-touch text-red-500 font-semibold text-sm">退出</button>
        <div className="flex-1 text-center">
          <h1 className="text-lg font-bold">{room.name || `房间 ${room.code}`}</h1>
          <p className="text-sm text-gray-500">房间码: {room.code}</p>
        </div>
        <div className="w-12" />
      </header>

      <main className="p-4 max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{room.durationMin} 分钟</span>
            <span>区域半径 {room.zoneRadiusKm}km</span>
            <span>{room.players.length}/{room.maxPlayers} 人</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow mb-6">
          <h2 className="px-4 py-3 text-sm font-semibold text-gray-500 border-b">玩家列表</h2>
          <div className="divide-y">
            {room.players.map((p) => (
              <div key={p.id || p.userId} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    p.role === 'ghost' ? 'bg-red-500' :
                    p.role === 'referee' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <span className="font-medium">{p.username}</span>
                  {p.userId === user?.id && <span className="text-xs text-gray-400">(我)</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    p.role === 'ghost' ? 'bg-red-100 text-red-600' :
                    p.role === 'referee' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {p.role === 'ghost' ? '鬼' : p.role === 'referee' ? '裁判' : '人'}
                  </span>
                  {p.role !== 'referee' && (
                    <span className={`text-xs ${p.isReady ? 'text-green-600' : 'text-gray-400'}`}>
                      {p.isReady ? '✓ 已准备' : '未准备'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {canChangeRole && (
          <div className="bg-white rounded-xl shadow mb-4 p-4">
            <h3 className="text-sm font-semibold text-gray-500 mb-3">选择阵营</h3>
            <div className="flex gap-3">
              <button
                onClick={() => handleRoleChange('human')}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm btn-touch border-2 transition-colors ${
                  myPlayer?.role === 'human'
                    ? 'bg-blue-500 text-white border-blue-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                🏃 人队
              </button>
              <button
                onClick={() => handleRoleChange('ghost')}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm btn-touch border-2 transition-colors ${
                  myPlayer?.role === 'ghost'
                    ? 'bg-red-500 text-white border-red-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}
              >
                👻 鬼队
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {isReferee ? (
            <button
              onClick={handleStart}
              disabled={!allReady || room.players.length < 3}
              className="flex-1 py-4 bg-green-600 text-white rounded-xl font-semibold text-base disabled:opacity-40 btn-touch"
            >
              {allReady ? '开始游戏' : '等待玩家准备'}
            </button>
          ) : (
            <button
              onClick={handleReady}
              className={`flex-1 py-4 rounded-xl font-semibold text-base btn-touch ${
                isReady ? 'bg-gray-300 text-gray-700' : 'bg-blue-600 text-white'
              }`}
            >
              {isReady ? '取消准备' : '准备'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store';
import { useGameStore } from '../../stores/game-store';
import { useChatStore } from '../../stores/chat-store';
import { useSocket } from '../../hooks/useSocket';
import { useLocation } from '../../hooks/useLocation';
import { GameMap } from '../../components/map/game-map';
import { HUD } from '../../components/game/hud';
import { ShopPanel } from '../../components/game/shop-panel';
import { S2C, C2S } from '@traffic-ghost/shared';
import type { RoomDetail, PlayerRole } from '@traffic-ghost/shared';

export default function GamePage() {
  const { gameId: paramGameId } = useParams<{ gameId: string }>();
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get('code') || paramGameId;
  const navigate = useNavigate();
  const socket = useSocket();
  const initializedRef = useRef(false);

  const storeGameId = useGameStore((s) => s.gameId);
  // Use store gameId (from ROOM_STATE) as authoritative source, fallback to URL param
  const gameId = storeGameId || (paramGameId && paramGameId !== 'undefined' ? paramGameId : null);

  const phase = useGameStore((s) => s.phase);
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const teams = useGameStore((s) => s.teams);
  const tasks = useGameStore((s) => s.tasks);
  const setGame = useGameStore((s) => s.setGame);
  const setPhase = useGameStore((s) => s.setPhase);
  const addPlayer = useGameStore((s) => s.addPlayer);
  const addTask = useGameStore((s) => s.addTask);
  const updateTask = useGameStore((s) => s.updateTask);
  const removeTask = useGameStore((s) => s.removeTask);
  const updatePlayerLocation = useGameStore((s) => s.updatePlayerLocation);
  const updatePlayerScore = useGameStore((s) => s.updatePlayerScore);
  const updateTeamScore = useGameStore((s) => s.updateTeamScore);
  const catchPlayer = useGameStore((s) => s.catchPlayer);
  const addMessage = useChatStore((s) => s.addMessage);
  const addBroadcast = useChatStore((s) => s.addBroadcast);
  const removeBroadcast = useChatStore((s) => s.removeBroadcast);

  // Zone info from first room state
  const [zone, setZone] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);

  const [showShop, setShowShop] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showCatch, setShowCatch] = useState(false);
  const [catchCandidates, setCatchCandidates] = useState<any[]>([]);
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [completing, setCompleting] = useState(false);
  const [taskMsg, setTaskMsg] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [connected, setConnected] = useState(false);
  const messages = useChatStore((s) => s.messages);
  const broadcasts = useChatStore((s) => s.broadcasts);

  const myPlayer = players.find((p) => p.userId === userId);
  const isReferee = myPlayer?.role === 'referee';
  const isGhost = myPlayer?.role === 'ghost';
  const loc = useLocation(!isReferee && phase === 'playing' && connected);

  // Reset stale game state on mount (only once)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      useGameStore.setState({ phase: 'lobby', players: [], teams: [], tasks: [], gameId: null });
    }
  }, []);

  // Join socket room on mount
  useEffect(() => {
    if (!socket || !roomCode) return;

    socket.emit(C2S.ROOM_JOIN, { roomCode });

    const onRoomState = (state: RoomDetail & { players: any[]; teams: any[]; tasks: any[]; zoneLat?: number; zoneLng?: number; zoneRadiusKm?: number }) => {
      if (state.phase) setPhase(state.phase as any);
      if (state.players) {
        setGame(state.id, state.players.map(p => ({
          id: p.id, userId: p.userId, username: p.username,
          role: p.role as PlayerRole, teamId: p.teamId, teamName: p.teamName,
          score: p.score || 0, isReady: p.isReady || false,
          isCaught: p.isCaught || false, isRevived: p.isRevived || false,
        })), (state.teams || []).map((t: any) => ({ id: t.id, name: t.name, score: t.score, color: t.color })),
        (state.tasks || []).map((t: any) => ({
          id: t.id, title: t.title, description: t.description,
          conditionText: t.conditionText, points: t.points,
          allowedTeams: t.allowedTeams,
          requireText: t.requireText, requirePhoto: t.requirePhoto,
          requireLocation: t.requireLocation,
          targetLat: t.targetLat, targetLng: t.targetLng,
          arriveRadiusM: t.arriveRadiusM, isActive: t.isActive,
        })));
      }
      if (state.zoneLat && state.zoneLng) {
        setZone({ lat: state.zoneLat, lng: state.zoneLng, radiusKm: state.zoneRadiusKm || 5 });
      }
      setConnected(true);
    };

    const onPlayerJoined = (data: any) => {
      addPlayer({
        id: '', userId: data.userId, username: data.username,
        role: 'human', score: 0, isReady: false, isCaught: false,
        isRevived: false,
      });
    };

    const onPhaseChange = (data: any) => {
      if (data.phase === 'countdown') {
        setPhase('countdown');
        useGameStore.setState({ countdown: data.countdownSeconds || 5 });
      }
      if (data.phase === 'playing') {
        setPhase('playing');
        if (data.players) {
          const gid = data.gameId || storeGameId || paramGameId;
          setGame(gid, data.players.map((p: any) => ({
            id: p.id, userId: p.userId, username: p.username,
            role: p.role, teamId: p.teamId, teamName: p.teamName,
            score: p.score || 0, isReady: true, isCaught: p.isCaught || false,
            isRevived: p.isRevived || false,
          })));
        }
      }
    };

    const onPlayerMoved = (data: any) => {
      updatePlayerLocation(data.userId, data.lat, data.lng);
    };

    const onGameOver = (data: any) => {
      setPhase('finished');
      if (data.players) {
        const gid = data.gameId || storeGameId || paramGameId;
        setGame(gid, data.players.map((p: any) => ({
          id: p.id, userId: p.userId, username: p.username,
          role: p.role, teamId: p.teamId, teamName: p.teamName,
          score: p.score || 0, isReady: true, isCaught: p.isCaught || false,
          isRevived: p.isRevived || false,
        })), (data.teams || []).map((t: any) => ({ id: t.id, name: t.name, score: t.score, color: t.color })));
      }
      navigate(`/game/${gameId}/over`);
    };

    const onChatMessage = (data: any) => {
      addMessage({
        id: data.id,
        senderId: data.senderId,
        senderName: data.senderName,
        content: data.content,
        type: data.type || 'chat',
        createdAt: data.createdAt,
      });
    };

    const onBroadcast = (data: any) => {
      addBroadcast({
        id: data.id,
        content: data.content,
        from: data.from,
        createdAt: data.createdAt,
      });
    };

    const onScoreUpdate = (data: any) => {
      if (data.teamName && data.teamScore !== undefined) {
        updateTeamScore(data.teamName, data.teamScore);
      }
      if (data.userId && data.score !== undefined) {
        updatePlayerScore(data.userId, data.score);
      }
    };

    const onPlayerCaught = (data: any) => {
      catchPlayer(data.humanId);
      addMessage({
        id: Date.now().toString(),
        senderId: 'system',
        senderName: '系统',
        content: `${data.humanId} 被抓住了!`,
        type: 'catch',
        createdAt: new Date().toISOString(),
      });
    };

    const onCatchResult = (data: any) => {
      if (data.success) {
        addMessage({
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: `${data.ghostName} 抓住了 ${data.humanName}! (距离: ${Math.round(data.distance)}m)`,
          type: 'catch',
          createdAt: new Date().toISOString(),
        });
      } else {
        addMessage({
          id: Date.now().toString(),
          senderId: 'system',
          senderName: '系统',
          content: data.reason || `抓捕失败! 距离: ${Math.round(data.distance || 0)}m`,
          type: 'system',
          createdAt: new Date().toISOString(),
        });
      }
      setCatchCandidates([]);
    };

    const onCatchCandidates = (data: { candidates: any[] }) => {
      setCatchCandidates(data.candidates || []);
      setShowCatch(true);
    };

    const onError = (data: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId: 'system',
        senderName: '系统',
        content: data.message || '未知错误',
        type: 'system',
        createdAt: new Date().toISOString(),
      });
    };

    const onTaskCreated = (task: any) => {
      addTask({
        id: task.id, title: task.title, description: task.description,
        conditionText: task.conditionText, points: task.points,
        allowedTeams: task.allowedTeams,
        requireText: task.requireText, requirePhoto: task.requirePhoto,
        requireLocation: task.requireLocation,
        targetLat: task.targetLat, targetLng: task.targetLng,
        arriveRadiusM: task.arriveRadiusM, isActive: task.isActive !== false,
      });
    };

    const onTaskUpdated = (task: any) => {
      updateTask({
        id: task.id, title: task.title, description: task.description,
        conditionText: task.conditionText, points: task.points,
        allowedTeams: task.allowedTeams,
        requireText: task.requireText, requirePhoto: task.requirePhoto,
        requireLocation: task.requireLocation,
        targetLat: task.targetLat, targetLng: task.targetLng,
        arriveRadiusM: task.arriveRadiusM, isActive: task.isActive !== false,
      });
    };

    const onTaskDeleted = (data: { taskId: string }) => {
      removeTask(data.taskId);
    };

    const onTaskCompleted = (data: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId: 'system',
        senderName: '系统',
        content: `${data.username || ''} 完成了任务 ${data.taskId} (+${data.points}分)`,
        type: 'system',
        createdAt: new Date().toISOString(),
      });
    };

    socket.on(S2C.ROOM_STATE, onRoomState);
    socket.on(S2C.PLAYER_JOINED, onPlayerJoined);
    socket.on(S2C.PLAYER_LEFT, () => {});
    socket.on(S2C.GAME_PHASE_CHANGE, onPhaseChange);
    socket.on(S2C.LOCATION_PLAYER_MOVED, onPlayerMoved);
    socket.on(S2C.GAME_OVER, onGameOver);
    socket.on(S2C.CHAT_MESSAGE, onChatMessage);
    socket.on(S2C.BROADCAST_ANNOUNCEMENT, onBroadcast);
    socket.on(S2C.SCORE_UPDATE, onScoreUpdate);
    socket.on(S2C.PLAYER_CAUGHT, onPlayerCaught);
    socket.on(S2C.CATCH_RESULT, onCatchResult);
    socket.on('catch:candidates', onCatchCandidates);
    socket.on(S2C.TASK_COMPLETED, onTaskCompleted);
    socket.on(S2C.ERROR, onError);
    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('cross_visibility_changed', (data: { visible: boolean }) => {
      addMessage({
        id: Date.now().toString(),
        senderId: 'system',
        senderName: '系统',
        content: data.visible ? '裁判开启了跨阵营可见' : '裁判关闭了跨阵营可见',
        type: 'system',
        createdAt: new Date().toISOString(),
      });
    });

    return () => {
      socket.emit(C2S.ROOM_LEAVE, { roomCode });
      socket.off(S2C.ROOM_STATE, onRoomState);
      socket.off(S2C.PLAYER_JOINED, onPlayerJoined);
      socket.off(S2C.GAME_PHASE_CHANGE, onPhaseChange);
      socket.off(S2C.LOCATION_PLAYER_MOVED, onPlayerMoved);
      socket.off(S2C.GAME_OVER, onGameOver);
      socket.off(S2C.CHAT_MESSAGE, onChatMessage);
      socket.off(S2C.BROADCAST_ANNOUNCEMENT, onBroadcast);
      socket.off(S2C.SCORE_UPDATE, onScoreUpdate);
      socket.off(S2C.PLAYER_CAUGHT, onPlayerCaught);
      socket.off(S2C.CATCH_RESULT, onCatchResult);
      socket.off('catch:candidates', onCatchCandidates);
      socket.off(S2C.TASK_COMPLETED, onTaskCompleted);
      socket.off(S2C.ERROR, onError);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('cross_visibility_changed');
      setConnected(false);
    };
  }, [socket?.id, roomCode]);

  // Auto-dismiss broadcasts after 5 seconds
  useEffect(() => {
    if (broadcasts.length === 0) return;
    const latest = broadcasts[broadcasts.length - 1];
    const timer = setTimeout(() => {
      removeBroadcast(latest.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [broadcasts, removeBroadcast]);

  const handleSendChat = () => {
    if (!chatInput.trim() || !socket) return;
    socket.emit(C2S.CHAT_SEND, { content: chatInput.trim() });
    setChatInput('');
  };

  const handleSendBroadcast = () => {
    if (!chatInput.trim() || !socket) return;
    socket.emit(C2S.BROADCAST_SEND, { content: chatInput.trim() });
    setChatInput('');
  };

  const handleCatch = (targetPlayerId?: string) => {
    if (!socket) return;
    if (targetPlayerId) {
      socket.emit(C2S.CATCH_ATTEMPT, { targetPlayerId });
      setShowCatch(false);
      setCatchCandidates([]);
    } else {
      socket.emit(C2S.CATCH_ATTEMPT, {});
    }
  };

  const handleTaskComplete = (task: any) => {
    if (!socket) return;
    if (!loc.lat || !loc.lng) {
      setTaskMsg('无法获取当前位置，请确保已开启定位');
      return;
    }
    setCompleting(true);
    setTaskMsg('提交中...');
    socket.emit(C2S.TASK_COMPLETE, { taskId: task.id, lat: loc.lat, lng: loc.lng });

    let handled = false;
    const onError = (data: any) => {
      if (handled) return; handled = true;
      setTaskMsg(data.message || '完成失败');
      setCompleting(false);
    };
    const onTaskResult = (data: any) => {
      if (handled) return; handled = true;
      if (data.taskId === task.id) {
        setTaskMsg(`任务完成! +${data.points || task.points}分`);
        setCompleting(false);
        setTimeout(() => setSelectedTask(null), 1500);
      }
    };
    socket.once('error', onError);
    socket.once('task:completed_result', onTaskResult);
    // Timeout fallback
    setTimeout(() => {
      if (handled) return;
      handled = true;
      setCompleting(false);
      setTaskMsg('任务提交超时');
      setTimeout(() => setSelectedTask(null), 1500);
    }, 5000);
  };

  // Prevent navigating away with stale store data (race condition on mount)
  if (phase === 'finished' && storeGameId && storeGameId === paramGameId) {
    navigate(`/game/${storeGameId}/over`);
    return null;
  }

  return (
    <div className="h-full w-full relative bg-black">
      <GameMap
        zoneLat={zone?.lat}
        zoneLng={zone?.lng}
        zoneRadiusKm={zone?.radiusKm}
      />

      <HUD
        onShopClick={() => setShowShop(!showShop)}
        onScoreboardClick={() => setShowScore(!showScore)}
      />

      {loc.permission === 'denied' && phase === 'playing' && (
        <div className="fixed top-20 left-4 right-4 z-40 bg-red-500 text-white px-4 py-2 rounded-lg text-sm text-center">
          请开启位置权限以参与游戏
        </div>
      )}

      {broadcasts.length > 0 && (
        <div className="fixed top-20 left-4 right-4 z-40">
          {broadcasts.slice(-1).map((b) => (
            <div key={b.id} className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm text-center animate-pulse">
              📢 {b.content}
            </div>
          ))}
        </div>
      )}

      {/* Task list panel */}
      {showTasks && !isReferee && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-lg drawer" style={{ maxHeight: '40vh' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-bold text-sm">任务列表 ({tasks.filter(t => {
              if (!t.isActive) return false;
              const allowed = (t.allowedTeams || 'human,ghost').split(',').map((s: string) => s.trim());
              return allowed.includes(myPlayer?.role || '');
            }).length})</h3>
            <button onClick={() => setShowTasks(false)} className="text-gray-400 btn-touch text-lg px-2">✕</button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(40vh - 48px)' }}>
            {tasks.filter(t => {
              if (!t.isActive) return false;
              const allowed = (t.allowedTeams || 'human,ghost').split(',').map((s: string) => s.trim());
              return allowed.includes(myPlayer?.role || '');
            }).length === 0 ? (
              <div className="p-4 text-gray-400 text-sm text-center">暂无活跃任务</div>
            ) : (
              <div className="p-3 space-y-2">
                {tasks.filter(t => {
                  if (!t.isActive) return false;
                  const allowed = (t.allowedTeams || 'human,ghost').split(',').map((s: string) => s.trim());
                  return allowed.includes(myPlayer?.role || '');
                }).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTask(t); setTaskMsg(''); }}
                    className="w-full border rounded-lg p-3 text-sm text-left hover:bg-gray-50 transition-colors active:bg-gray-100"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold">{t.title}</span>
                      <span className="text-amber-600 font-bold text-xs">+{t.points}分</span>
                    </div>
                    {t.description && <p className="text-gray-500 text-xs mb-1">{t.description}</p>}
                    {t.conditionText && <p className="text-blue-500 text-xs mb-1">📋 {t.conditionText}</p>}
                    <div className="flex gap-2 text-xs text-gray-400">
                      {t.requireText && <span>📝文字</span>}
                      {t.requirePhoto && <span>📷拍照</span>}
                      {t.requireLocation && <span>📍定位</span>}
                      {t.targetLat && t.targetLng && <span>🎯 需到达指定位置</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Referee bottom bar */}
      {isReferee && (
        <div className="fixed bottom-4 left-4 right-4 z-40 flex gap-2">
          <button
            onClick={() => setShowTaskCreate(true)}
            className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold btn-touch"
          >
            发布任务
          </button>
          <button
            onClick={() => socket?.emit('game:toggle_visibility')}
            className="flex-1 py-3 bg-purple-500 text-white rounded-xl font-bold btn-touch"
          >
            切换可见
          </button>
          <button
            onClick={() => socket?.emit(C2S.GAME_END)}
            className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold btn-touch"
          >
            结束游戏
          </button>
        </div>
      )}

      {/* Task list toggle for non-referees */}
      {!isReferee && !showTasks && (
        <button
          onClick={() => setShowTasks(true)}
          className="fixed bottom-24 left-20 z-40 w-10 h-10 bg-white/90 rounded-full shadow-lg flex items-center justify-center text-sm font-bold btn-touch"
        >
          📋
        </button>
      )}

      {/* Ghost catch button — hidden when tasks panel is open */}
      {!isReferee && isGhost && !showTasks && (
        <div className="fixed bottom-24 right-4 z-40">
          <button
            onClick={() => handleCatch()}
            className="w-14 h-14 bg-red-500 text-white rounded-full shadow-lg font-bold text-sm btn-touch animate-pulse"
          >
            抓捕
          </button>
        </div>
      )}

      {/* Catch target selection panel — shown when 2+ targets in range */}
      {showCatch && catchCandidates.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => { setShowCatch(false); setCatchCandidates([]); }}>
          <div className="bg-white w-full rounded-t-2xl max-h-[50vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">附近有多个目标，请选择</h3>
            <div className="space-y-2">
              {catchCandidates.map((c: any) => (
                <button
                  key={c.userId}
                  onClick={() => handleCatch(c.userId)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl hover:bg-red-50 transition-colors btn-touch"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="flex-1 text-left font-medium">{c.username}</span>
                  <span className="text-sm text-gray-400">{Math.round(c.distance)}m</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowCatch(false); setCatchCandidates([]); }} className="w-full py-3 bg-gray-200 rounded-xl mt-4 font-semibold btn-touch">取消</button>
          </div>
        </div>
      )}

      {/* Task creation panel for referee */}
      {showTaskCreate && gameId && socket && (
        <TaskCreatePanel gameId={gameId} socket={socket} onClose={() => setShowTaskCreate(false)} />
      )}

      {/* Task detail / completion modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => { if (!completing) setSelectedTask(null); }}>
          <div className="bg-white w-full rounded-t-2xl max-h-[60vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-2">{selectedTask.title}</h3>
            {selectedTask.description && (
              <p className="text-gray-600 text-sm mb-3">{selectedTask.description}</p>
            )}
            {selectedTask.conditionText && (
              <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm mb-3">
                📋 {selectedTask.conditionText}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                🪙 +{selectedTask.points} 分
              </span>
              {selectedTask.requireText && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">📝 需要文字</span>
              )}
              {selectedTask.requirePhoto && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">📷 需要拍照</span>
              )}
              {selectedTask.requireLocation && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">📍 需要定位</span>
              )}
              {selectedTask.targetLat && selectedTask.targetLng && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  🎯 到达指定位置 ({selectedTask.arriveRadiusM || 100}m内)
                </span>
              )}
            </div>

            {taskMsg && (
              <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${
                taskMsg.includes('完成') ? 'bg-green-50 text-green-600' :
                taskMsg.includes('提交') ? 'bg-blue-50 text-blue-600' :
                'bg-red-50 text-red-600'
              }`}>
                {taskMsg}
              </div>
            )}

            <div className="text-xs text-gray-400 mb-4">
              当前位置: {loc.lat ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : '获取中...'}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { if (!completing) setSelectedTask(null); }}
                className="flex-1 py-3 bg-gray-200 rounded-xl font-semibold btn-touch"
                disabled={completing}
              >
                关闭
              </button>
              <button
                onClick={() => handleTaskComplete(selectedTask)}
                disabled={completing || !loc.lat}
                className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold btn-touch disabled:opacity-40"
              >
                {completing ? '提交中...' : '完成任务'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shop/Backpack panel */}
      {showShop && gameId && (
        <ShopPanel gameId={gameId} onClose={() => setShowShop(false)} />
      )}

      {/* Scoreboard modal */}
      {showScore && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setShowScore(false)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[60vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">排名</h3>

            {/* Team scores */}
            <div className="flex gap-3 mb-4">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className={`flex-1 rounded-xl p-3 text-center ${
                    team.name === 'ghost' ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 ${team.name === 'ghost' ? 'text-red-600' : 'text-blue-600'}`}>
                    {team.name === 'ghost' ? '👻 鬼队' : '🧑 人队'}
                  </div>
                  <div className="text-2xl font-bold">{team.score}</div>
                  <div className="text-xs text-gray-400">分</div>
                </div>
              ))}
              {teams.length === 2 && teams[0].score !== teams[1].score && (
                <div className="absolute top-14 right-4 text-xs font-bold text-green-600">
                  {teams[0].score > teams[1].score
                    ? `${teams[0].name === 'ghost' ? '鬼队' : '人队'} 领先`
                    : `${teams[1].name === 'ghost' ? '鬼队' : '人队'} 领先`}
                </div>
              )}
            </div>

            {/* Individual scores grouped by team */}
            {teams.map((team) => {
              const teamPlayers = players.filter(
                (p) => p.teamName === team.name && p.role !== 'referee'
              ).sort((a, b) => b.score - a.score);

              if (teamPlayers.length === 0) return null;

              return (
                <div key={team.id} className="mb-3">
                  <div className={`text-xs font-semibold px-2 py-1 rounded mb-2 inline-block ${
                    team.name === 'ghost' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {team.name === 'ghost' ? '鬼队' : '人队'}
                  </div>
                  {teamPlayers.map((p, i) => (
                    <div key={p.userId} className="flex items-center gap-3 py-2 border-b border-gray-50">
                      <span className="text-sm font-bold w-6 text-gray-400">{i + 1}</span>
                      <span className={`w-2 h-2 rounded-full ${p.role === 'ghost' ? 'bg-red-500' : 'bg-blue-500'}`} />
                      <span className="flex-1 text-sm">{p.username}</span>
                      <span className="font-bold text-sm">{p.score} 分</span>
                      {p.isCaught && <span className="text-xs text-red-500">被抓</span>}
                    </div>
                  ))}
                </div>
              );
            })}
            <button onClick={() => setShowScore(false)} className="w-full py-3 bg-gray-200 rounded-xl mt-4 btn-touch">关闭</button>
          </div>
        </div>
      )}

      {/* Chat button */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-24 left-4 z-40 w-10 h-10 bg-white/90 rounded-full shadow-lg flex items-center justify-center text-sm font-bold btn-touch"
      >
        💬
      </button>

      {/* Chat panel */}
      {showChat && (
        <div className="fixed bottom-36 left-4 right-4 z-40 bg-white rounded-xl shadow-lg" style={{ maxHeight: '40vh' }}>
          <div className="p-2 border-b flex justify-between items-center">
            <span className="font-bold text-sm">聊天</span>
            <button onClick={() => setShowChat(false)} className="text-gray-400 btn-touch text-xs px-2">✕</button>
          </div>
          <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: 'calc(40vh - 90px)' }}>
            {messages.slice(-30).map((m) => (
              <div key={m.id} className={`text-xs ${m.type === 'system' || m.type === 'catch' ? 'text-orange-500 italic' : ''}`}>
                <span className="font-bold">{m.senderName}</span>: {m.content}
              </div>
            ))}
            {messages.length === 0 && <p className="text-gray-400 text-xs text-center py-4">暂无消息</p>}
          </div>
          <div className="p-2 border-t flex gap-1">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={isReferee ? '发送广播...' : '输入消息...'}
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs"
              onKeyDown={(e) => e.key === 'Enter' && (isReferee ? handleSendBroadcast() : handleSendChat())}
            />
            <button
              onClick={isReferee ? handleSendBroadcast : handleSendChat}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-bold btn-touch"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* Connection lost overlay */}
      {!socket?.connected && phase === 'playing' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="text-white text-center">
            <p className="text-lg font-bold mb-2">连接断开</p>
            <p className="text-sm">正在重新连接...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCreatePanel({ gameId: _gameId, socket, onClose }: { gameId: string; socket: any; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conditionText, setConditionText] = useState('');
  const [points, setPoints] = useState(10);
  const [allowedTeams, setAllowedTeams] = useState('human,ghost');
  const [requireText, setRequireText] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [requireLocation, setRequireLocation] = useState(true);
  const [targetLat, setTargetLat] = useState('');
  const [targetLng, setTargetLng] = useState('');
  const [arriveRadiusM, setArriveRadiusM] = useState(100);
  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleCreate = () => {
    if (!title.trim() || !socket) return;
    setSending(true);
    setErrMsg('');

    let handled = false;
    const onResult = (data: any) => {
      if (handled) return; handled = true;
      if (data.success) {
        onClose();
      }
    };
    const onError = (data: any) => {
      if (handled) return; handled = true;
      setErrMsg(data.message || '创建失败');
      setSending(false);
    };

    socket.once('task:created_result', onResult);
    socket.once('error', onError);
    socket.emit('task:create', {
      title: title.trim(),
      description: description.trim(),
      conditionText: conditionText.trim(),
      points,
      allowedTeams,
      requireText,
      requirePhoto,
      requireLocation,
      targetLat: targetLat ? parseFloat(targetLat) : undefined,
      targetLng: targetLng ? parseFloat(targetLng) : undefined,
      arriveRadiusM,
    });

    setTimeout(() => {
      if (!handled) { handled = true; setErrMsg('创建超时'); setSending(false); }
    }, 5000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl max-h-[80vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-2">发布任务</h3>
        {errMsg && (
          <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs mb-3">{errMsg}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">任务标题 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="例如: 到达中山公园站"
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="任务详细说明..."
              rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">完成条件提示</label>
            <input value={conditionText} onChange={e => setConditionText(e.target.value)}
              placeholder="例如: 拍摄站牌照片"
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 block mb-1">分数</label>
              <input type="number" value={points} onChange={e => setPoints(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 block mb-1">适用阵营</label>
              <select value={allowedTeams} onChange={e => setAllowedTeams(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="human,ghost">双方</option>
                <option value="human">仅人</option>
                <option value="ghost">仅鬼</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">目标位置 (纬度, 经度)</label>
            <div className="flex gap-2">
              <input value={targetLat} onChange={e => setTargetLat(e.target.value)}
                placeholder="纬度" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <input value={targetLng} onChange={e => setTargetLng(e.target.value)}
                placeholder="经度" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <input type="number" value={arriveRadiusM} onChange={e => setArriveRadiusM(Number(e.target.value))}
                placeholder="半径(m)" className="w-24 px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={requireText} onChange={e => setRequireText(e.target.checked)} />
              需要文字
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={requirePhoto} onChange={e => setRequirePhoto(e.target.checked)} />
              需要拍照
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={requireLocation} onChange={e => setRequireLocation(e.target.checked)} />
              需要定位
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-200 rounded-xl font-semibold btn-touch">取消</button>
          <button onClick={handleCreate} disabled={!title.trim() || sending}
            className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-semibold btn-touch disabled:opacity-40">
            {sending ? '创建中...' : '发布任务'}
          </button>
        </div>
      </div>
    </div>
  );
}

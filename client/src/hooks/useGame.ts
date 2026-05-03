import { useEffect } from 'react';
import { useGameStore } from '../stores/game-store';
import { useChatStore } from '../stores/chat-store';
import { useAuthStore } from '../stores/auth-store';
import { getSocket } from './useSocket';
import { S2C } from '@traffic-ghost/shared';

export function useGame() {
  const socket = getSocket();
  const userId = useAuthStore((s) => s.user?.id);
  const gameStore = useGameStore();
  const chatStore = useChatStore();

  useEffect(() => {
    if (!socket) return;

    const onPhaseChange = (data: { phase: string; countdownSeconds?: number }) => {
      gameStore.setPhase(data.phase as any);
      if (data.phase === 'countdown') {
        gameStore.setCountdown(data.countdownSeconds || 5);
      }
    };

    const onPlayerMoved = (data: { userId: string; lat: number; lng: number; role: string }) => {
      if (data.userId === userId) return;
      gameStore.updatePlayerLocation(data.userId, data.lat, data.lng);
    };

    const onCatchResult = (data: { success: boolean; ghostId: string; humanId: string; humanName: string; ghostName: string; distance: number }) => {
      if (data.success) {
        gameStore.catchPlayer(data.humanId);
      }
    };

    const onPlayerCaught = (data: { humanId: string; ghostId: string }) => {
      gameStore.catchPlayer(data.humanId);
    };

    const onScoreUpdate = (data: { userId: string; newScore: number }) => {
      gameStore.updatePlayerScore(data.userId, data.newScore);
    };

    const onChatMessage = (data: any) => {
      chatStore.addMessage(data);
    };

    const onBroadcast = (data: any) => {
      chatStore.addBroadcast(data);
    };

    const onTaskCompleted = (data: { userId: string; points: number }) => {
      const player = gameStore.players.find((p) => p.userId === data.userId);
      if (player) {
        gameStore.updatePlayerScore(data.userId, player.score + data.points);
      }
    };

    const onGameOver = () => {
      gameStore.setPhase('finished');
    };

    socket.on(S2C.GAME_PHASE_CHANGE, onPhaseChange);
    socket.on(S2C.LOCATION_PLAYER_MOVED, onPlayerMoved);
    socket.on(S2C.CATCH_RESULT, onCatchResult);
    socket.on(S2C.PLAYER_CAUGHT, onPlayerCaught);
    socket.on(S2C.SCORE_UPDATE, onScoreUpdate);
    socket.on(S2C.CHAT_MESSAGE, onChatMessage);
    socket.on(S2C.BROADCAST_ANNOUNCEMENT, onBroadcast);
    socket.on(S2C.TASK_COMPLETED, onTaskCompleted);
    socket.on(S2C.GAME_OVER, onGameOver);

    return () => {
      socket.off(S2C.GAME_PHASE_CHANGE, onPhaseChange);
      socket.off(S2C.LOCATION_PLAYER_MOVED, onPlayerMoved);
      socket.off(S2C.CATCH_RESULT, onCatchResult);
      socket.off(S2C.PLAYER_CAUGHT, onPlayerCaught);
      socket.off(S2C.SCORE_UPDATE, onScoreUpdate);
      socket.off(S2C.CHAT_MESSAGE, onChatMessage);
      socket.off(S2C.BROADCAST_ANNOUNCEMENT, onBroadcast);
      socket.off(S2C.TASK_COMPLETED, onTaskCompleted);
      socket.off(S2C.GAME_OVER, onGameOver);
    };
  }, [socket, userId]);
}

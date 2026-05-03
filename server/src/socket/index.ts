import { Server, Socket } from 'socket.io';
import { verifyToken } from '../lib/jwt';
import { handleRoomJoin, handleRoomLeave, handlePlayerReady, handleGameStart, handleUpdateRole } from './handlers/room.handler';
import { handleLocationUpdate } from './handlers/location.handler';
import { handleChatSend, handleBroadcastSend } from './handlers/chat.handler';
import { handleCatchAttempt, handleGameEnd, handleTaskComplete, handleToggleVisibility } from './handlers/game.handler';
import { handleBuyItem, handleUseItem } from './handlers/item.handler';
import { handleCreateTask, handleSubmitTask, handleReviewTask } from './handlers/task.handler';

interface AuthSocket extends Socket {
  userId: string;
  username: string;
  currentGameId?: string;
}

export function setupSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyToken(token);
      (socket as AuthSocket).userId = payload.userId;
      (socket as AuthSocket).username = payload.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const s = socket as AuthSocket;
    console.log(`User connected: ${s.username} (${s.userId})`);

    // Room events
    s.on('room:join', (data) => handleRoomJoin(io, s, data));
    s.on('room:leave', (data) => handleRoomLeave(io, s, data));
    s.on('player:ready', (data) => handlePlayerReady(io, s, data));
    s.on('game:start', (data) => handleGameStart(io, s, data));
    s.on('player:updateRole', (data) => handleUpdateRole(io, s, data));

    // Game events
    s.on('location:update', (data) => handleLocationUpdate(io, s, data));
    s.on('catch:attempt', (data) => handleCatchAttempt(io, s, data));
    s.on('task:complete', (data) => handleTaskComplete(io, s, data));
    s.on('game:end', () => handleGameEnd(io, s));
    s.on('game:toggle_visibility', () => handleToggleVisibility(io, s));

    // Item shop events
    s.on('item:buy', (data) => handleBuyItem(io, s, data));
    s.on('item:use', (data) => handleUseItem(io, s, data));

    // Task submission events
    s.on('task:create', (data) => handleCreateTask(io, s, data));
    s.on('task:submit', (data) => handleSubmitTask(io, s, data));
    s.on('task:review', (data) => handleReviewTask(io, s, data));

    // Chat events
    s.on('chat:send', (data) => handleChatSend(io, s, data));
    s.on('broadcast:send', (data) => handleBroadcastSend(io, s, data));

    s.on('disconnect', () => {
      console.log(`User disconnected: ${s.username}`);
    });
  });
}

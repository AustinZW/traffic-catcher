import { Server } from 'socket.io';
import { S2C } from '@traffic-ghost/shared';
import prisma from '../../lib/prisma';

import { AuthSocket } from '../types';

export async function handleChatSend(io: Server, socket: AuthSocket, data: { content: string; recipientRole?: string }) {
  const { content, recipientRole } = data;

  if (!content || !content.trim()) return;

  const gameId = socket.currentGameId;
  if (!gameId) return;

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: {
      userId: socket.userId,
      gameId,
      game: { phase: { in: ['playing', 'waiting'] } },
    },
  });

  if (!gamePlayer) return;

  // Persist message
  const message = await prisma.chatMessage.create({
    data: {
      gameId: gamePlayer.gameId,
      senderId: socket.userId,
      content: content.trim(),
      type: 'chat',
      recipientRole: recipientRole || 'all',
    },
  });

  const messageData = {
    id: message.id,
    gameId: message.gameId,
    senderId: socket.userId,
    senderName: socket.username,
    content: message.content,
    type: 'chat',
    recipientRole: message.recipientRole,
    createdAt: message.createdAt.toISOString(),
  };

  const socketRoom = `game:${gamePlayer.gameId}`;

  if (recipientRole && recipientRole !== 'all') {
    // Role-scoped message: find players with that role
    const session = require('../game-session').getSession(gamePlayer.gameId);
    if (session) {
      const targets: any[] = Array.from(session.players.values()).filter((p: any) => p.role === recipientRole);
      for (const target of targets) {
        const targetSocket = Array.from(io.sockets.sockets.values()).find(
          (s) => (s as any).userId === target.userId
        );
        if (targetSocket) {
          targetSocket.emit(S2C.CHAT_MESSAGE, messageData);
        }
      }
      // Also send to sender
      socket.emit(S2C.CHAT_MESSAGE, messageData);
    }
  } else {
    io.to(socketRoom).emit(S2C.CHAT_MESSAGE, messageData);
  }
}

export async function handleBroadcastSend(io: Server, socket: AuthSocket, data: { content: string }) {
  const { content } = data;
  if (!content || !content.trim()) return;

  const gameId = socket.currentGameId;
  if (!gameId) return;

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: {
      userId: socket.userId,
      gameId,
      role: 'referee',
      game: { phase: { in: ['playing', 'waiting'] } },
    },
  });

  if (!gamePlayer) return;

  const message = await prisma.chatMessage.create({
    data: {
      gameId: gamePlayer.gameId,
      senderId: socket.userId,
      content: content.trim(),
      type: 'broadcast',
    },
  });

  io.to(`game:${gamePlayer.gameId}`).emit(S2C.BROADCAST_ANNOUNCEMENT, {
    id: message.id,
    content: message.content,
    from: socket.username,
    createdAt: message.createdAt.toISOString(),
  });
}

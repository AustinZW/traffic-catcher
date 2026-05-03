import { Server } from 'socket.io';
import { S2C } from '@traffic-ghost/shared';
import { updatePlayerLocation, getVisiblePlayers, checkTraps, getSession } from '../game-session';
import { encryptLocation } from '../../lib/crypto';
import { AuthSocket } from '../types';
import prisma from '../../lib/prisma';

const lastUpdate = new Map<string, number>();

export async function handleLocationUpdate(io: Server, socket: AuthSocket, data: { lat: number; lng: number }) {
  const { lat, lng } = data;

  // Rate limit: once per second per user
  const now = Date.now();
  const last = lastUpdate.get(socket.userId) || 0;
  if (now - last < 900) return;
  lastUpdate.set(socket.userId, now);

  // Use the game the socket is currently in
  const gameId = socket.currentGameId;
  if (!gameId) return;

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: { userId: socket.userId, gameId, game: { phase: 'playing' } },
    include: { game: true, team: true },
  });
  if (!gamePlayer) return;

  // Check traps
  const trapCheck = checkTraps(gameId, socket.userId, lat, lng);
  if (trapCheck.triggered) {
    const session = getSession(gameId);
    const humans = Array.from(session?.players.values() || []).filter(
      p => p.role === 'human' && p.teamName === 'human' && !p.isCaught
    );
    if (humans.length > 0) {
      const victim = humans[Math.floor(Math.random() * humans.length)];
      victim.isCaught = true;
      await prisma.gamePlayer.update({ where: { id: victim.id }, data: { isCaught: true } });
      io.to(`game:${gameId}`).emit(S2C.PLAYER_CAUGHT, {
        humanId: victim.userId, ghostId: trapCheck.trap.ghostUserId, trap: true,
      });
      io.to(`game:${gameId}`).emit(S2C.BROADCAST_ANNOUNCEMENT, {
        id: '', content: `【陷阱触发】${victim.username} 踩中了陷阱，被抓捕！`,
        from: '系统', createdAt: new Date().toISOString(),
      });
    }
  }

  // Encrypt and store in DB
  try {
    const encryptedLat = encryptLocation(lat);
    const encryptedLng = encryptLocation(lng);
    await prisma.gamePlayer.update({
      where: { id: gamePlayer.id },
      data: { encryptedLat, encryptedLng, locationUpdatedAt: new Date() },
    });
  } catch {}

  // Update in-memory session
  updatePlayerLocation(gameId, socket.userId, lat, lng);

  // Broadcast to visible players based on privacy rules
  const visiblePlayers = getVisiblePlayers(gameId, socket.userId);

  // Helper to emit location to a socket
  const emitLocation = (targetSocket: any) => {
    targetSocket.emit(S2C.LOCATION_PLAYER_MOVED, {
      playerId: gamePlayer.id,
      userId: socket.userId,
      username: socket.username,
      lat, lng,
      role: gamePlayer.role,
      teamName: gamePlayer.team?.name,
    });
  };

  for (const target of visiblePlayers) {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(
      (s) => (s as any).userId === target.userId
    );
    if (targetSocket) emitLocation(targetSocket);
  }

  // Also send to teammates (always visible) and referee (always sees all)
  const session = getSession(gameId);
  const myPlayer = session?.players.get(socket.userId);
  if (myPlayer) {
    for (const [, p] of session?.players || []) {
      if (p.userId === socket.userId) continue;
      const isTeammate = p.teamName === myPlayer.teamName;
      const isReferee = p.role === 'referee';
      const alreadySent = visiblePlayers.find(v => v.userId === p.userId);

      if ((isTeammate || isReferee) && !alreadySent) {
        const targetSocket = Array.from(io.sockets.sockets.values()).find(
          (s) => (s as any).userId === p.userId
        );
        if (targetSocket) emitLocation(targetSocket);
      }
    }
  }
}

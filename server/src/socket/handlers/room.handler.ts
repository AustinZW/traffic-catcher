import { Server } from 'socket.io';
import prisma from '../../lib/prisma';
import { S2C } from '@traffic-ghost/shared';
import { initSession, setSessionPhase } from '../game-session';

import { AuthSocket } from '../types';

async function findGame(roomCodeOrId: string) {
  // Try as room code first, then as game ID
  let game = await prisma.game.findUnique({
    where: { code: roomCodeOrId },
    include: {
      players: { include: { user: { select: { id: true, username: true } }, team: true } },
      teams: true,
      tasks: true,
    },
  });
  if (!game) {
    game = await prisma.game.findUnique({
      where: { id: roomCodeOrId },
      include: {
        players: { include: { user: { select: { id: true, username: true } }, team: true } },
        teams: true,
        tasks: true,
      },
    });
  }
  return game;
}

export async function handleRoomJoin(io: Server, socket: AuthSocket, data: { roomCode: string }) {
  const codeOrId = data.roomCode;
  try {
    const game = await findGame(codeOrId);

    if (!game) {
      socket.emit(S2C.ERROR, { message: 'Room not found' });
      return;
    }

    const socketRoom = `game:${game.id}`;

    // Add/ensure player in DB if game is in lobby/waiting phase
    const existingPlayer = game.players.find(p => p.userId === socket.userId);
    if (!existingPlayer && (game.phase === 'waiting' || game.phase === 'lobby')) {
      if (game.players.length >= game.maxPlayers) {
        socket.emit(S2C.ERROR, { message: 'Room is full' });
        return;
      }
      await prisma.gamePlayer.create({
        data: { gameId: game.id, userId: socket.userId, role: 'human' },
      });
    }

    socket.join(socketRoom);

    // Track current game on socket so other handlers use the right game
    socket.currentGameId = game.id;

    // Re-fetch game to include the newly added player
    let updatedGame = existingPlayer ? game : await findGame(codeOrId);

    // If game is already playing, initialize session first (may backfill teams)
    if (updatedGame!.phase === 'playing') {
      await initSession(updatedGame!.id);
      const refreshed = await findGame(updatedGame!.id);
      if (refreshed) updatedGame = refreshed;
    }

    socket.to(socketRoom).emit(S2C.PLAYER_JOINED, {
      userId: socket.userId,
      username: socket.username,
    });

    socket.emit(S2C.ROOM_STATE, {
      id: updatedGame!.id,
      code: updatedGame!.code,
      name: updatedGame!.name,
      phase: updatedGame!.phase,
      maxPlayers: updatedGame!.maxPlayers,
      teamAssignment: updatedGame!.teamAssignment,
      crossTeamVisibilityMin: updatedGame!.crossTeamVisibilityMin,
      zoneLat: updatedGame!.zoneLat,
      zoneLng: updatedGame!.zoneLng,
      zoneRadiusKm: updatedGame!.zoneRadiusKm,
      durationMin: updatedGame!.durationMin,
      teams: updatedGame!.teams.map(t => ({ id: t.id, name: t.name, score: t.score, color: t.color })),
      tasks: updatedGame!.tasks.filter(t => t.isActive).map(t => ({
        id: t.id, title: t.title, description: t.description,
        conditionText: t.conditionText, points: t.points,
        allowedTeams: t.allowedTeams,
        requireText: t.requireText, requirePhoto: t.requirePhoto,
        requireLocation: t.requireLocation,
        targetLat: t.targetLat, targetLng: t.targetLng,
        arriveRadiusM: t.arriveRadiusM, isActive: t.isActive,
      })),
      players: updatedGame!.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        role: p.role,
        teamId: p.teamId,
        teamName: p.team?.name,
        isReady: p.isReady,
        score: p.score,
        isCaught: p.isCaught,
        isRevived: p.isRevived,
      })),
    });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

export async function handleRoomLeave(io: Server, socket: AuthSocket, data: { roomCode: string }) {
  const codeOrId = data.roomCode;
  try {
    const game = await findGame(codeOrId);
    if (!game) return;

    const socketRoom = `game:${game.id}`;
    socket.leave(socketRoom);
    socket.to(socketRoom).emit(S2C.PLAYER_LEFT, {
      userId: socket.userId,
      username: socket.username,
    });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

export async function handleUpdateRole(io: Server, socket: AuthSocket, data: { roomCode: string; role: string }) {
  const { roomCode, role } = data;
  try {
    const game = await findGame(roomCode);
    if (!game) return;

    if (game.phase !== 'waiting' && game.phase !== 'lobby') {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    if (!['human', 'ghost'].includes(role)) {
      socket.emit('error', { message: 'Invalid role' });
      return;
    }

    const player = game.players.find((p) => p.userId === socket.userId);
    if (!player || player.role === 'referee') return;

    await prisma.gamePlayer.update({ where: { id: player.id }, data: { role } });

    io.to(`game:${game.id}`).emit('player:role_updated', {
      userId: socket.userId,
      username: socket.username,
      role,
    });
  } catch (err: any) {
    socket.emit('error', { message: err.message });
  }
}

export async function handlePlayerReady(io: Server, socket: AuthSocket, data: { roomCode: string; isReady: boolean }) {
  const { roomCode, isReady } = data;
  try {
    const game = await findGame(roomCode);
    if (!game) return;

    const player = game.players.find((p) => p.userId === socket.userId);
    if (!player) return;

    await prisma.gamePlayer.update({ where: { id: player.id }, data: { isReady } });
    io.to(`game:${game.id}`).emit(S2C.PLAYER_READY, { userId: socket.userId, isReady });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

export async function handleGameStart(io: Server, socket: AuthSocket, data: { roomCode: string }) {
  const { roomCode } = data;
  try {
    const game = await findGame(roomCode);
    if (!game) return;

    const player = game.players.find((p) => p.userId === socket.userId);
    if (!player || player.role !== 'referee') {
      socket.emit(S2C.ERROR, { message: 'Only referee can start' });
      return;
    }

    if (game.phase !== 'waiting' && game.phase !== 'lobby') {
      socket.emit(S2C.ERROR, { message: 'Game already started' });
      return;
    }

    const activePlayers = game.players.filter((p) => p.role !== 'referee');
    if (activePlayers.length < 2) {
      socket.emit(S2C.ERROR, { message: 'Need at least 2 players' });
      return;
    }

    const socketRoom = `game:${game.id}`;

    // Create teams (skip if teams already exist — idempotent)
    let ghostTeam = game.teams.find(t => t.name === 'ghost');
    let humanTeam = game.teams.find(t => t.name === 'human');

    if (!ghostTeam) {
      ghostTeam = await prisma.team.create({
        data: { gameId: game.id, name: 'ghost', color: '#EF4444' },
      });
    }
    if (!humanTeam) {
      humanTeam = await prisma.team.create({
        data: { gameId: game.id, name: 'human', color: '#3B82F6' },
      });
    }

    // Assign players to teams based on role
    const nonRef = game.players.filter((p) => p.role !== 'referee');
    if (game.teamAssignment === 'manual' || game.teamAssignment === 'referee') {
      for (const p of nonRef) {
        const teamId = p.role === 'ghost' ? ghostTeam.id : humanTeam.id;
        await prisma.gamePlayer.update({ where: { id: p.id }, data: { teamId } });
      }
    } else {
      const total = nonRef.length;
      let ghostsNeeded = Math.max(1, Math.ceil(total / 5));
      const chosenGhosts = nonRef.filter(p => p.role === 'ghost');
      for (const g of chosenGhosts) {
        await prisma.gamePlayer.update({ where: { id: g.id }, data: { teamId: ghostTeam.id } });
        ghostsNeeded--;
      }
      const remaining = nonRef.filter(p => p.role !== 'ghost');
      const shuffled = remaining.sort(() => Math.random() - 0.5);
      for (const p of shuffled) {
        if (ghostsNeeded > 0) {
          await prisma.gamePlayer.update({ where: { id: p.id }, data: { teamId: ghostTeam.id, role: 'ghost' } });
          ghostsNeeded--;
        } else {
          await prisma.gamePlayer.update({ where: { id: p.id }, data: { teamId: humanTeam.id, role: 'human' } });
        }
      }
    }

    // Update DB phase to playing
    await prisma.game.update({ where: { id: game.id }, data: { phase: 'playing', startedAt: new Date() } });

    // Init game session
    await initSession(game.id);
    setSessionPhase(game.id, 'playing');

    const updated = await findGame(roomCode);

    io.to(socketRoom).emit(S2C.GAME_PHASE_CHANGE, { phase: 'countdown', countdownSeconds: 5, gameId: game.id });

    setTimeout(() => {
      io.to(socketRoom).emit(S2C.GAME_PHASE_CHANGE, {
        phase: 'playing',
        gameId: game.id,
        crossTeamVisibilityMin: game.crossTeamVisibilityMin,
        teams: updated?.teams.map(t => ({ id: t.id, name: t.name, score: t.score, color: t.color })) || [],
        players: updated?.players.map(p => ({
          id: p.id, userId: p.userId, username: p.user.username,
          role: p.role, teamId: p.teamId, teamName: p.team?.name,
          score: p.score, isReady: p.isReady, isCaught: p.isCaught,
        })) || [],
      });
    }, 5000);

  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

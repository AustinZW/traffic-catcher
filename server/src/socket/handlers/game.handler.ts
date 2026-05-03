import { Server } from 'socket.io';
import { S2C } from '@traffic-ghost/shared';
import prisma from '../../lib/prisma';
import { attemptCatch, checkGameEnd, findCatchableHumans, getSession, removeSession, toggleCrossVisibility } from '../game-session';
import { haversineDistance } from '../../utils/geo';

import { AuthSocket } from '../types';

export async function handleCatchAttempt(io: Server, socket: AuthSocket, data: { targetPlayerId?: string }) {
  const { targetPlayerId } = data;
  const gameId = socket.currentGameId;
  if (!gameId) return;

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: {
      userId: socket.userId,
      gameId,
      role: 'ghost',
      game: { phase: 'playing' },
    },
  });

  if (!gamePlayer) {
    socket.emit(S2C.ERROR, { message: 'You are not a ghost in an active game' });
    return;
  }

  // Auto-catch mode: no specific target, scan all nearby humans
  if (!targetPlayerId) {
    const candidates = findCatchableHumans(gameId, socket.userId);

    if (candidates.length === 0) {
      socket.emit(S2C.CATCH_RESULT, {
        success: false,
        ghostId: socket.userId,
        reason: '附近没有可抓捕的目标',
      });
      return;
    }

    if (candidates.length >= 2) {
      // Multiple targets — return candidate list for manual selection
      socket.emit('catch:candidates', { candidates });
      return;
    }

    // Exactly 1 target — auto-catch
    await executeCatch(io, socket, gameId, gamePlayer, candidates[0].userId, candidates[0].distance);
    return;
  }

  // Manual selection mode (target picked from candidate list)
  const target = await prisma.gamePlayer.findUnique({
    where: { id: targetPlayerId },
    include: { user: true },
  });

  if (!target || target.gameId !== gameId) {
    socket.emit(S2C.ERROR, { message: 'Invalid target' });
    return;
  }

  const result = attemptCatch(gameId, socket.userId, target.userId);

  if (result.success) {
    await executeCatch(io, socket, gameId, gamePlayer, target.userId, result.distance!);
  } else {
    socket.emit(S2C.CATCH_RESULT, {
      success: false,
      ghostId: socket.userId,
      humanId: target.userId,
      distance: result.distance,
      reason: result.reason,
    });
  }
}

async function executeCatch(io: Server, socket: AuthSocket, gameId: string, gamePlayer: any, targetUserId: string, distance: number) {
  const target = await prisma.gamePlayer.findFirst({
    where: { userId: targetUserId, gameId },
    include: { user: true },
  });
  if (!target) return;

  // Update DB
  await prisma.gamePlayer.update({
    where: { id: target.id },
    data: { isCaught: true, caughtAt: new Date(), caughtById: gamePlayer.id },
  });

  // Update in-memory session (needed for checkGameEnd and further catch attempts)
  const session = getSession(gameId);
  const caughtPlayer = session?.players.get(targetUserId);
  if (caughtPlayer) caughtPlayer.isCaught = true;

  // Update ghost score
  const ghost = session?.players.get(socket.userId);
  await prisma.gamePlayer.update({
    where: { id: gamePlayer.id },
    data: { score: { increment: 50 } },
  });

  // Update ghost team score in DB
  await prisma.team.updateMany({
    where: { gameId, name: 'ghost' },
    data: { score: { increment: 50 } },
  });

  // Create system message
  const msg = await prisma.chatMessage.create({
    data: {
      gameId,
      senderId: socket.userId,
      content: `${socket.username} 抓住了 ${target.user.username}!`,
      type: 'catch',
    },
  });

  io.to(`game:${gameId}`).emit(S2C.CATCH_RESULT, {
    success: true,
    ghostId: socket.userId,
    ghostName: socket.username,
    humanId: targetUserId,
    humanName: target.user.username,
    distance,
  });

  io.to(`game:${gameId}`).emit(S2C.PLAYER_CAUGHT, {
    humanId: targetUserId,
    ghostId: socket.userId,
  });

  io.to(`game:${gameId}`).emit(S2C.SCORE_UPDATE, {
    userId: socket.userId,
    score: ghost?.score || gamePlayer.score,
  });

  // Team score update
  const updatedGhostTeam = getSession(gameId)?.teams.get('ghost');
  if (updatedGhostTeam) {
    io.to(`game:${gameId}`).emit(S2C.SCORE_UPDATE, {
      teamName: 'ghost',
      teamScore: updatedGhostTeam.score,
    });
  } else {
    const dbTeam = await prisma.team.findFirst({ where: { gameId, name: 'ghost' } });
    if (dbTeam) {
      io.to(`game:${gameId}`).emit(S2C.SCORE_UPDATE, {
        teamName: 'ghost',
        teamScore: dbTeam.score,
      });
    }
  }

  io.to(`game:${gameId}`).emit(S2C.CHAT_MESSAGE, {
    id: msg.id,
    content: msg.content,
    type: 'catch',
    senderName: '系统',
    senderId: 'system',
    gameId,
    createdAt: msg.createdAt.toISOString(),
  });

  // Check if game should end
  const endCheck = checkGameEnd(gameId);
  if (endCheck.ended) {
    await endGame(io, gameId, endCheck.reason || 'all_caught');
  }
}

async function endGame(io: Server, gameId: string, reason: string) {
  // Update DB
  const game = await prisma.game.update({
    where: { id: gameId },
    data: { phase: 'finished', endedAt: new Date() },
    include: { players: true },
  });

  // Calculate final scores and update stats
  let humanSurvivors = 0;
  for (const p of game.players) {
    const survived = p.role === 'human' && !p.isCaught;
    if (survived) {
      humanSurvivors++;
      await prisma.gamePlayer.update({
        where: { id: p.id },
        data: { score: { increment: 100 } },
      });
    }

    // Update lifetime stats
    await prisma.stats.upsert({
      where: { userId: p.userId },
      create: { userId: p.userId, gamesPlayed: 1, totalPoints: p.score },
      update: {
        gamesPlayed: { increment: 1 },
        totalPoints: { increment: p.score },
        catchesAsGhost: p.role === 'ghost' ? { increment: game.players.filter((hp) => hp.caughtById === p.id).length } : undefined,
      },
    });
  }

  // Award team score for surviving humans
  if (humanSurvivors > 0) {
    await prisma.team.updateMany({
      where: { gameId, name: 'human' },
      data: { score: { increment: humanSurvivors * 100 } },
    });
  }

  // Fetch teams for GAME_OVER event
  const teams = await prisma.team.findMany({
    where: { gameId },
    select: { id: true, name: true, score: true, color: true },
  });

  const socketRoom = `game:${gameId}`;
  io.to(socketRoom).emit(S2C.GAME_OVER, {
    gameId,
    reason,
    players: game.players.map((p) => ({
      userId: p.userId,
      role: p.role,
      score: p.score,
      isCaught: p.isCaught,
    })),
    teams,
  });

  // Clean up in-memory session
  removeSession(gameId);
}

export async function handleGameEnd(io: Server, socket: AuthSocket) {
  const gameId = socket.currentGameId;
  if (!gameId) return;

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: {
      userId: socket.userId,
      gameId,
      role: 'referee',
      game: { phase: 'playing' },
    },
  });

  if (!gamePlayer) {
    socket.emit(S2C.ERROR, { message: 'Only referee can end the game' });
    return;
  }

  await endGame(io, gameId, 'referee_ended');
}

export async function handleToggleVisibility(io: Server, socket: AuthSocket) {
  const gameId = socket.currentGameId;
  if (!gameId) return;
  try {
    const gamePlayer = await prisma.gamePlayer.findFirst({
      where: {
        userId: socket.userId,
        gameId,
        role: 'referee',
        game: { phase: 'playing' },
      },
    });

    if (!gamePlayer) {
      socket.emit(S2C.ERROR, { message: 'Only referee can control visibility' });
      return;
    }

    const visible = toggleCrossVisibility(gameId);
    io.to(`game:${gameId}`).emit('cross_visibility_changed', { visible });

    // When enabling visibility, immediately broadcast all current positions
    if (visible) {
      const session = getSession(gameId);
      if (session) {
        for (const [, p] of session.players) {
          if (p.location && !p.invisibleUntil) {
            io.to(`game:${gameId}`).emit(S2C.LOCATION_PLAYER_MOVED, {
              playerId: p.id,
              userId: p.userId,
              username: p.username,
              lat: p.location.lat,
              lng: p.location.lng,
              role: p.role,
              teamName: p.teamName,
            });
          }
        }
      }
    }

    io.to(`game:${gameId}`).emit(S2C.BROADCAST_ANNOUNCEMENT, {
      id: '', content: `裁判${visible ? '开启' : '关闭'}了跨阵营可见`, from: '系统',
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message || 'Toggle failed' });
  }
}

export async function handleTaskComplete(io: Server, socket: AuthSocket, data: { taskId: string; lat: number; lng: number }) {
  const { taskId, lat, lng } = data;
  const gameId = socket.currentGameId;
  if (!gameId) return;

  const gamePlayer = await prisma.gamePlayer.findFirst({
    where: {
      userId: socket.userId,
      gameId,
      game: { phase: 'playing' },
    },
  });

  if (!gamePlayer) return;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !task.isActive || task.gameId !== gameId) {
    socket.emit(S2C.ERROR, { message: 'Task not available' });
    return;
  }

  // Check existing completion
  const existing = await prisma.taskSubmission.findFirst({
    where: { taskId, playerId: gamePlayer.id, status: 'approved' },
  });
  if (existing) {
    socket.emit(S2C.ERROR, { message: 'Task already completed' });
    return;
  }

  // Verify location proximity if task has target
  if (task.targetLat && task.targetLng) {
    const distance = haversineDistance(lat, lng, task.targetLat, task.targetLng);
    if (distance > (task.arriveRadiusM || 100)) {
      socket.emit(S2C.ERROR, { message: `Too far from task location (${Math.round(distance)}m away)` });
      return;
    }
  }

  // Complete the task
  const submission = await prisma.taskSubmission.create({
    data: {
      taskId,
      playerId: gamePlayer.id,
      pointsAwarded: task.points,
      status: 'approved',
    },
  });

  // Update player score
  await prisma.gamePlayer.update({
    where: { id: gamePlayer.id },
    data: { score: { increment: task.points } },
  });

  const session = getSession(gamePlayer.gameId);
  const player = session?.players.get(socket.userId);
  if (player) player.score += task.points;

  // Update team score
  if (player?.teamName) {
    const team = session?.teams.get(player.teamName);
    if (team) team.score += task.points;
    await prisma.team.updateMany({
      where: { gameId: gamePlayer.gameId, name: player.teamName },
      data: { score: { increment: task.points } },
    });
    let teamScore = team?.score;
    if (teamScore === undefined) {
      const dbTeam = await prisma.team.findFirst({ where: { gameId: gamePlayer.gameId, name: player.teamName } });
      teamScore = dbTeam?.score || 0;
    }
    io.to(`game:${gamePlayer.gameId}`).emit(S2C.SCORE_UPDATE, {
      teamName: player.teamName,
      teamScore,
    });
  }

  io.to(`game:${gamePlayer.gameId}`).emit(S2C.SCORE_UPDATE, {
    userId: socket.userId,
    score: player?.score ?? 0,
  });

  io.to(`game:${gamePlayer.gameId}`).emit(S2C.TASK_COMPLETED, {
    playerId: gamePlayer.id,
    userId: socket.userId,
    username: socket.username,
    taskId,
    points: task.points,
  });

  // Direct response to completer
  socket.emit('task:completed_result', {
    taskId,
    points: task.points,
  });
}

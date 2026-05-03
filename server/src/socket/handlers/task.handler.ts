import { Server } from 'socket.io';
import { S2C } from '@traffic-ghost/shared';
import prisma from '../../lib/prisma';
import { getSession, addTaskToSession } from '../game-session';
import { haversineDistance } from '../../utils/geo';

import { AuthSocket } from '../types';

export async function handleCreateTask(io: Server, socket: AuthSocket, data: {
  title: string; description?: string; conditionText?: string;
  points?: number; allowedTeams?: string;
  requireText?: boolean; requirePhoto?: boolean; requireLocation?: boolean;
  targetLat?: number; targetLng?: number; arriveRadiusM?: number;
}) {
  try {
    const gameId = socket.currentGameId;
    if (!gameId) { socket.emit(S2C.ERROR, { message: 'Not in game' }); return; }

    const ref = await prisma.gamePlayer.findFirst({
      where: { gameId, userId: socket.userId, role: 'referee' },
    });
    if (!ref) { socket.emit(S2C.ERROR, { message: 'Referee only' }); return; }

    const task = await prisma.task.create({
      data: {
        gameId, creatorId: socket.userId,
        title: data.title,
        description: data.description || null,
        conditionText: data.conditionText || null,
        points: data.points || 10,
        allowedTeams: data.allowedTeams || 'human,ghost',
        requireText: data.requireText ?? false,
        requirePhoto: data.requirePhoto ?? false,
        requireLocation: data.requireLocation ?? false,
        targetLat: data.targetLat,
        targetLng: data.targetLng,
        arriveRadiusM: data.arriveRadiusM || 100,
      },
    });

    addTaskToSession(gameId, task);

    io.to(`game:${gameId}`).emit('task:created', task);
    socket.emit('task:created_result', { success: true, task });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

export async function handleSubmitTask(io: Server, socket: AuthSocket, data: {
  gameId: string; taskId: string;
  textContent?: string; photoUrl?: string; lat?: number; lng?: number;
}) {
  const gameId = socket.currentGameId || data.gameId;
  if (!gameId) return;
  try {
    const { taskId, textContent, photoUrl, lat, lng } = data;

    const player = await prisma.gamePlayer.findFirst({
      where: { userId: socket.userId, gameId },
      include: { team: true },
    });
    if (!player) { socket.emit(S2C.ERROR, { message: 'Not in game' }); return; }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || !task.isActive) { socket.emit(S2C.ERROR, { message: 'Task not available' }); return; }

    // Check team eligibility
    const allowed = task.allowedTeams.split(',').map(s => s.trim());
    if (!allowed.includes(player.team?.name || '')) {
      socket.emit(S2C.ERROR, { message: 'Your team cannot complete this task' });
      return;
    }

    // Check existing pending submission
    const existing = await prisma.taskSubmission.findFirst({
      where: { taskId, playerId: player.id, status: 'pending' },
    });
    if (existing) { socket.emit(S2C.ERROR, { message: 'Already submitted, awaiting review' }); return; }

    // Check location requirement
    if (task.requireLocation && (!lat || !lng)) {
      socket.emit(S2C.ERROR, { message: 'Location upload required' }); return;
    }
    if (task.targetLat && task.targetLng && lat && lng) {
      const dist = haversineDistance(lat, lng, task.targetLat, task.targetLng);
      if (dist > (task.arriveRadiusM || 100)) {
        socket.emit(S2C.ERROR, { message: `Too far (${Math.round(dist)}m)` }); return;
      }
    }

    const submission = await prisma.taskSubmission.create({
      data: {
        taskId, playerId: player.id,
        textContent, photoUrl,
        locationLat: lat, locationLng: lng,
        status: 'pending',
      },
    });

    // Notify referee
    const refs = Array.from((await prisma.gamePlayer.findMany({
      where: { gameId, role: 'referee' },
    })));
    const socketRoom = `game:${gameId}`;
    for (const ref of refs) {
      const refSocket = Array.from(io.sockets.sockets.values()).find(
        s => (s as any).userId === ref.userId
      );
      if (refSocket) {
        refSocket.emit('task:submitted', {
          id: submission.id, taskId, playerId: player.id,
          username: socket.username, taskTitle: task.title,
          textContent, photoUrl, status: 'pending',
        });
      }
    }

    socket.emit('task:submitted', { success: true, submissionId: submission.id });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

export async function handleReviewTask(io: Server, socket: AuthSocket, data: {
  gameId: string; submissionId: string; approved: boolean; reviewNote?: string;
}) {
  const gameId = socket.currentGameId || data.gameId;
  if (!gameId) return;
  try {
    const { submissionId, approved, reviewNote } = data;

    const ref = await prisma.gamePlayer.findFirst({
      where: { userId: socket.userId, gameId, role: 'referee' },
    });
    if (!ref) { socket.emit(S2C.ERROR, { message: 'Referee only' }); return; }

    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      include: { task: true, player: { include: { team: true, user: true } } },
    });
    if (!submission || submission.status !== 'pending') {
      socket.emit(S2C.ERROR, { message: 'Submission not found' }); return;
    }

    const status = approved ? 'approved' : 'rejected';
    const points = approved ? submission.task.points : 0;

    await prisma.taskSubmission.update({
      where: { id: submissionId },
      data: { status, pointsAwarded: points, reviewerId: socket.userId, reviewNote, reviewedAt: new Date() },
    });

    if (approved && submission.player.team) {
      // Award points to team
      await prisma.team.update({
        where: { id: submission.player.team.id },
        data: { score: { increment: points } },
      });

      // Update session
      const session = getSession(gameId);
      const team = session?.teams.get(submission.player.team.name);
      if (team) team.score += points;

      // Emit team score update
      if (team) {
        io.to(`game:${gameId}`).emit(S2C.SCORE_UPDATE, {
          teamName: team.name,
          teamScore: team.score,
        });
      }
    }

    // Notify the submitter
    const submitterSocket = Array.from(io.sockets.sockets.values()).find(
      s => (s as any).userId === submission.player.userId
    );
    if (submitterSocket) {
      submitterSocket.emit('task:reviewed', {
        submissionId, taskTitle: submission.task.title,
        approved, points, reviewNote,
      });
    }

    io.to(`game:${gameId}`).emit(S2C.TASK_COMPLETED, {
      playerId: submission.player.id,
      userId: submission.player.userId,
      username: submission.player.user.username,
      teamName: submission.player.team?.name,
      taskId: submission.task.id,
      points,
      status,
    });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

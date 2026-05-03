import { Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import prisma from '../lib/prisma';
import { addTaskToSession } from '../socket/game-session';

async function resolveGameId(gameIdOrCode: string): Promise<string | null> {
  try {
    const game = await prisma.game.findUnique({ where: { id: gameIdOrCode } });
    if (game) return game.id;
    const byCode = await prisma.game.findUnique({ where: { code: gameIdOrCode } });
    return byCode?.id || null;
  } catch {
    return null;
  }
}

export async function createTask(req: AuthRequest, res: Response) {
  try {
    const gameId = await resolveGameId(req.params.gameId);
    if (!gameId) return res.status(404).json({ error: 'Game not found' });
    const { title, description, conditionText, points, allowedTeams, requireText, requirePhoto, requireLocation, targetLat, targetLng, arriveRadiusM, timeLimitSec } = req.body;

    const ref = await prisma.gamePlayer.findFirst({
      where: { gameId, userId: req.userId, role: 'referee' },
    });
    if (!ref) return res.status(403).json({ error: 'Referee only' });

    const task = await prisma.task.create({
      data: {
        gameId, creatorId: req.userId!,
        title, description, conditionText,
        points: points || 10,
        allowedTeams: allowedTeams || 'human,ghost',
        requireText: requireText ?? false,
        requirePhoto: requirePhoto ?? false,
        requireLocation: requireLocation ?? false,
        targetLat, targetLng,
        arriveRadiusM: arriveRadiusM || 100,
        timeLimitSec,
      },
    });

    addTaskToSession(gameId, task);

    try {
      const { io } = require('../index');
      io.to(`game:${gameId}`).emit('task:created', task);
    } catch {}

    res.status(201).json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateTask(req: AuthRequest, res: Response) {
  try {
    const gameId = await resolveGameId(req.params.gameId);
    if (!gameId) return res.status(404).json({ error: 'Game not found' });
    const { taskId } = req.params;
    const ref = await prisma.gamePlayer.findFirst({
      where: { gameId, userId: req.userId, role: 'referee' },
    });
    if (!ref) return res.status(403).json({ error: 'Referee only' });

    const task = await prisma.task.update({ where: { id: taskId }, data: req.body });

    try {
      const { io } = require('../index');
      io.to(`game:${gameId}`).emit('task:updated', task);
    } catch {}

    res.json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteTask(req: AuthRequest, res: Response) {
  try {
    const gameId = await resolveGameId(req.params.gameId);
    if (!gameId) return res.status(404).json({ error: 'Game not found' });
    const { taskId } = req.params;
    const ref = await prisma.gamePlayer.findFirst({
      where: { gameId, userId: req.userId, role: 'referee' },
    });
    if (!ref) return res.status(403).json({ error: 'Referee only' });

    await prisma.task.update({ where: { id: taskId }, data: { isActive: false } });

    try {
      const { io } = require('../index');
      io.to(`game:${gameId}`).emit('task:deleted', { taskId });
    } catch {}

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function getTasks(req: AuthRequest, res: Response) {
  try {
    const gameId = await resolveGameId(req.params.gameId);
    if (!gameId) return res.status(404).json({ error: 'Game not found' });
    const tasks = await prisma.task.findMany({
      where: { gameId, isActive: true },
      orderBy: { orderIndex: 'asc' },
    });
    res.json(tasks);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

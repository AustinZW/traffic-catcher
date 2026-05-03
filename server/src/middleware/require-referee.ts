import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import prisma from '../lib/prisma';

export async function requireReferee(req: AuthRequest, res: Response, next: NextFunction) {
  const gameId = req.params.gameId || req.params.id;
  if (!gameId) {
    return res.status(400).json({ error: 'Game ID required' });
  }

  const player = await prisma.gamePlayer.findFirst({
    where: { gameId, userId: req.userId, role: 'referee' },
  });

  if (!player) {
    return res.status(403).json({ error: 'Referee role required' });
  }

  next();
}

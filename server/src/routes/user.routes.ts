import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/authenticate';

const router = Router();

router.get('/me/history', authenticate, async (req: AuthRequest, res) => {
  const games = await prisma.gamePlayer.findMany({
    where: { userId: req.userId },
    include: { game: { select: { id: true, code: true, phase: true, startedAt: true, endedAt: true } } },
    orderBy: { joinedAt: 'desc' },
    take: 20,
  });
  res.json(games);
});

router.get('/:id/stats', authenticate, async (req, res) => {
  const stats = await prisma.stats.findUnique({ where: { userId: req.params.id } });
  if (!stats) return res.status(404).json({ error: 'Stats not found' });
  res.json(stats);
});

export default router;

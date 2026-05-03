import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate);

router.get('/items', async (_req, res) => {
  const items = await prisma.shopItem.findMany();
  res.json(items);
});

router.get('/inventory/:gameId', async (req: any, res) => {
  const player = await prisma.gamePlayer.findFirst({
    where: { userId: req.userId, gameId: req.params.gameId },
  });
  if (!player) return res.status(404).json({ error: 'Not in game' });

  const inventory = await prisma.playerItem.findMany({
    where: { playerId: player.id },
    include: { item: true },
  });
  res.json(inventory);
});

export default router;

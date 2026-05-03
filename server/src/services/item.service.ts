import prisma from '../lib/prisma';

export async function getShopItems() {
  return prisma.shopItem.findMany();
}

export async function getPlayerItems(playerId: string) {
  return prisma.playerItem.findMany({
    where: { playerId },
    include: { item: true },
  });
}

export async function buyItem(userId: string, gameId: string, itemId: string) {
  const player = await prisma.gamePlayer.findFirst({
    where: { userId, gameId },
    include: { team: true },
  });
  if (!player) throw new Error('Not in game');

  const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Item not found');

  // Check team eligibility
  if (item.team !== 'both' && item.team !== player.role) {
    throw new Error(`此道具仅限${item.team === 'ghost' ? '鬼队' : '人队'}购买`);
  }

  // Check team score (teams buy items, not individuals)
  const team = player.team;
  if (!team) throw new Error('Not on a team');

  if (team.score < item.price) {
    throw new Error(`积分不足。需要 ${item.price} 分，当前 ${team.score} 分`);
  }

  // Deduct team score
  await prisma.team.update({
    where: { id: team.id },
    data: { score: { decrement: item.price } },
  });

  // Add to player inventory
  const existing = await prisma.playerItem.findFirst({
    where: { playerId: player.id, itemId },
  });
  if (existing) {
    await prisma.playerItem.update({
      where: { id: existing.id },
      data: { quantity: { increment: 1 } },
    });
  } else {
    await prisma.playerItem.create({
      data: { playerId: player.id, itemId },
    });
  }

  return { success: true, item: item.name, price: item.price, teamName: team.name };
}

export async function useItem(userId: string, gameId: string, itemId: string, targetData?: any) {
  const player = await prisma.gamePlayer.findFirst({
    where: { userId, gameId },
    include: { team: true },
  });
  if (!player) throw new Error('Not in game');

  const inventory = await prisma.playerItem.findFirst({
    where: { playerId: player.id, itemId },
    include: { item: true },
  });
  if (!inventory || inventory.quantity < 1) throw new Error('道具不足');

  const item = inventory.item;

  // Check cooldown: find last usage of this item type in this game
  const lastUse = await prisma.itemUsage.findFirst({
    where: { gameId, itemId, userId },
    orderBy: { usedAt: 'desc' },
  });
  if (lastUse) {
    const cooldownMs = item.cooldownMin * 60 * 1000;
    if (Date.now() - lastUse.usedAt.getTime() < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (Date.now() - lastUse.usedAt.getTime())) / 60000);
      throw new Error(`冷却中，还需等待 ${remaining} 分钟`);
    }
  }

  // Reduce quantity
  if (inventory.quantity <= 1) {
    await prisma.playerItem.delete({ where: { id: inventory.id } });
  } else {
    await prisma.playerItem.update({
      where: { id: inventory.id },
      data: { quantity: { decrement: 1 }, usedAt: new Date() },
    });
  }

  // Record usage
  const effectMs = item.type === 'invincibility' ? 15 * 60 * 1000 :
                   item.type === 'pause' ? 10 * 60 * 1000 :
                   item.type === 'tracking' ? 10 * 60 * 1000 :
                   0;
  await prisma.itemUsage.create({
    data: {
      gameId,
      userId,
      itemId,
      effectEndsAt: effectMs ? new Date(Date.now() + effectMs) : null,
    },
  });

  return {
    success: true,
    itemType: item.type,
    itemName: item.name,
    broadcasts: item.broadcasts,
    team: player.role,
    targetData,
  };
}

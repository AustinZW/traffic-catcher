import prisma from '../lib/prisma';
import { generateUniqueCode } from '../utils/room-code';
import { MAX_PLAYERS, DEFAULT_DURATION_MIN, DEFAULT_ZONE_RADIUS_KM } from '@traffic-ghost/shared';

export async function createRoom(userId: string, data: {
  name?: string;
  maxPlayers?: number;
  teamAssignment?: string;
  crossTeamVisibilityMin?: number;
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm?: number;
  durationMin?: number;
}) {
  const code = await generateUniqueCode();
  const maxPlayers = Math.min(data.maxPlayers || MAX_PLAYERS, MAX_PLAYERS);

  const game = await prisma.game.create({
    data: {
      code,
      name: data.name || '',
      maxPlayers,
      teamAssignment: data.teamAssignment || 'system',
      crossTeamVisibilityMin: data.crossTeamVisibilityMin ?? 30,
      zoneLat: data.zoneLat,
      zoneLng: data.zoneLng,
      zoneRadiusKm: data.zoneRadiusKm ?? DEFAULT_ZONE_RADIUS_KM,
      durationMin: data.durationMin ?? DEFAULT_DURATION_MIN,
      phase: 'waiting',
    },
  });

  // Creator joins as referee by default
  await prisma.gamePlayer.create({
    data: { gameId: game.id, userId, role: 'referee' },
  });

  return {
    id: game.id, code: game.code, name: game.name, phase: game.phase,
    maxPlayers: game.maxPlayers, teamAssignment: game.teamAssignment,
    crossTeamVisibilityMin: game.crossTeamVisibilityMin,
    zoneRadiusKm: game.zoneRadiusKm, durationMin: game.durationMin,
  };
}

export async function listRooms(phase?: string) {
  const games = await prisma.game.findMany({
    where: { phase: phase || 'waiting' },
    include: { players: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return games.map((g) => ({
    id: g.id, code: g.code, name: g.name, phase: g.phase,
    playerCount: g.players.length, maxPlayers: g.maxPlayers,
    createdAt: g.createdAt.toISOString(),
  }));
}

export async function getRoomDetail(code: string) {
  const game = await prisma.game.findUnique({
    where: { code },
    include: {
      players: { include: { user: { select: { id: true, username: true } }, team: true } },
      teams: true,
    },
  });
  if (!game) throw new Error('Room not found');

  return {
    id: game.id, code: game.code, name: game.name, phase: game.phase,
    maxPlayers: game.maxPlayers, teamAssignment: game.teamAssignment,
    crossTeamVisibilityMin: game.crossTeamVisibilityMin,
    zoneLat: game.zoneLat, zoneLng: game.zoneLng,
    zoneRadiusKm: game.zoneRadiusKm, durationMin: game.durationMin,
    players: game.players.map((p) => ({
      id: p.id, userId: p.userId, username: p.user.username,
      role: p.role, teamId: p.teamId, teamName: p.team?.name,
      isReady: p.isReady, score: p.score, isCaught: p.isCaught, isRevived: p.isRevived,
    })),
    teams: game.teams.map((t) => ({ id: t.id, name: t.name, score: t.score, color: t.color })),
    createdAt: game.createdAt.toISOString(),
  };
}

export async function getGameById(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      players: { include: { user: { select: { id: true, username: true } }, team: true } },
      teams: true,
    },
  });
  if (!game) throw new Error('Game not found');
  return game;
}

export async function joinRoom(userId: string, code: string, rolePreference?: string) {
  const game = await prisma.game.findUnique({
    where: { code }, include: { players: true },
  });
  if (!game) throw new Error('Room not found');
  if (game.phase !== 'waiting' && game.phase !== 'lobby') throw new Error('Game already in progress');
  if (game.players.length >= game.maxPlayers) throw new Error('Room is full');

  const existing = game.players.find((p) => p.userId === userId);
  if (existing) throw new Error('Already in this room');

  let role = 'human';
  if (rolePreference === 'ghost') role = 'ghost';
  if (rolePreference === 'referee' && !game.players.some(p => p.role === 'referee')) {
    role = 'referee';
  }

  const player = await prisma.gamePlayer.create({
    data: { gameId: game.id, userId, role },
    include: { user: { select: { id: true, username: true } } },
  });

  return { id: player.id, userId: player.userId, username: player.user.username, role: player.role, isReady: player.isReady };
}

export async function leaveRoom(userId: string, code: string) {
  const game = await prisma.game.findUnique({ where: { code }, include: { players: true } });
  if (!game) throw new Error('Room not found');

  const player = game.players.find((p) => p.userId === userId);
  if (!player) throw new Error('Not in this room');

  await prisma.gamePlayer.delete({ where: { id: player.id } });

  const remaining = await prisma.gamePlayer.count({ where: { gameId: game.id } });
  if (remaining === 0) {
    await prisma.game.update({ where: { id: game.id }, data: { phase: 'cancelled' } });
  }
}

export async function startGame(userId: string, code: string) {
  const game = await prisma.game.findUnique({
    where: { code }, include: { players: true },
  });
  if (!game) throw new Error('Room not found');

  const player = game.players.find((p) => p.userId === userId);
  if (!player || player.role !== 'referee') throw new Error('Only the referee can start');

  const nonRef = game.players.filter((p) => p.role !== 'referee');
  if (nonRef.length < 2) throw new Error('Need at least 2 players (excluding referee)');

  // Create teams
  const ghostTeam = await prisma.team.create({
    data: { gameId: game.id, name: 'ghost', color: '#EF4444' },
  });
  const humanTeam = await prisma.team.create({
    data: { gameId: game.id, name: 'human', color: '#3B82F6' },
  });

  // Assign players to teams based on assignment mode
  if (game.teamAssignment === 'manual' || game.teamAssignment === 'referee') {
    // Players already chose their roles; assign accordingly
    for (const p of nonRef) {
      const teamId = p.role === 'ghost' ? ghostTeam.id : humanTeam.id;
      await prisma.gamePlayer.update({ where: { id: p.id }, data: { teamId } });
    }
  } else {
    // System assignment: ensure at least 1 ghost per 4 humans
    const total = nonRef.length;
    const ghostCount = nonRef.filter((p) => p.role === 'ghost').length;
    let ghostsNeeded = Math.max(1, Math.ceil(total / 5)); // at least 1, roughly 20% ghosts

    // First assign those who chose ghost
    const chosenGhosts = nonRef.filter((p) => p.role === 'ghost');
    for (const g of chosenGhosts) {
      await prisma.gamePlayer.update({ where: { id: g.id }, data: { teamId: ghostTeam.id } });
      ghostsNeeded--;
    }

    // Assign remaining players
    const remaining = nonRef.filter((p) => p.role !== 'ghost');
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

  await prisma.game.update({
    where: { id: game.id },
    data: { phase: 'playing', startedAt: new Date() },
  });

  return game.id;
}

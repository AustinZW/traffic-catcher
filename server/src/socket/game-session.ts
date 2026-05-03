import prisma from '../lib/prisma';
import { haversineDistance } from '../utils/geo';
import { CATCH_RADIUS_M } from '@traffic-ghost/shared';

interface PlayerLocation { lat: number; lng: number; updatedAt: number; }

interface SessionPlayer {
  id: string;
  userId: string;
  username: string;
  role: string;
  teamId?: string;
  teamName?: string;
  score: number;
  isReady: boolean;
  isCaught: boolean;
  isRevived: boolean;
  location?: PlayerLocation;
  socketId?: string;
  disconnectedAt?: number;
  // Item effects
  invincibleUntil?: number;    // invincibility card
  invisibleUntil?: number;     // invisibility card (skip location sharing)
  pausedUntil?: number;        // pause card
}

interface ActiveEffect {
  type: string;
  teamName: string;
  endsAt: number;
  data?: any;
}

interface GameSession {
  id: string;
  code: string;
  phase: string;
  players: Map<string, SessionPlayer>;
  tasks: any[];
  teams: Map<string, { id: string; name: string; score: number; color: string }>;
  startTime?: number;
  durationMin: number;
  crossTeamVisibilityMin: number;
  crossTeamVisibleOverride: boolean | null;  // referee toggle: null=auto(time), true=forced on, false=forced off
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm: number;
  activeEffects: ActiveEffect[];
  traps: { lat: number; lng: number; stationName: string; ghostUserId: string }[];
}

const sessions = new Map<string, GameSession>();

export function getSession(gameId: string): GameSession | undefined {
  return sessions.get(gameId);
}

export async function initSession(gameId: string): Promise<GameSession> {
  const existing = sessions.get(gameId);

  let game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      players: { include: { user: { select: { id: true, username: true } }, team: true } },
      tasks: true,
      teams: true,
    },
  });
  if (!game) throw new Error('Game not found');

  // Ensure teams exist for playing games (backfill for games started before team creation was wired)
  if ((game.phase === 'playing' || game.phase === 'countdown') && game.teams.length === 0) {
    const ghostTeam = await prisma.team.create({
      data: { gameId, name: 'ghost', color: '#EF4444' },
    });
    const humanTeam = await prisma.team.create({
      data: { gameId, name: 'human', color: '#3B82F6' },
    });
    // Assign players to teams based on role
    for (const p of game.players) {
      if (p.role === 'referee') continue;
      const teamId = p.role === 'ghost' ? ghostTeam.id : humanTeam.id;
      await prisma.gamePlayer.update({
        where: { id: p.id },
        data: { teamId },
      });
    }
    // Reload game with teams
    const reloaded = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: { include: { user: { select: { id: true, username: true } }, team: true } },
        tasks: true,
        teams: true,
      },
    });
    if (reloaded) game = reloaded;

    // Broadcast team info to connected clients
    try {
      const { io } = require('../index');
      io.to(`game:${gameId}`).emit('score:update', {
        teamName: 'ghost',
        teamScore: 0,
      });
      io.to(`game:${gameId}`).emit('score:update', {
        teamName: 'human',
        teamScore: 0,
      });
    } catch {}
  }

  if (existing) {
    // Merge DB state into existing session — preserve locations and active effects
    for (const p of game.players) {
      const ep = existing.players.get(p.userId);
      if (!ep) {
        existing.players.set(p.userId, {
          id: p.id, userId: p.userId, username: p.user.username,
          role: p.role,
          teamId: p.teamId ?? undefined,
          teamName: p.team?.name ?? undefined,
          score: p.score, isReady: p.isReady,
          isCaught: p.isCaught, isRevived: p.isRevived,
        });
      } else {
        ep.isCaught = p.isCaught;
        ep.isRevived = p.isRevived;
        ep.score = p.score;
        ep.role = p.role;
        ep.teamId = p.teamId ?? undefined;
        ep.teamName = p.team?.name ?? undefined;
      }
    }
    // Merge teams
    for (const t of game.teams) {
      const et = existing.teams.get(t.name);
      if (et) {
        et.score = t.score;
      } else {
        existing.teams.set(t.name, { id: t.id, name: t.name, score: t.score, color: t.color });
      }
    }

    // Update tasks
    existing.tasks = game.tasks.filter(t => t.isActive).map(t => ({
      id: t.id, title: t.title, description: t.description,
      conditionText: t.conditionText, points: t.points,
      allowedTeams: t.allowedTeams.split(',').map(s => s.trim()),
      requireText: t.requireText, requirePhoto: t.requirePhoto,
      requireLocation: t.requireLocation,
      targetLat: t.targetLat, targetLng: t.targetLng,
      arriveRadiusM: t.arriveRadiusM, isActive: t.isActive,
    }));
    return existing;
  }

  const players = new Map<string, SessionPlayer>();
  for (const p of game.players) {
    players.set(p.userId, {
      id: p.id,
      userId: p.userId,
      username: p.user.username,
      role: p.role,
      teamId: p.teamId ?? undefined,
      teamName: p.team?.name ?? undefined,
      score: p.score,
      isReady: p.isReady,
      isCaught: p.isCaught,
      isRevived: p.isRevived,
    });
  }

  const teams = new Map<string, { id: string; name: string; score: number; color: string }>();
  for (const t of game.teams) {
    teams.set(t.name, { id: t.id, name: t.name, score: t.score, color: t.color });
  }

  const session: GameSession = {
    id: game.id,
    code: game.code,
    phase: game.phase,
    players,
    teams,
    tasks: game.tasks.filter(t => t.isActive).map(t => ({
      id: t.id, title: t.title, description: t.description,
      conditionText: t.conditionText, points: t.points,
      allowedTeams: t.allowedTeams.split(',').map(s => s.trim()),
      requireText: t.requireText, requirePhoto: t.requirePhoto,
      requireLocation: t.requireLocation,
      targetLat: t.targetLat, targetLng: t.targetLng,
      arriveRadiusM: t.arriveRadiusM, isActive: t.isActive,
    })),
    durationMin: game.durationMin,
    crossTeamVisibilityMin: game.crossTeamVisibilityMin,
    crossTeamVisibleOverride: null,
    zoneLat: game.zoneLat ?? undefined,
    zoneLng: game.zoneLng ?? undefined,
    zoneRadiusKm: game.zoneRadiusKm,
    activeEffects: [],
    traps: [],
  };

  sessions.set(gameId, session);
  return session;
}

export function updatePlayerLocation(gameId: string, userId: string, lat: number, lng: number) {
  const session = sessions.get(gameId);
  if (!session) return;
  const player = session.players.get(userId);
  if (!player) return;
  if (player.pausedUntil && Date.now() < player.pausedUntil) return; // paused
  player.location = { lat, lng, updatedAt: Date.now() };
}

export function getVisiblePlayers(gameId: string, viewerUserId: string): SessionPlayer[] {
  const session = sessions.get(gameId);
  if (!session) return [];

  const viewer = session.players.get(viewerUserId);
  if (!viewer) return [];

  const allPlayers = Array.from(session.players.values()).filter(p => p.role !== 'referee' && p.location);

  // Referee sees everyone
  if (viewer.role === 'referee') {
    return allPlayers.filter(p => p.userId !== viewerUserId);
  }

  if (!viewer.teamName) return [];

  const gameElapsed = session.startTime ? (Date.now() - session.startTime) / 60000 : 0;
  const crossTeamVisible = session.crossTeamVisibleOverride !== null
    ? session.crossTeamVisibleOverride
    : gameElapsed >= session.crossTeamVisibilityMin;

  // Check for tracking card effect
  const trackingEffect = session.activeEffects.find(e => e.type === 'tracking' && Date.now() < e.endsAt);

  return allPlayers.filter(target => {
    if (target.userId === viewerUserId) return false;

    // Same team: always visible
    if (target.teamName === viewer.teamName) return true;

    // Check invisibility
    if (target.invisibleUntil && Date.now() < target.invisibleUntil) return false;

    // Cross-team visibility: override toggle, time threshold, or tracking effect
    if (crossTeamVisible) return true;
    if (trackingEffect && target.teamName === 'human' && viewer.teamName === 'ghost') return true;

    return false;
  });
}

export function attemptCatch(gameId: string, ghostUserId: string, targetUserId: string): {
  success: boolean; distance?: number; reason?: string;
} {
  const session = sessions.get(gameId);
  if (!session) return { success: false };

  const ghost = session.players.get(ghostUserId);
  const target = session.players.get(targetUserId);
  if (!ghost || !target) return { success: false };
  if (ghost.role !== 'ghost' || ghost.teamName !== 'ghost') return { success: false };
  if (target.isCaught) return { success: false };
  if (!ghost.location || !target.location) return { success: false };

  // Check location freshness — both must be updated within last 30 seconds
  const now = Date.now();
  const maxAge = 30_000;
  if (now - ghost.location.updatedAt > maxAge) {
    return { success: false, reason: '你的位置已过期，请移动后重试' };
  }
  if (now - target.location.updatedAt > maxAge) {
    return { success: false, reason: '目标位置已过期，无法抓捕' };
  }

  // Check if ghost is paused
  if (ghost.pausedUntil && now < ghost.pausedUntil) return { success: false };

  const distance = haversineDistance(
    ghost.location.lat, ghost.location.lng,
    target.location.lat, target.location.lng
  );

  // Check invincibility (check after computing distance so we can report it)
  if (target.invincibleUntil && now < target.invincibleUntil) {
    target.invincibleUntil = undefined;
    return { success: false, distance };
  }

  if (distance <= CATCH_RADIUS_M) {
    target.isCaught = true;
    // Award individual and team score
    ghost.score += 50;
    const ghostTeam = session.teams.get('ghost');
    if (ghostTeam) ghostTeam.score += 50;
    return { success: true, distance };
  }

  return { success: false, distance };
}

// Find all catchable humans within range of a ghost (for auto-catch)
export function findCatchableHumans(gameId: string, ghostUserId: string): Array<{ userId: string; username: string; distance: number; blockedReason?: string }> {
  const session = sessions.get(gameId);
  if (!session) return [];

  const ghost = session.players.get(ghostUserId);
  if (!ghost || ghost.role !== 'ghost' || !ghost.location) return [];

  const now = Date.now();
  const maxAge = 30_000;
  if (now - ghost.location.updatedAt > maxAge) return [];
  if (ghost.pausedUntil && now < ghost.pausedUntil) return [];

  const humans = Array.from(session.players.values()).filter(p =>
    p.role === 'human' && !p.isCaught && p.location
  );

  const results: Array<{ userId: string; username: string; distance: number; blockedReason?: string }> = [];

  for (const human of humans) {
    if (now - human.location!.updatedAt > maxAge) continue;
    if (human.invincibleUntil && now < human.invincibleUntil) continue;

    const distance = haversineDistance(
      ghost.location.lat, ghost.location.lng,
      human.location!.lat, human.location!.lng
    );

    if (distance <= CATCH_RADIUS_M) {
      results.push({
        userId: human.userId,
        username: human.username,
        distance,
      });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}

export function checkGameEnd(gameId: string): { ended: boolean; reason?: string } {
  const session = sessions.get(gameId);
  if (!session) return { ended: false };

  // Guard: don't check game end within 10 seconds of start (prevents init race conditions)
  if (session.startTime && (Date.now() - session.startTime) < 10000) {
    return { ended: false };
  }

  const humans = Array.from(session.players.values()).filter(p => p.role === 'human' && !p.isCaught);
  if (humans.length === 0) return { ended: true, reason: 'all_caught' };

  if (session.startTime) {
    if ((Date.now() - session.startTime) / 1000 >= session.durationMin * 60) {
      return { ended: true, reason: 'time_up' };
    }
  }

  return { ended: false };
}

export function addTaskToSession(gameId: string, task: any) {
  const session = sessions.get(gameId);
  if (!session) return;
  session.tasks.push({
    id: task.id, title: task.title, description: task.description,
    conditionText: task.conditionText, points: task.points,
    allowedTeams: (task.allowedTeams || 'human,ghost').split(',').map((s: string) => s.trim()),
    requireText: task.requireText ?? false, requirePhoto: task.requirePhoto ?? false,
    requireLocation: task.requireLocation ?? false,
    targetLat: task.targetLat, targetLng: task.targetLng,
    arriveRadiusM: task.arriveRadiusM, isActive: task.isActive,
  });
}

export function addEffect(gameId: string, effect: ActiveEffect) {
  const session = sessions.get(gameId);
  if (session) session.activeEffects.push(effect);
}

export function applyPlayerEffect(gameId: string, userId: string, effectType: string, durationMs: number) {
  const session = sessions.get(gameId);
  if (!session) return;
  const player = session.players.get(userId);
  if (!player) return;
  const until = Date.now() + durationMs;
  if (effectType === 'invincibility') player.invincibleUntil = until;
  if (effectType === 'invisibility') player.invisibleUntil = until;
  if (effectType === 'pause') {
    // Pause applies to the opposing team
    const oppositeTeam = player.teamName === 'ghost' ? 'human' : 'ghost';
    session.activeEffects.push({ type: 'pause', teamName: oppositeTeam, endsAt: until });
    for (const [, p] of session.players) {
      if (p.teamName === oppositeTeam) p.pausedUntil = until;
    }
  }
}

export function addTrap(gameId: string, trap: { lat: number; lng: number; stationName: string; ghostUserId: string }) {
  const session = sessions.get(gameId);
  if (session) session.traps.push(trap);
}

export function checkTraps(gameId: string, userId: string, lat: number, lng: number): { triggered: boolean; trap?: any } {
  const session = sessions.get(gameId);
  if (!session) return { triggered: false };

  const player = session.players.get(userId);
  if (!player || player.teamName !== 'human') return { triggered: false };

  for (let i = 0; i < session.traps.length; i++) {
    const trap = session.traps[i];
    const dist = haversineDistance(lat, lng, trap.lat, trap.lng);
    if (dist <= 200) { // within 200m of trap
      session.traps.splice(i, 1);
      return { triggered: true, trap };
    }
  }
  return { triggered: false };
}

export function revivePlayer(gameId: string, targetUserId: string): boolean {
  const session = sessions.get(gameId);
  if (!session) return false;
  const player = session.players.get(targetUserId);
  if (!player || !player.isCaught || player.isRevived) return false;
  player.isCaught = false;
  player.isRevived = true;
  return true;
}

export function toggleCrossVisibility(gameId: string): boolean {
  const session = sessions.get(gameId);
  if (!session) return false;
  // Three-state: null (auto) → true (forced on) → false (forced off) → null (auto)
  if (session.crossTeamVisibleOverride === null) {
    session.crossTeamVisibleOverride = true;
  } else if (session.crossTeamVisibleOverride === true) {
    session.crossTeamVisibleOverride = false;
  } else {
    session.crossTeamVisibleOverride = null;
  }
  return session.crossTeamVisibleOverride === true;
}

export function setSessionPhase(gameId: string, phase: string) {
  const session = sessions.get(gameId);
  if (session) {
    session.phase = phase;
    if (phase === 'playing') session.startTime = Date.now();
  }
}

export function removeSession(gameId: string) {
  sessions.delete(gameId);
}

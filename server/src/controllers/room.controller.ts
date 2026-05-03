import { Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import * as roomService from '../services/room.service';

export async function create(req: AuthRequest, res: Response) {
  try {
    const room = await roomService.createRoom(req.userId!, req.body);
    res.status(201).json(room);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const phase = req.query.phase as string | undefined;
    const rooms = await roomService.listRooms(phase);
    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function detail(req: AuthRequest, res: Response) {
  try {
    const room = await roomService.getRoomDetail(req.params.code);
    res.json(room);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
}

export async function join(req: AuthRequest, res: Response) {
  try {
    const player = await roomService.joinRoom(req.userId!, req.params.code, req.body.rolePreference);
    res.json(player);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function leave(req: AuthRequest, res: Response) {
  try {
    await roomService.leaveRoom(req.userId!, req.params.code);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function start(req: AuthRequest, res: Response) {
  try {
    const gameId = await roomService.startGame(req.userId!, req.params.code);

    // Initialize game session and emit socket events
    try {
      const { io } = require('../index');
      const { initSession, setSessionPhase } = require('../socket/game-session');
      await initSession(gameId);
      setSessionPhase(gameId, 'playing');

      const socketRoom = `game:${gameId}`;
      io.to(socketRoom).emit('game:phase_change', { phase: 'countdown', countdownSeconds: 5, gameId });

      setTimeout(async () => {
        try {
          const game = await roomService.getGameById(gameId);
          io.to(socketRoom).emit('game:phase_change', {
            phase: 'playing',
            gameId,
            crossTeamVisibilityMin: game.crossTeamVisibilityMin,
            teams: game.teams?.map((t: any) => ({ id: t.id, name: t.name, score: t.score, color: t.color })) || [],
            players: game.players?.map((p: any) => ({
              id: p.id, userId: p.userId, username: p.user?.username || p.username,
              role: p.role, teamId: p.teamId, teamName: p.team?.name,
              score: p.score, isReady: p.isReady, isCaught: p.isCaught,
            })) || [],
          });
        } catch {}
      }, 5000);
    } catch {}

    res.json({ gameId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

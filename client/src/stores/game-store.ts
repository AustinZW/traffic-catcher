import { create } from 'zustand';
import type { GamePhase, PlayerRole } from '@traffic-ghost/shared';

interface GamePlayer {
  id: string;
  userId: string;
  username: string;
  role: PlayerRole;
  teamId?: string | null;
  teamName?: string | null;
  score: number;
  isReady: boolean;
  isCaught: boolean;
  isRevived: boolean;
  lat?: number;
  lng?: number;
}

interface TeamInfo {
  id: string;
  name: string;
  score: number;
  color: string;
}

interface GameTask {
  id: string;
  title: string;
  description?: string;
  conditionText?: string;
  points: number;
  allowedTeams: string;
  requireText?: boolean;
  requirePhoto?: boolean;
  requireLocation?: boolean;
  targetLat?: number;
  targetLng?: number;
  arriveRadiusM?: number;
  isActive: boolean;
}

interface GameState {
  gameId: string | null;
  phase: GamePhase;
  countdown: number;
  players: GamePlayer[];
  teams: TeamInfo[];
  tasks: GameTask[];
  myRole: PlayerRole | null;
  timeLeft: number;
  setGame: (gameId: string, players: GamePlayer[], teams?: TeamInfo[], tasks?: GameTask[]) => void;
  setPhase: (phase: GamePhase) => void;
  setCountdown: (seconds: number) => void;
  updatePlayerLocation: (userId: string, lat: number, lng: number) => void;
  updatePlayerScore: (userId: string, score: number) => void;
  updateTeamScore: (teamName: string, score: number) => void;
  catchPlayer: (userId: string) => void;
  removePlayer: (userId: string) => void;
  addPlayer: (player: GamePlayer) => void;
  addTask: (task: GameTask) => void;
  updateTask: (task: GameTask) => void;
  removeTask: (taskId: string) => void;
  setTimeLeft: (seconds: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set, _get) => ({
  gameId: null,
  phase: 'lobby',
  countdown: 0,
  players: [],
  teams: [],
  tasks: [],
  myRole: null,
  timeLeft: 0,

  setGame: (gameId, players, teams, tasks) => set({
    gameId, players,
    ...(teams ? { teams } : {}),
    ...(tasks ? { tasks } : {}),
  }),

  setPhase: (phase) => set({ phase }),

  setCountdown: (countdown) => set({ countdown }),

  updatePlayerLocation: (userId, lat, lng) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === userId ? { ...p, lat, lng } : p
      ),
    }));
  },

  updatePlayerScore: (userId, score) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === userId ? { ...p, score } : p
      ),
    }));
  },

  updateTeamScore: (teamName, score) => {
    set((state) => {
      const existing = state.teams.find((t) => t.name === teamName);
      if (existing) {
        return {
          teams: state.teams.map((t) =>
            t.name === teamName ? { ...t, score } : t
          ),
        };
      }
      // Team not in store yet — add it
      return {
        teams: [...state.teams, {
          id: '',
          name: teamName,
          score,
          color: teamName === 'ghost' ? '#EF4444' : '#3B82F6',
        }],
      };
    });
  },

  catchPlayer: (userId) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === userId ? { ...p, isCaught: true } : p
      ),
    }));
  },

  removePlayer: (userId) => {
    set((state) => ({
      players: state.players.filter((p) => p.userId !== userId),
    }));
  },

  addPlayer: (player) => {
    set((state) => {
      if (state.players.find((p) => p.userId === player.userId)) return state;
      return { players: [...state.players, player] };
    });
  },

  setTimeLeft: (timeLeft) => set({ timeLeft }),

  addTask: (task) => {
    set((state) => {
      if (state.tasks.find((t) => t.id === task.id)) return state;
      return { tasks: [...state.tasks, task] };
    });
  },

  updateTask: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  removeTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  reset: () => set({
    gameId: null,
    phase: 'lobby',
    countdown: 0,
    players: [],
    teams: [],
    tasks: [],
    myRole: null,
    timeLeft: 0,
  }),
}));

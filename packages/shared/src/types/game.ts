export type GamePhase = 'lobby' | 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
export type TeamAssignment = 'manual' | 'referee' | 'system';
export type TeamName = 'ghost' | 'human';

export interface GameConfig {
  maxPlayers: number;
  teamAssignment: TeamAssignment;
  crossTeamVisibilityMin: number;
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm: number;
  durationMin: number;
}

export interface GameState {
  id: string;
  code: string;
  name: string;
  phase: GamePhase;
  config: GameConfig;
  teams: TeamState[];
  players: PlayerState[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface TeamState {
  id: string;
  name: TeamName;
  score: number;
  color: string;
}

export interface PlayerState {
  id: string;
  userId: string;
  username: string;
  role: PlayerRole;
  teamId?: string;
  teamName?: TeamName;
  score: number;
  isReady: boolean;
  isCaught: boolean;
  isRevived: boolean;
  lat?: number;
  lng?: number;
}

export type PlayerRole = 'ghost' | 'human' | 'referee';

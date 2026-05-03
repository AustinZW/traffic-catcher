import { GamePhase } from './game';

export interface RoomInfo {
  id: string;
  code: string;
  name: string;
  phase: GamePhase;
  playerCount: number;
  maxPlayers: number;
  createdAt: string;
}

export interface RoomDetail {
  id: string;
  code: string;
  name: string;
  phase: GamePhase;
  maxPlayers: number;
  zoneLat?: number;
  zoneLng?: number;
  zoneRadiusKm: number;
  durationMin: number;
  players: RoomPlayer[];
  createdAt: string;
}

export interface RoomPlayer {
  id: string;
  userId: string;
  username: string;
  role: string;
  isReady: boolean;
  teamId?: string | null;
  teamName?: string | null;
  score?: number;
  isCaught?: boolean;
  isRevived?: boolean;
}

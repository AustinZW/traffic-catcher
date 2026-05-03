import { PlayerRole } from './game';

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  rolePreference?: string | null;
  avatarUrl?: string;
  createdAt: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
  catchesAsGhost: number;
  tasksCompleted: number;
  winRate: number;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

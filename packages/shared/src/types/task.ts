export type TaskType = 'location' | 'photo' | 'trivia' | 'custom';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface TaskData {
  id: string;
  gameId: string;
  creatorId: string;
  title: string;
  description?: string;
  conditionText?: string;
  type: TaskType;
  points: number;
  allowedTeams: string[];
  requireText: boolean;
  requirePhoto: boolean;
  requireLocation: boolean;
  targetLat?: number;
  targetLng?: number;
  arriveRadiusM: number;
  timeLimitSec?: number;
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  playerId: string;
  textContent?: string;
  photoUrl?: string;
  locationLat?: number;
  locationLng?: number;
  status: SubmissionStatus;
  pointsAwarded: number;
  reviewerId?: string;
  reviewNote?: string;
  submittedAt: string;
  reviewedAt?: string;
}

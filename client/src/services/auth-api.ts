import { api } from './api';
import type { AuthResponse, UserProfile } from '@traffic-ghost/shared';

export const authApi = {
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const { data } = await api.post('/auth/login', { username, password });
    return data;
  },

  register: async (username: string, password: string, email?: string): Promise<AuthResponse> => {
    const { data } = await api.post('/auth/register', { username, password, email });
    return data;
  },

  me: async (): Promise<UserProfile> => {
    const { data } = await api.get('/auth/me');
    return data;
  },
};

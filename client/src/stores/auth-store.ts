import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserProfile } from '@traffic-ghost/shared';
import { authApi } from '../services/auth-api';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
          const data = await authApi.login(username, password);
          set({ token: data.token, user: data.user, isLoading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.error || 'Login failed', isLoading: false });
          throw err;
        }
      },

      register: async (username, password, email) => {
        set({ isLoading: true, error: null });
        try {
          const data = await authApi.register(username, password, email);
          set({ token: data.token, user: data.user, isLoading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.error || 'Registration failed', isLoading: false });
          throw err;
        }
      },

      logout: () => set({ token: null, user: null, error: null }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

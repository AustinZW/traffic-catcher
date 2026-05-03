import { create } from 'zustand';
import type { RoomInfo, RoomDetail } from '@traffic-ghost/shared';

interface RoomState {
  rooms: RoomInfo[];
  currentRoom: RoomDetail | null;
  isLoading: boolean;
  setRooms: (rooms: RoomInfo[]) => void;
  setCurrentRoom: (room: RoomDetail | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoom: null,
  isLoading: false,
  setRooms: (rooms) => set({ rooms }),
  setCurrentRoom: (room) => set({ currentRoom: room }),
  setLoading: (loading) => set({ isLoading: loading }),
}));

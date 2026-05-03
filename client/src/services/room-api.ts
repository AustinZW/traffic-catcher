import { api } from './api';
import type { RoomInfo, RoomDetail } from '@traffic-ghost/shared';

export const roomApi = {
  create: async (data: {
    name?: string;
    maxPlayers?: number;
    zoneLat?: number;
    zoneLng?: number;
    zoneRadiusKm?: number;
    durationMin?: number;
  }) => {
    const { data: room } = await api.post('/rooms', data);
    return room;
  },

  list: async (phase?: string): Promise<RoomInfo[]> => {
    const { data } = await api.get('/rooms', { params: { phase } });
    return data;
  },

  detail: async (code: string): Promise<RoomDetail> => {
    const { data } = await api.get(`/rooms/${code}`);
    return data;
  },

  join: async (code: string, rolePreference?: string) => {
    const { data } = await api.post(`/rooms/${code}/join`, { rolePreference });
    return data;
  },

  leave: async (code: string) => {
    await api.post(`/rooms/${code}/leave`);
  },

  start: async (code: string) => {
    const { data } = await api.post(`/rooms/${code}/start`);
    return data;
  },
};

import { Server } from 'socket.io';
import { S2C } from '@traffic-ghost/shared';
import prisma from '../../lib/prisma';
import { getSession, applyPlayerEffect, addEffect, revivePlayer, addTrap } from '../game-session';
import { buyItem, useItem } from '../../services/item.service';

import { AuthSocket } from '../types';

export async function handleBuyItem(io: Server, socket: AuthSocket, data: { gameId: string; itemId: string }) {
  const gameId = socket.currentGameId || data.gameId;
  if (!gameId) return;
  try {
    const result = await buyItem(socket.userId, gameId, data.itemId);

    // Sync session team score
    const session = getSession(gameId);
    if (session && result.teamName) {
      const team = session.teams.get(result.teamName);
      if (team) team.score -= result.price;
    }

    socket.emit('item:bought', { success: true, itemName: result.item, price: result.price });

    // Broadcast updated team score to all players in the room
    const updatedTeam = session?.teams.get(result.teamName);
    if (updatedTeam) {
      io.to(`game:${gameId}`).emit(S2C.SCORE_UPDATE, {
        teamName: result.teamName,
        teamScore: updatedTeam.score,
      });
    } else {
      const dbTeam = await prisma.team.findFirst({ where: { gameId, name: result.teamName } });
      if (dbTeam) {
        io.to(`game:${gameId}`).emit(S2C.SCORE_UPDATE, {
          teamName: result.teamName,
          teamScore: dbTeam.score,
        });
      }
    }

    // Broadcast if item broadcasts on acquire
    const item = await prisma.shopItem.findUnique({ where: { id: data.itemId } });
    if (item && (item.broadcasts === 'onAcquire' || item.broadcasts === 'both')) {
      io.to(`game:${gameId}`).emit(S2C.BROADCAST_ANNOUNCEMENT, {
        id: '', content: `${socket.username} 获得了【${item.name}】!`,
        from: '系统', createdAt: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

export async function handleUseItem(io: Server, socket: AuthSocket, data: { gameId: string; itemId: string; targetUserId?: string; stationLat?: number; stationLng?: number; stationName?: string }) {
  const gameId = socket.currentGameId || data.gameId;
  if (!gameId) return;
  try {
    const result = await useItem(socket.userId, gameId, data.itemId, data);

    // Apply game effect based on item type
    const session = getSession(gameId);
    const socketRoom = `game:${gameId}`;

    switch (result.itemType) {
      case 'pause': {
        applyPlayerEffect(gameId, socket.userId, 'pause', 10 * 60 * 1000);
        io.to(socketRoom).emit(S2C.BROADCAST_ANNOUNCEMENT, {
          id: '', content: `【暂停卡】对方全队被暂停10分钟！`,
          from: '系统', createdAt: new Date().toISOString(),
        });
        break;
      }
      case 'invisibility': {
        applyPlayerEffect(gameId, socket.userId, 'invisibility', 60 * 60 * 1000);
        // No broadcast for invisibility
        break;
      }
      case 'invincibility': {
        applyPlayerEffect(gameId, socket.userId, 'invincibility', 15 * 60 * 1000);
        // Already broadcast on acquire
        break;
      }
      case 'revive': {
        if (data.targetUserId) {
          const revived = revivePlayer(gameId, data.targetUserId);
          if (revived) {
            io.to(socketRoom).emit(S2C.BROADCAST_ANNOUNCEMENT, {
              id: '', content: `【复活卡】${socket.username} 复活了一名队友！`,
              from: '系统', createdAt: new Date().toISOString(),
            });
            // Also update DB
            const target = session?.players.get(data.targetUserId);
            if (target) {
              await prisma.gamePlayer.update({
                where: { id: target.id },
                data: { isCaught: false, isRevived: true },
              });
            }
          }
        }
        break;
      }
      case 'trap': {
        if (data.stationLat && data.stationLng && data.stationName) {
          addTrap(gameId, {
            lat: data.stationLat, lng: data.stationLng,
            stationName: data.stationName, ghostUserId: socket.userId,
          });
          io.to(socketRoom).emit(S2C.BROADCAST_ANNOUNCEMENT, {
            id: '', content: `【陷阱卡】鬼队在某地铁站设下了陷阱...`,
            from: '系统', createdAt: new Date().toISOString(),
          });
        }
        break;
      }
      case 'tracking': {
        addEffect(gameId, { type: 'tracking', teamName: 'human', endsAt: Date.now() + 10 * 60 * 1000 });
        io.to(socketRoom).emit(S2C.BROADCAST_ANNOUNCEMENT, {
          id: '', content: `【跟踪卡】人队需开启位置共享10分钟！`,
          from: '系统', createdAt: new Date().toISOString(),
        });
        break;
      }
    }

    socket.emit('item:used', { success: true, itemType: result.itemType });
  } catch (err: any) {
    socket.emit(S2C.ERROR, { message: err.message });
  }
}

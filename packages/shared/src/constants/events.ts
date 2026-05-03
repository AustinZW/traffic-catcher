// Client → Server
export const C2S = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  PLAYER_READY: 'player:ready',
  GAME_START: 'game:start',
  LOCATION_UPDATE: 'location:update',
  TASK_COMPLETE: 'task:complete',
  CATCH_ATTEMPT: 'catch:attempt',
  CHAT_SEND: 'chat:send',
  BROADCAST_SEND: 'broadcast:send',
  GAME_END: 'game:end',
} as const;

// Server → Client
export const S2C = {
  ROOM_STATE: 'room:state',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  PLAYER_READY: 'player:ready',
  GAME_PHASE_CHANGE: 'game:phase_change',
  GAME_COUNTDOWN: 'game:countdown',
  LOCATION_PLAYER_MOVED: 'location:player_moved',
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted',
  TASK_COMPLETED: 'task:completed',
  CATCH_RESULT: 'catch:result',
  CHAT_MESSAGE: 'chat:message',
  BROADCAST_ANNOUNCEMENT: 'broadcast:announcement',
  PLAYER_CAUGHT: 'player:caught',
  SCORE_UPDATE: 'score:update',
  ZONE_VIOLATION: 'zone:violation',
  GAME_OVER: 'game:over',
  ERROR: 'error',
} as const;

export type ItemType = 'pause' | 'invisibility' | 'invincibility' | 'revive' | 'trap' | 'tracking';
export type ItemTeam = 'ghost' | 'human' | 'both';
export type BroadcastLevel = 'none' | 'onAcquire' | 'onUse' | 'both';

export interface ShopItemData {
  id: string;
  name: string;
  description: string;
  team: ItemTeam;
  price: number;
  type: ItemType;
  cooldownMin: number;
  broadcasts: BroadcastLevel;
}

export interface PlayerItemData {
  id: string;
  playerId: string;
  item: ShopItemData;
  quantity: number;
  usedAt?: string;
  acquiredAt: string;
}

export interface ItemUsageData {
  id: string;
  gameId: string;
  userId: string;
  itemId: string;
  usedAt: string;
  effectEndsAt?: string;
}

// Preset items from the game spec
export const PRESET_ITEMS: Omit<ShopItemData, 'id'>[] = [
  {
    name: '暂停卡',
    description: '使对方全队停留在原地10分钟（在交通工具上的在下站下车）。每60分钟只能使用一张',
    team: 'ghost',
    price: 80,
    type: 'pause',
    cooldownMin: 60,
    broadcasts: 'onUse',
  },
  {
    name: '隐身卡',
    description: '自己阵营无需参与下次的位置共享（对方照常）。每60分钟只能使用一张',
    team: 'both',
    price: 80,
    type: 'invisibility',
    cooldownMin: 60,
    broadcasts: 'none',
  },
  {
    name: '无敌卡',
    description: '在接下来15分钟内，免疫鬼队抓捕一人次。每90分钟只能使用一张',
    team: 'human',
    price: 100,
    type: 'invincibility',
    cooldownMin: 90,
    broadcasts: 'onAcquire',
  },
  {
    name: '复活卡',
    description: '复活一名被淘汰的队友，使其返回人队中继续游戏。每个队员只能被复活一次，每90分钟只能使用一张',
    team: 'human',
    price: 150,
    type: 'revive',
    cooldownMin: 90,
    broadcasts: 'both',
  },
  {
    name: '陷阱卡',
    description: '指定一个地铁站为陷阱（人队不知道具体是哪个站）。若人队进入该地铁站，则随机一名成员被抓捕。每60分钟只能使用一张',
    team: 'ghost',
    price: 100,
    type: 'trap',
    cooldownMin: 60,
    broadcasts: 'onUse',
  },
  {
    name: '跟踪卡',
    description: '使用本卡后，人队需要开启位置共享10分钟，而鬼队则无需共享。每90分钟只能使用一张',
    team: 'ghost',
    price: 150,
    type: 'tracking',
    cooldownMin: 90,
    broadcasts: 'both',
  },
];

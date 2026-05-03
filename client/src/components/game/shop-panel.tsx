import { useEffect, useState, useCallback } from 'react';
import { api } from '../../services/api';
import { getSocket } from '../../hooks/useSocket';
import { useGameStore } from '../../stores/game-store';
import { useAuthStore } from '../../stores/auth-store';
import type { ShopItemData, PlayerItemData } from '@traffic-ghost/shared';

interface Props {
  gameId: string;
  initialTab?: 'shop' | 'backpack';
  onClose: () => void;
}

export function ShopPanel({ gameId, initialTab = 'shop', onClose }: Props) {
  const [tab, setTab] = useState<'shop' | 'backpack'>(initialTab);
  const [items, setItems] = useState<ShopItemData[]>([]);
  const [inventory, setInventory] = useState<PlayerItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error' | 'info'>('info');
  const players = useGameStore((s) => s.players);
  const teams = useGameStore((s) => s.teams);
  const userId = useAuthStore((s) => s.user?.id);

  const myPlayer = players.find((p) => p.userId === userId);
  const myTeam = teams.find((t) => t.name === myPlayer?.teamName);
  const myRole = myPlayer?.role;

  const refreshInventory = useCallback(async () => {
    try {
      const r = await api.get(`/shop/inventory/${gameId}`);
      setInventory(r.data);
    } catch {}
  }, [gameId]);

  useEffect(() => {
    Promise.all([
      api.get('/shop/items').then((r) => setItems(r.data)),
      refreshInventory(),
    ]).catch(console.error).finally(() => setLoading(false));
  }, [gameId, refreshInventory]);

  // Listen for socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onBought = (data: { success: boolean; itemName: string; price: number }) => {
      setMsg(`成功购买【${data.itemName}】，消费 ${data.price} 分`);
      setMsgType('success');
      refreshInventory();
      setTimeout(() => setMsg(''), 3000);
    };

    const onUsed = (_data: { success: boolean; itemType: string }) => {
      setMsg(`道具使用成功`);
      setMsgType('success');
      refreshInventory();
      setTimeout(() => setMsg(''), 3000);
    };

    const onError = (data: { message: string }) => {
      setMsg(data.message || '操作失败');
      setMsgType('error');
      setTimeout(() => setMsg(''), 4000);
    };

    socket.on('item:bought', onBought);
    socket.on('item:used', onUsed);
    socket.on('error', onError);

    return () => {
      socket.off('item:bought', onBought);
      socket.off('item:used', onUsed);
      socket.off('error', onError);
    };
  }, [refreshInventory]);

  const handleBuy = (itemId: string) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('item:buy', { gameId, itemId });
    setMsg(`购买中...`);
    setMsgType('info');
  };

  const handleUse = (itemId: string) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('item:use', { gameId, itemId });
    setMsg(`使用中...`);
    setMsgType('info');
  };

  const getCount = (itemId: string) => {
    const inv = inventory.find((i) => i.item.id === itemId);
    return inv?.quantity || 0;
  };

  const ownedItems = inventory.filter((i) => i.quantity > 0);

  // Filter shop items by team eligibility
  const teamItems = items.filter((item) => {
    if (item.team === 'both') return true;
    return item.team === myRole;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl max-h-[70vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab('shop')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                tab === 'shop' ? 'bg-white shadow text-amber-600' : 'text-gray-500'
              }`}
            >
              商城
            </button>
            <button
              onClick={() => setTab('backpack')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors relative ${
                tab === 'backpack' ? 'bg-white shadow text-green-600' : 'text-gray-500'
              }`}
            >
              背包
              {ownedItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {ownedItems.length}
                </span>
              )}
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 text-lg px-2 btn-touch">✕</button>
        </div>

        {/* Team score display */}
        {myTeam && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500">团队积分</span>
            <span className="font-bold text-amber-600">🪙 {myTeam.score}</span>
            <span className="text-xs text-gray-400">({myTeam.name === 'ghost' ? '鬼队' : '人队'})</span>
          </div>
        )}

        {msg && (
          <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${
            msgType === 'success' ? 'bg-green-50 text-green-600' :
            msgType === 'error' ? 'bg-red-50 text-red-600' :
            'bg-blue-50 text-blue-600'
          }`}>
            {msg}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">加载中...</p>
        ) : tab === 'shop' ? (
          /* --- SHOP TAB --- */
          <div className="space-y-3">
            {teamItems.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">暂无可购买的道具</p>
            ) : (
              teamItems.map((item) => (
                <div key={item.id} className="border rounded-xl p-3 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <span className="font-bold">{item.name}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        item.team === 'ghost' ? 'bg-red-100 text-red-600' :
                        item.team === 'human' ? 'bg-blue-100 text-blue-600' :
                        'bg-purple-100 text-purple-600'
                      }`}>
                        {item.team === 'ghost' ? '鬼队' : item.team === 'human' ? '人队' : '双方'}
                      </span>
                    </div>
                    <span className="font-bold text-amber-600">🪙 {item.price}</span>
                  </div>
                  <p className="text-gray-500 text-xs mb-2">{item.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      冷却: {item.cooldownMin}分钟
                      {getCount(item.id) > 0 && ` | 持有: ${getCount(item.id)}`}
                    </span>
                    <button
                      onClick={() => handleBuy(item.id)}
                      className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold btn-touch"
                    >
                      购买
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* --- BACKPACK TAB --- */
          <div className="space-y-3">
            {ownedItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">背包为空</p>
                <button
                  onClick={() => setTab('shop')}
                  className="mt-2 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold"
                >
                  去商城购买
                </button>
              </div>
            ) : (
              ownedItems.map((inv) => (
                <div key={inv.id} className="border rounded-xl p-3 text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <span className="font-bold">{inv.item.name}</span>
                      <span className="ml-2 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded">
                        x{inv.quantity}
                      </span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      inv.item.team === 'ghost' ? 'bg-red-100 text-red-600' :
                      inv.item.team === 'human' ? 'bg-blue-100 text-blue-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      {inv.item.team === 'ghost' ? '鬼队' : inv.item.team === 'human' ? '人队' : '双方'}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mb-2">{inv.item.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">冷却: {inv.item.cooldownMin}分钟</span>
                    <button
                      onClick={() => handleUse(inv.item.id)}
                      className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold btn-touch"
                    >
                      使用
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

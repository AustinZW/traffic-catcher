import { useGameStore } from '../../stores/game-store';
import { useAuthStore } from '../../stores/auth-store';

interface Props {
  onShopClick: () => void;
  onScoreboardClick: () => void;
}

export function HUD({ onShopClick, onScoreboardClick }: Props) {
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const players = useGameStore((s) => s.players);
  const teams = useGameStore((s) => s.teams);
  const userId = useAuthStore((s) => s.user?.id);
  const me = players.find((p) => p.userId === userId);

  const ghostTeam = players.filter((p) => p.role === 'ghost' && !p.isCaught);
  const humanTeam = players.filter((p) => p.role === 'human' && !p.isCaught);
  const myTeam = teams.find(t => t.name === (me?.teamName || me?.role));

  if (phase === 'countdown') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="text-white text-center">
          <p className="text-6xl font-bold">{countdown}</p>
          <p className="text-lg mt-4">游戏即将开始...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-30 px-3 pt-3" style={{ paddingTop: 'var(--safe-area-top)' }}>
      {/* First row: role, score, team score */}
      <div className="flex items-center gap-2 mb-1">
        {me && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold text-white ${
            me.role === 'ghost' ? 'bg-red-500' :
            me.role === 'referee' ? 'bg-amber-500' : 'bg-blue-500'
          }`}>
            {me.role === 'ghost' ? '👻 鬼' : me.role === 'referee' ? '⚖️ 裁判' : '🏃 人'}
          </div>
        )}

        {/* Team score */}
        {myTeam && (
          <div className="bg-gray-800/80 text-white px-2 py-1 rounded-full text-xs font-bold"
            style={myTeam.color ? { backgroundColor: myTeam.color + 'cc' } : {}}>
            🪙 {myTeam.score || 0}
          </div>
        )}

        <div className="flex-1" />

        {/* Player counts */}
        <div className="bg-red-500/80 text-white px-2 py-1 rounded-full text-xs">
          👻 {ghostTeam.length}
        </div>
        <div className="bg-blue-500/80 text-white px-2 py-1 rounded-full text-xs">
          🏃 {humanTeam.length}
        </div>

        {/* Shop/Backpack button — not for referee */}
        {me?.role !== 'referee' && (
          <button onClick={onShopClick} className="bg-yellow-500 text-white px-3 py-1.5 rounded-full text-xs font-bold btn-touch">
            道具
          </button>
        )}

        {/* Scoreboard */}
        <button onClick={onScoreboardClick} className="bg-gray-700 text-white px-3 py-1.5 rounded-full text-xs font-bold btn-touch">
          排名
        </button>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../../stores/game-store';
import { useAuthStore } from '../../stores/auth-store';

export default function GameOverPage() {
  const { gameId: _gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const players = useGameStore((s) => s.players);
  const userId = useAuthStore((s) => s.user?.id);

  const teams = useGameStore((s) => s.teams);
  const sorted = [...players]
    .filter(p => p.role !== 'referee')
    .sort((a, b) => b.score - a.score);

  const me = players.find(p => p.userId === userId);
  const myTeam = me?.role === 'ghost' ? '鬼队' : me?.role === 'human' ? '人队' : null;

  // Determine winning team
  const ghostTeam = teams.find(t => t.name === 'ghost');
  const humanTeam = teams.find(t => t.name === 'human');
  const teamWinner = ghostTeam && humanTeam
    ? ghostTeam.score > humanTeam.score ? 'ghost' : humanTeam.score > ghostTeam.score ? 'human' : 'tie'
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-3xl font-bold text-center mt-8 mb-2">游戏结束</h1>
        <p className="text-gray-400 text-center mb-8">
          {myTeam ? `你所在的是 ${myTeam}` : '裁判'}
        </p>

        {/* Team scores */}
        {teams.length > 0 && (
          <div className="flex gap-3 mb-6">
            {teams.map((team) => (
              <div
                key={team.id}
                className={`flex-1 rounded-xl p-4 text-center ${
                  team.name === 'ghost'
                    ? 'bg-red-900/50 border border-red-500/50'
                    : 'bg-blue-900/50 border border-blue-500/50'
                } ${teamWinner === team.name ? 'ring-2 ring-yellow-400' : ''}`}
              >
                <div className={`text-sm font-bold mb-1 ${team.name === 'ghost' ? 'text-red-400' : 'text-blue-400'}`}>
                  {team.name === 'ghost' ? '👻 鬼队' : '🧑 人队'}
                  {teamWinner === team.name && ' 👑'}
                </div>
                <div className="text-3xl font-bold">{team.score}</div>
                <div className="text-xs text-gray-400">分</div>
              </div>
            ))}
          </div>
        )}

        {teamWinner && teamWinner !== 'tie' && (
          <p className="text-center text-lg font-bold text-yellow-400 mb-4">
            {teamWinner === 'ghost' ? '鬼队' : '人队'} 获胜！
          </p>
        )}
        {teamWinner === 'tie' && (
          <p className="text-center text-lg font-bold text-gray-400 mb-4">平局！</p>
        )}

        {/* Rankings */}
        <div className="bg-gray-800 rounded-xl overflow-hidden mb-6">
          {sorted.map((p, i) => (
            <div key={p.userId} className={`flex items-center gap-3 px-4 py-3 ${p.userId === userId ? 'bg-blue-900/50' : ''} ${i < sorted.length - 1 ? 'border-b border-gray-700' : ''}`}>
              <span className="text-lg font-bold w-8 text-gray-400">{i + 1}</span>
              <span className={`w-3 h-3 rounded-full ${p.role === 'ghost' ? 'bg-red-500' : 'bg-blue-500'}`} />
              <span className="flex-1">{p.username}{p.userId === userId ? ' (你)' : ''}</span>
              <span className="font-bold text-lg">{p.score}</span>
              <span className="text-xs text-gray-400 ml-1">分</span>
              {p.isCaught && <span className="text-xs text-red-400 ml-2">被抓</span>}
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/lobby')}
          className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg btn-touch mb-4"
        >
          返回大厅
        </button>
      </div>
    </div>
  );
}

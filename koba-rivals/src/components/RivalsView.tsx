import { getGame } from '../data/games';
import { playerById } from '../data/players';
import type { Match } from '../types';
import { Avatar, CheckIcon, ScorePill, SwordsIcon } from './ui';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface RivalsViewProps {
  matches: Match[];
  onOpenLobby: (matchId: string) => void;
  onFindRivals: () => void;
}

export function RivalsView({ matches, onOpenLobby, onFindRivals }: RivalsViewProps) {
  if (matches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-glyph" aria-hidden="true">
          <SwordsIcon size={26} />
        </div>
        <h2>No rivals yet</h2>
        <p>
          A rivalry forms when you and another player both swipe right. Start swiping and someone
          will eventually bite.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn btn-gradient" onClick={onFindRivals}>
            Find rivals
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-view">
      <header className="view-head">
        <h1>Rivals</h1>
        <p>
          {matches.length} active match{matches.length === 1 ? '' : 'es'}
        </p>
      </header>
      <ul className="rival-list">
        {matches.map((match) => {
          const player = playerById(match.playerId);
          if (!player) return null;
          const game = getGame(match.gameId);
          const rank = player.games.find((entry) => entry.gameId === game.id)?.rank ?? 'Unranked';
          return (
            <li className="rival-row" key={match.id}>
              <Avatar player={player} size={50} />
              <div className="rival-main">
                <div className="rival-title">
                  <h2>{player.displayName}</h2>
                  <ScorePill value={player.score} small />
                </div>
                <p className="rival-meta">
                  @{player.username} · {game.short} · {rank} · {player.region}
                </p>
                <p className="rival-time">
                  {match.challenged
                    ? `${match.kills} kills locked · ${match.serverId ? 'arena set' : 'pick arena'}`
                    : `Matched ${timeAgo(match.createdAt)} · ${match.fit}% fit`}
                </p>
              </div>
              <button
                type="button"
                className={`btn btn-outline${match.challenged ? ' is-locked' : ''}`}
                onClick={() => onOpenLobby(match.id)}
              >
                {match.challenged ? (
                  <>
                    <CheckIcon size={13} /> Locked
                  </>
                ) : (
                  'Arena lobby'
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="view-foot">
        Challenges expire after 24h. Rivals who decline twice drop out of your pool, and ghosting
        lowers your reliability rating.
      </p>
    </div>
  );
}

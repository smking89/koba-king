import { initialsOf } from '../lib/matchmaking';
import type { Player } from '../types';

interface VersusCardProps {
  me: Player;
  player: Player;
  /** Projected score swing if `player` wins the lock-in - omit when unknown (no fake number). */
  pointsAtStake?: number;
}

/** One side of the card - real username/score/streak/rank only, diagonal half matches the KOBA brand split (red/ink, not a literal BoomBot blue/red clone). kobaRankBadgeUrl is only set for a real KOBA-linked player (see src/lib/kobaApi.ts) - a demo player shows initials instead, never a fake rank. */
function VersusSide({ player, side }: { player: Player; side: 'left' | 'right' }) {
  return (
    <div className={`versus-side versus-side-${side}`}>
      {player.kobaRankBadgeUrl ? (
        <img className="versus-side-badge" src={player.kobaRankBadgeUrl} alt={player.kobaRankName || 'Rank badge'} />
      ) : null}
      <span className="versus-side-handle">@{player.username}</span>
      {player.kobaScoreTier && <span className="versus-side-tier">{player.kobaScoreTier}</span>}
      <span className="versus-side-stat versus-side-score">{player.score.toLocaleString('en-US')} RP</span>
      {player.streak > 0 && <span className="versus-side-stat versus-side-streak">{player.streak} win streak</span>}
      <span className="versus-side-tag">{initialsOf(player)}</span>
    </div>
  );
}

/** The shareable "it's a match" card - KOBA-watermarked diagonal split, real usernames/scores/streaks/ranks, no fabricated numbers (kobabot's own honest defaults carry through untouched for anything it doesn't track). */
export function VersusCard({ me, player, pointsAtStake }: VersusCardProps) {
  return (
    <div className="versus-card" role="img" aria-label={`${me.username} versus ${player.username}`}>
      <div className="versus-watermark" aria-hidden="true" />
      <span className="versus-edge-label versus-edge-left" aria-hidden="true">
        RIVALS
      </span>
      <span className="versus-edge-label versus-edge-right" aria-hidden="true">
        RIVALS
      </span>
      <VersusSide player={me} side="left" />
      <div className="versus-center">
        {typeof pointsAtStake === 'number' && <span className="versus-stake">+{pointsAtStake}</span>}
        <span className="versus-vs">VS</span>
      </div>
      <VersusSide player={player} side="right" />
    </div>
  );
}

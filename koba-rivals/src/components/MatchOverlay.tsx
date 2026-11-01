import { getGame } from '../data/games';
import { primaryGame } from '../lib/matchmaking';
import type { Match, Player } from '../types';
import { VersusCard } from './VersusCard';

interface MatchOverlayProps {
  me: Player;
  player: Player;
  match: Match;
  onClose: () => void;
  onEnterLobby: () => void;
}

export function MatchOverlay({ me, player, match, onClose, onEnterLobby }: MatchOverlayProps) {
  const game = getGame(match.gameId ?? primaryGame(player).gameId);

  return (
    <div className="match-overlay" role="dialog" aria-modal="true" aria-label="Rivalry ignited">
      <div className="match-card">
        <p className="match-kicker">It&apos;s mutual</p>
        <h2 className="match-title">
          Rivalry
          <br />
          ignited.
        </h2>

        {/* No pointsAtStake here - no real wager exists yet at the "it's a match" step, that's decided in the Arena Lobby. Showing a number here would be fabricated. */}
        <VersusCard me={me} player={player} />

        <p className="match-sub">
          {player.displayName} wants the runback in <strong>{game.name}</strong> ·{' '}
          {match.fit}% fit
        </p>

        <button type="button" className="btn btn-gradient btn-block" onClick={onEnterLobby}>
          Enter Arena Lobby
        </button>
        <button type="button" className="btn btn-text" onClick={onClose}>
          Keep swiping
        </button>
      </div>
    </div>
  );
}

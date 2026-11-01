import { getGame } from '../data/games';
import { rankHint, roleHint } from '../lib/glossary';
import { primaryGame } from '../lib/matchmaking';
import type { Filters, Player } from '../types';
import { Avatar, CheckIcon, GameIconRow, GameLogo, PlatformBadge, ScorePill } from './ui';

interface PlayerCardProps {
  player: Player;
  filters: Filters;
  compact?: boolean;
}

export function PlayerCard({ player, filters, compact = false }: PlayerCardProps) {
  const banner = getGame(player.bannerGameId);
  const primary = primaryGame(player, filters);
  const primaryMeta = getGame(primary.gameId);

  return (
    <article className={`player-card${compact ? ' is-compact' : ''}`}>
      <div
        className={`card-banner${player.bannerUrl ? ' has-photo' : ''}`}
        style={{
          background: player.bannerUrl
            ? '#1a1d20'
            : `radial-gradient(120% 90% at 78% 12%, ${banner.accent[0]} 0%, ${banner.accent[1]} 78%)`,
        }}
      >
        {player.bannerUrl ? (
          <img className="banner-photo" src={player.bannerUrl} alt="" />
        ) : (
          <span className="banner-word" aria-hidden="true">
            {banner.short}
          </span>
        )}
        <div className="banner-top">
          <span className="banner-game">
            <GameLogo game={banner} className="banner-game-logo" />
            {banner.name}
          </span>
          {player.online && <span className="online-pill">Online</span>}
        </div>
        <div className="banner-avatar">
          <Avatar player={player} size={compact ? 78 : 96} ring />
        </div>
        <div className="banner-foot">
          <span className="banner-rank" title={rankHint(primary.rank, primaryMeta.name)}>
            {primary.rank}
          </span>
          <span className="banner-role" title={roleHint(primary.role)}>
            {primary.role}
          </span>
        </div>
      </div>

      <div className="card-info">
        <div className="card-head">
          <div className="card-id">
            <h2>
              {player.displayName}
              {player.verified && (
                <span className="verified" title="Verified platform account">
                  <CheckIcon size={10} />
                </span>
              )}
            </h2>
            <p className="username">@{player.username}</p>
          </div>
          <ScorePill value={player.score} />
        </div>

        <p className="bio">{player.bio}</p>

        <div className="card-meta">
          <PlatformBadge platform={player.platform} />
          <span className="meta-chip" title={`${primary.rank} is the rank ladder in ${primaryMeta.name}`}>
            {primaryMeta.short} · {primary.rank}
          </span>
        </div>

        <div className="card-foot">
          <GameIconRow ids={player.games.map((game) => game.gameId)} size={compact ? 22 : 25} />
          <span className="reliability">
            <i className="dot-mint" />
            {player.reliability}% reliable
          </span>
        </div>
      </div>
    </article>
  );
}

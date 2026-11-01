import { getGame } from '../data/games';
import { adCreative } from '../lib/ads';
import type { Campaign } from '../lib/ads';
import { CopyIcon, GameLogo, SwordsIcon } from './ui';

interface SponsoredCardProps {
  campaign: Campaign;
  onOpen: () => void;
  onHide: () => void;
}

/**
 * Paid placement inside the swipe deck. Deliberately uses the same card
 * geometry as a player card, but is labelled and never mixed with real people.
 */
export function SponsoredCard({ campaign, onOpen, onHide }: SponsoredCardProps) {
  const game = getGame(campaign.games[0] ?? 'valorant');
  const creative = adCreative(campaign);
  const hasServer = Boolean(creative.serverIp);

  return (
    <article className="player-card sponsored-card">
      <div
        className="card-banner sponsored-banner"
        style={{
          background: `radial-gradient(120% 90% at 78% 12%, ${game.accent[0]} 0%, ${game.accent[1]} 80%)`,
        }}
      >
        <span className="banner-word" aria-hidden="true">
          {game.short}
        </span>
        <div className="banner-top">
          <span className="sponsor-ribbon">Sponsored</span>
          {campaign.region && <span className="sponsor-region">{campaign.region}</span>}
        </div>
        <div className="sponsor-plate">
          <GameLogo game={game} className="sponsor-logo" />
        </div>
        <div className="banner-foot">
          <span className="banner-rank">{game.name}</span>
          <span className="banner-role">{creative.serverName}</span>
        </div>
      </div>

      <div className="card-info sponsor-info">
        <p className="sponsor-brand">{creative.sponsor} · partner arena</p>
        <h2 className="sponsor-headline">{creative.headline}</h2>
        <p className="sponsor-copy">{creative.body}</p>
        {hasServer && (
          <p className="sponsor-server">
            <i>IP</i> {creative.serverIp}
          </p>
        )}
        <div className="sponsor-actions">
          <button type="button" className="btn btn-gradient sponsor-cta" onClick={onOpen}>
            {hasServer ? <CopyIcon size={14} /> : <SwordsIcon size={14} />} {creative.cta}
          </button>
          <button type="button" className="btn btn-text" onClick={onHide}>
            Hide
          </button>
        </div>
        <p className="sponsor-legal">
          Ad by {creative.sponsor} · paid placements keep matchmaking free
        </p>
      </div>
    </article>
  );
}

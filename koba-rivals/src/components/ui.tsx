import { useState } from 'react';
import type { ReactNode } from 'react';
import { getGame } from '../data/games';
import { initialsOf } from '../lib/matchmaking';
import type { Game, Platform, Player } from '../types';

interface IconProps {
  size?: number;
  className?: string;
}

export function XIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SwordsIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 3h5l10 10-3 3L6 6V3ZM20 3h-5L5 13l3 3L18 6V3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m4 20 3-3M20 20l-3-3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function BoltIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M13.5 2 4 13.5h6l-1.5 8.5L20 10h-6.2l-.3-8Z" fill="currentColor" />
    </svg>
  );
}

export function UndoIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 9h9a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SlidersIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="17" r="2.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function CardsIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="7" y="3" width="13" height="17" rx="3" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4 7v10a3 3 0 0 0 3 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function UserIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M14.5 5 8 12l6.5 7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function MicIcon({ size = 12, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m9 12 2.2 2.2L15.5 10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ServerIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="13" width="18" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChartIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m7 15 4-5 3 3 4-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MegaphoneIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 10v4a2 2 0 0 0 2 2h2l7 4V4L8 8H6a2 2 0 0 0-2 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BuildingIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 21V6l7-3v18M11 21h9V10l-9-4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 9h1M7 13h1M7 17h1M15 12h1M15 16h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function UploadIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function KeyIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="m11 11 8 8M16 16l2-2M18.5 18.5l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CodeIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5l-3 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WalletIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="14.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function TargetIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function LockIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="10" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LogOutIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 5.5 18 12 8 18.5v-13Z" fill="currentColor" />
    </svg>
  );
}

export function BoardIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SendIcon({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 12 20 4l-6 16-3.2-6.8L4 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- platform glyphs ---------- */

export function PlatformIcon({ platform, size = 14 }: { platform: Platform; size?: number }) {
  if (platform === 'PC') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 20h6M12 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (platform === 'Xbox') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="m7.5 6.5 9 11M16.5 6.5l-9 11" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (platform === 'Switch') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="7" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <rect x="13" y="3" width="7" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="7.5" cy="8" r="1.3" fill="currentColor" />
      </svg>
    );
  }
  if (platform === 'PS5') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10.3 4.2v15.1l2.2.8V7.1c0-.6.3-1 .8-.8.7.3 1.2 1.1 1.2 1.9 0 .9-.5 1.5-1.2 1.2v2.1c1.7.5 3.1-.4 3.1-2.6 0-2.2-1.3-3.6-3.2-4.3l-2.9-1.1-2.1-.8v1.5h2.1Z"
          fill="currentColor"
        />
        <path
          d="M3 17.9l4.6 1.6c.5.2 1 .1 1.3-.1.3-.2.4-.5.4-.8v-1.8l-3.6-1.3c-.4-.1-.7-.4-.7-.8s.4-.6.9-.4l3.4 1.2v-2l-4.6-1.6c-1.1-.4-2.1.1-2.1 1.2 0 .9.6 1.8 1.6 2.2l1.2.4v1.9L3 16.4v1.5Z"
          fill="currentColor"
        />
        <path
          d="M16.7 13.8c1.5-.6 2.4-.2 2.4.9 0 1-.9 1.9-2.3 2.4l-4.6 1.7v2.1l5.4-2c2.1-.8 3.3-2.3 3.3-3.9 0-1.7-1.3-2.5-3.1-1.9l-5.6 2v2l4.5-1.3Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 3.5h4l.6 3.1 2.7 1.6 2.9-1.2 2 3.5-2.3 2.1v3.1l2.3 2.1-2 3.5-2.9-1.2-2.7 1.6-.6 3.1h-4l-.6-3.1-2.7-1.6-2.9 1.2-2-3.5L5.1 15v-3.1L2.8 9.8l2-3.5 2.9 1.2L10.4 6l-.4-2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 9.5h2.2l1 2 1-2H16l-2.2 2.6 2.3 2.9h-2.3l-1-2-1 2H9.2l2.2-2.9L9 9.5Z" fill="currentColor" />
    </svg>
  );
}

/** Social/link row icons - distinct from PlatformIcon (which gate), these are optional profile links (socials.twitch, a website, etc). */
export function TwitchIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 3 3.5 6.5v13H8V21l2.5-1.5H14L19 15V3H5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14.5 6.5v5M10 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function YouTubeIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 9.3v5.4l4.7-2.7-4.7-2.7Z" fill="currentColor" />
    </svg>
  );
}

export function WebsiteIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-6-3.8-9S9.5 5.5 12 3Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ---------- primitives ---------- */

export function Avatar({
  player,
  size = 48,
  ring = false,
  className = '',
}: {
  player: Player;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`avatar${ring ? ' avatar-ring' : ''} ${player.avatarUrl ? ' has-photo' : ''} ${className}`.trim()}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.3),
        background: player.avatarUrl
          ? '#ffffff'
          : `linear-gradient(145deg, ${player.avatar[0]}, ${player.avatar[1]})`,
      }}
      aria-hidden="true"
    >
      {player.avatarUrl ? <img className="avatar-img" src={player.avatarUrl} alt="" /> : initialsOf(player)}
    </span>
  );
}

export function ScorePill({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <span className={`score-pill${small ? ' is-small' : ''}`}>
      {value.toLocaleString('en-US')} <i>RP</i>
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="platform-badge">
      <PlatformIcon platform={platform} size={13} />
      {platform}
    </span>
  );
}

/** Official logo artwork with a monogram fallback if the asset cannot load. */
export function GameLogo({ game, className = '' }: { game: Game; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`game-logo-fallback ${className}`.trim()}>{game.short}</span>;
  return (
    <img
      src={game.logo}
      alt={`${game.name} logo`}
      className={`game-logo ${className}`.trim()}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function GameChip({ game, size = 26 }: { game: Game; size?: number }) {
  return (
    <span
      className="game-chip"
      style={{ height: size, minWidth: Math.round(size * 1.4) }}
      title={game.name}
    >
      <GameLogo game={game} className="game-chip-logo" />
    </span>
  );
}

export function GameIconRow({ ids, size = 26 }: { ids: string[]; size?: number }) {
  return (
    <div className="game-icon-row">
      {ids.slice(0, 4).map((id) => (
        <GameChip key={id} game={getGame(id)} size={size} />
      ))}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel${className ? ` ${className}` : ''}`}>{children}</section>;
}

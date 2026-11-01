import { useRef, useState } from 'react';
import { GAMES, getGame } from '../data/games';
import { PLAN_LABEL } from '../lib/accounts';
import { TERMS } from '../lib/glossary';
import type { Account } from '../lib/accounts';
import { AVATAR_MAX, BANNER_MAX, processImage } from '../lib/image';
import { primaryGame, recordRate } from '../lib/matchmaking';
import type { Match, Platform, Player, Region } from '../types';
import {
  Avatar,
  CheckIcon,
  GameLogo,
  LogOutIcon,
  PlatformBadge,
  ScorePill,
  UploadIcon,
} from './ui';

const AVATAR_PRESETS: [string, string][] = [
  ['#ff1f1f', '#c40000'],
  ['#7c5cff', '#3b2a8c'],
  ['#22d3ee', '#0e7490'],
  ['#34d399', '#065f46'],
  ['#fbbf24', '#92400e'],
  ['#f472b6', '#9d174d'],
  ['#60a5fa', '#1e40af'],
  ['#a3e635', '#4d7c0f'],
];

const PLATFORMS: Platform[] = ['PC', 'PS5', 'Xbox', 'Switch'];
const REGIONS: Region[] = ['EU', 'America', 'Oceania'];

interface ProfileViewProps {
  profile: Player;
  matches: Match[];
  swipes: number;
  account: Account | null;
  /** Real KOBA account connection (admin/rivalsApi.js) - entirely separate from `account` above (that's the prototype business-account login, src/lib/accounts.ts). Null if kobabot isn't configured for this build at all (VITE_KOBA_API_URL unset). */
  kobaGamertag: string | null;
  kobaSignedIn: boolean;
  kobaAvailable: boolean;
  onConnectKoba: () => void;
  onDisconnectKoba: () => void;
  onPatch: (patch: Partial<Player>) => void;
  onResetDeck: () => void;
  onOpenFilters: () => void;
  onOpenBusiness: () => void;
  onSignOut: () => void;
  onNotify: (text: string) => void;
}

export function ProfileView({
  profile,
  matches,
  swipes,
  account,
  kobaGamertag,
  kobaSignedIn,
  kobaAvailable,
  onConnectKoba,
  onDisconnectKoba,
  onPatch,
  onResetDeck,
  onOpenFilters,
  onOpenBusiness,
  onSignOut,
  onNotify,
}: ProfileViewProps) {
  const banner = getGame(profile.bannerGameId);
  const primary = primaryGame(profile);
  const winRate = recordRate(profile.record);

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'avatar' | 'banner' | null>(null);

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setBusy('avatar');
    try {
      const image = await processImage(file, { maxWidth: AVATAR_MAX, maxHeight: AVATAR_MAX, quality: 0.88 });
      onPatch({ avatarUrl: image.dataUrl });
      onNotify('Avatar updated');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'That image could not be read');
    } finally {
      setBusy(null);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  };

  const uploadBanner = async (file?: File) => {
    if (!file) return;
    setBusy('banner');
    try {
      const image = await processImage(file, { maxWidth: BANNER_MAX, maxHeight: 900, quality: 0.82 });
      onPatch({ bannerUrl: image.dataUrl });
      onNotify('Banner updated');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'That image could not be read');
    } finally {
      setBusy(null);
      if (bannerInput.current) bannerInput.current.value = '';
    }
  };

  return (
    <div className="scroll-view">
      <header className="view-head">
        <h1>Your gamer card</h1>
        <p>This is exactly what other players swipe on</p>
      </header>

      <section className="identity-card">
        <div
          className={`identity-banner${profile.bannerUrl ? ' has-photo' : ''}`}
          style={{
            background: profile.bannerUrl
              ? '#1a1d20'
              : `radial-gradient(120% 90% at 78% 12%, ${banner.accent[0]} 0%, ${banner.accent[1]} 80%)`,
          }}
        >
          {profile.bannerUrl ? (
            <img className="banner-photo" src={profile.bannerUrl} alt="" />
          ) : (
            <span className="banner-word" aria-hidden="true">
              {banner.short}
            </span>
          )}
          <span className="identity-score">
            <ScorePill value={profile.score} />
          </span>
          <div className="identity-avatar">
            <Avatar player={profile} size={86} ring />
          </div>
        </div>
        <div className="identity-body">
          <h2>
            {profile.displayName}
            {profile.verified && (
              <span className="verified" title="Verified platform account">
                <CheckIcon size={10} />
              </span>
            )}
          </h2>
          <p>@{profile.username}</p>
          <div className="identity-meta">
            <PlatformBadge platform={profile.platform} />
            <span className="meta-chip">{profile.region}</span>
            <span className="meta-chip">{primary.rank}</span>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <div className="stat">
          <span>{profile.score.toLocaleString('en-US')}</span>
          <small>score</small>
        </div>
        <div className="stat">
          <span>{winRate}%</span>
          <small>win rate</small>
        </div>
        <div className="stat">
          <span>{profile.streak > 0 ? `+${profile.streak}` : profile.streak}</span>
          <small>streak</small>
        </div>
        <div className="stat">
          <span className="mint">{profile.reliability}%</span>
          <small>reliable</small>
        </div>
      </div>

      <section className="panel">
        <h2>Identity</h2>
        <label className="field-row">
          <span>Display name</span>
          <input
            value={profile.displayName}
            maxLength={24}
            onChange={(event) => onPatch({ displayName: event.target.value })}
            placeholder="Display name"
          />
        </label>
        <label className="field-row">
          <span>Username</span>
          <div className="input-prefixed">
            <i>@</i>
            <input
              value={profile.username}
              maxLength={18}
              onChange={(event) =>
                onPatch({ username: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
              }
              placeholder="username"
            />
          </div>
        </label>
        <label className="field-row is-block">
          <span>Bio</span>
          <textarea
            value={profile.bio}
            maxLength={140}
            rows={3}
            onChange={(event) => onPatch({ bio: event.target.value })}
            placeholder="Tell rivals how you play"
          />
          <em>{profile.bio.length}/140</em>
        </label>
        <p className="auto-save">Changes save automatically.</p>
      </section>

      <section className="panel">
        <h2>Platform &amp; region</h2>
        <div className="chip-grid">
          {PLATFORMS.map((platform) => (
            <button
              type="button"
              key={platform}
              className={`chip-select${profile.platform === platform ? ' is-active' : ''}`}
              onClick={() => onPatch({ platform })}
              aria-pressed={profile.platform === platform}
            >
              {platform}
            </button>
          ))}
        </div>
        <div className="chip-grid spaced">
          {REGIONS.map((region) => (
            <button
              type="button"
              key={region}
              className={`chip-select${profile.region === region ? ' is-active' : ''}`}
              onClick={() => onPatch({ region })}
              aria-pressed={profile.region === region}
            >
              {region}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Avatar</h2>
        <div className="upload-row">
          <Avatar player={profile} size={72} ring />
          <div className="upload-actions">
            <input
              ref={avatarInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => uploadAvatar(event.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => avatarInput.current?.click()}
              disabled={busy === 'avatar'}
            >
              <UploadIcon size={14} />
              {busy === 'avatar' ? 'Processing…' : profile.avatarUrl ? 'Replace photo' : 'Upload photo'}
            </button>
            {profile.avatarUrl && (
              <button type="button" className="btn btn-text" onClick={() => onPatch({ avatarUrl: undefined })}>
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="auto-save">
          PNG, JPG or WebP up to 12 MB. Resized to {AVATAR_MAX}px and stored on this device.
        </p>
        {!profile.avatarUrl && (
          <div className="swatch-row space-top">
            {AVATAR_PRESETS.map((gradient) => (
              <button
                type="button"
                key={gradient.join('')}
                className={`swatch${
                  profile.avatar[0] === gradient[0] && profile.avatar[1] === gradient[1]
                    ? ' is-active'
                    : ''
                }`}
                style={{ background: `linear-gradient(145deg, ${gradient[0]}, ${gradient[1]})` }}
                onClick={() => onPatch({ avatar: gradient })}
                aria-label={`Use ${gradient[0]} avatar`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Banner</h2>
        <div className="upload-row">
          <div
            className="upload-banner"
            style={{
              background: profile.bannerUrl
                ? '#1a1d20'
                : `radial-gradient(120% 90% at 78% 12%, ${banner.accent[0]} 0%, ${banner.accent[1]} 80%)`,
            }}
          >
            {profile.bannerUrl ? (
              <img src={profile.bannerUrl} alt="Banner preview" />
            ) : (
              <GameLogo game={banner} className="upload-banner-logo" />
            )}
          </div>
          <div className="upload-actions">
            <input
              ref={bannerInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => uploadBanner(event.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => bannerInput.current?.click()}
              disabled={busy === 'banner'}
            >
              <UploadIcon size={14} />
              {busy === 'banner' ? 'Processing…' : 'Upload banner'}
            </button>
            {profile.bannerUrl && (
              <button type="button" className="btn btn-text" onClick={() => onPatch({ bannerUrl: undefined })}>
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="auto-save">No upload yet? Pick official game artwork instead.</p>
        <div className="logo-grid">
          {GAMES.map((game) => (
            <button
              type="button"
              key={game.id}
              className={`logo-tile${
                !profile.bannerUrl && profile.bannerGameId === game.id ? ' is-active' : ''
              }`}
              onClick={() => onPatch({ bannerGameId: game.id, bannerUrl: undefined })}
              title={game.name}
            >
              <span className="logo-tile-art">
                <GameLogo game={game} />
              </span>
              <span className="logo-tile-name">{game.short}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Socials</h2>
        <label className="field-row">
          <span>Twitch</span>
          <input
            value={profile.socials.twitch ?? ''}
            onChange={(event) => onPatch({ socials: { ...profile.socials, twitch: event.target.value } })}
            placeholder="channel"
          />
        </label>
        <label className="field-row">
          <span>Discord</span>
          <input
            value={profile.socials.discord ?? ''}
            onChange={(event) =>
              onPatch({ socials: { ...profile.socials, discord: event.target.value } })
            }
            placeholder="username"
          />
        </label>
      </section>

      <section className="panel">
        <h2>Match stats</h2>
        <ul className="breakdown">
          <li>
            <span>Rivals</span>
            <strong>{matches.length}</strong>
          </li>
          <li>
            <span>Swipes</span>
            <strong>{swipes}</strong>
          </li>
          <li>
            <span>Record</span>
            <strong>
              {profile.record.wins}W – {profile.record.losses}L
            </strong>
          </li>
          <li>
            <span>Ranked games</span>
            <strong>{profile.games.length}</strong>
          </li>
        </ul>
        <div className="badge-row">
          {profile.badges.map((badge) => (
            <span key={badge} className="badge">
              {badge}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>What these mean</h2>
        <p className="panel-copy">
          Every rank and role on a card comes from a specific game, so here is the vocabulary in
          plain English.
        </p>
        <dl className="glossary">
          {TERMS.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <h2>Matchmaking</h2>
        <p className="panel-copy">
          Filters control who appears in your deck. Reset clears your swipes but keeps your rivalries.
        </p>
        <div className="panel-actions">
          <button type="button" className="btn btn-soft" onClick={onOpenFilters}>
            Edit filters
          </button>
          <button type="button" className="btn btn-soft danger" onClick={onResetDeck}>
            Reset deck
          </button>
        </div>
      </section>

      {kobaAvailable && (
        <section className="panel">
          <h2>KOBA Account</h2>
          {kobaSignedIn ? (
            <>
              <p className="panel-copy">
                Connected{kobaGamertag ? <> as <strong>{kobaGamertag}</strong></> : ' - no Gamertag linked yet (run /link in Discord)'}.
                Real rivals and servers are live in Discover.
              </p>
              <div className="panel-actions">
                <button type="button" className="btn btn-text" onClick={onDisconnectKoba}>
                  <LogOutIcon size={14} /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="panel-copy">
                Connect your KOBA account to see real Rust Console Edition rivals and servers instead of the
                demo deck.
              </p>
              <button type="button" className="btn btn-gradient" onClick={onConnectKoba}>
                Connect KOBA Account
              </button>
            </>
          )}
        </section>
      )}

      <section className="panel panel-business">
        <h2>KOBA Business</h2>
        {account ? (
          <>
            <p className="panel-copy">
              Signed in as <strong>{account.company}</strong> · {PLAN_LABEL[account.plan]} plan.
              Server console, ad platform and developer tools are unlocked.
            </p>
            <div className="panel-actions">
              <button type="button" className="btn btn-gradient" onClick={onOpenBusiness}>
                Open business console
              </button>
              <button type="button" className="btn btn-text" onClick={onSignOut}>
                <LogOutIcon size={14} /> Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="panel-copy">
              Arena owners, advertisers and developers need a business account. Player profiles
              cannot open the console.
            </p>
            <button type="button" className="btn btn-gradient" onClick={onOpenBusiness}>
              Sign in or apply
            </button>
          </>
        )}
      </section>
    </div>
  );
}

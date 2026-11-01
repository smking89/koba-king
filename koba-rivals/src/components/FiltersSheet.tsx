import type { CSSProperties } from 'react';
import { GAMES, getGame } from '../data/games';
import type { Filters, Platform, Region } from '../types';
import { CloseIcon } from './ui';

const PLATFORMS: Platform[] = ['PC', 'PS5', 'Xbox', 'Switch'];
const REGIONS: (Region | 'Any')[] = ['Any', 'EU', 'America', 'Oceania'];

interface FiltersSheetProps {
  filters: Filters;
  available: number;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}

export function FiltersSheet({ filters, available, onChange, onClose }: FiltersSheetProps) {
  const toggleGame = (id: string) => {
    const gameIds = filters.gameIds.includes(id)
      ? filters.gameIds.filter((entry) => entry !== id)
      : [...filters.gameIds, id];
    onChange({ ...filters, gameIds });
  };

  const togglePlatform = (platform: Platform) => {
    const platforms = filters.platforms.includes(platform)
      ? filters.platforms.filter((entry) => entry !== platform)
      : [...filters.platforms, platform];
    onChange({ ...filters, platforms });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Matchmaking filters"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-head">
          <div>
            <h2>Matchmaking</h2>
            <p>{available} players in your pool</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close filters">
            <CloseIcon />
          </button>
        </header>

        <div className="sheet-body">
          <div className="field">
            <h3>Games</h3>
            <div className="chip-grid">
              {GAMES.map((game) => {
                const active = filters.gameIds.includes(game.id);
                return (
                  <button
                    type="button"
                    key={game.id}
                    className={`chip-select${active ? ' is-active' : ''}`}
                    onClick={() => toggleGame(game.id)}
                    aria-pressed={active}
                  >
                    {game.short}
                  </button>
                );
              })}
            </div>
            <p className="field-note">Only see players on ladders you actually want to be challenged on.</p>
          </div>

          <div className="field">
            <h3>Platform</h3>
            <div className="chip-grid">
              {PLATFORMS.map((platform) => {
                const active = filters.platforms.includes(platform);
                return (
                  <button
                    type="button"
                    key={platform}
                    className={`chip-select${active ? ' is-active' : ''}`}
                    onClick={() => togglePlatform(platform)}
                    aria-pressed={active}
                  >
                    {platform}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <h3>Region</h3>
            <div className="chip-grid">
              {REGIONS.map((region) => (
                <button
                  type="button"
                  key={region}
                  className={`chip-select${filters.region === region ? ' is-active' : ''}`}
                  onClick={() => onChange({ ...filters, region })}
                  aria-pressed={filters.region === region}
                >
                  {region}
                </button>
              ))}
            </div>
            <label className="field-toggle">
              <input
                type="checkbox"
                checked={filters.crossRegionOptIn}
                onChange={(event) => onChange({ ...filters, crossRegionOptIn: event.target.checked })}
              />
              <span>Show players outside my region too</span>
            </label>
            <p className="field-note">
              Off by default - ping matters even though you can't see a number for it on console.
            </p>
          </div>

          <div className="field">
            <div className="field-head">
              <h3>Minimum fit</h3>
              <span className="field-value">{filters.minFit}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={filters.minFit}
              onChange={(event) => onChange({ ...filters, minFit: Number(event.target.value) })}
              aria-label="Minimum competitive fit"
              style={{ '--fill': `${(filters.minFit / 90) * 100}%` } as CSSProperties}
            />
            <p className="field-note">
              Fit weighs shared ladders, score proximity, bracket, region and playstyle.
            </p>
          </div>

          <div className="field">
            <h3>Skill brackets</h3>
            <ul className="loadout">
              {(['valorant', 'apex', 'rocketleague'] as string[]).map((id) => {
                const game = getGame(id);
                return (
                  <li key={id}>
                    <span>{game.name}</span>
                    <strong>{game.short} ladder</strong>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <footer className="sheet-foot">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => onChange({ gameIds: [], platforms: [], region: 'Any', minFit: 0, crossRegionOptIn: false })}
          >
            Reset
          </button>
          <button type="button" className="btn btn-gradient" onClick={onClose}>
            Apply · {available} players
          </button>
        </footer>
      </section>
    </div>
  );
}

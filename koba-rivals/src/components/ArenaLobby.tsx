import { useState } from 'react';
import { getGame } from '../data/games';
import { serversForGame } from '../data/servers';
import { KILL_TIERS, pointsDelta, stakeFor, tierFor } from '../lib/challenge';
import type { KillTier, Match, Player } from '../types';
import { Avatar, CheckIcon, ChevronLeftIcon, CopyIcon, ScorePill } from './ui';

interface ArenaLobbyProps {
  me: Player;
  player: Player;
  match: Match;
  onBack: () => void;
  onLock: (kills: KillTier, serverId: string) => void;
  onCopy: (text: string) => void;
}

export function ArenaLobby({ me, player, match, onBack, onLock, onCopy }: ArenaLobbyProps) {
  const game = getGame(match.gameId);
  const servers = serversForGame(match.gameId);
  const [kills, setKills] = useState<KillTier>(match.kills ?? 5);
  const [serverId, setServerId] = useState<string | null>(
    match.serverId ?? servers.find((server) => server.active)?.id ?? null,
  );

  const tier = tierFor(kills);
  const delta = pointsDelta(kills);
  const server = servers.find((entry) => entry.id === serverId);
  const locked = match.challenged;

  return (
    <div className="lobby">
      <header className="lobby-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to rivals">
          <ChevronLeftIcon />
        </button>
        <div>
          <h1>Arena Lobby</h1>
          <p>{game.name}</p>
        </div>
        <span className={`pill ${locked ? 'pill-locked' : 'pill-pending'}`}>
          {locked ? 'Locked' : 'Setting up'}
        </span>
      </header>

      {locked && (
        <div className="lobby-banner">
          <CheckIcon size={14} />
          Challenge locked — {match.kills} kills on{' '}
          {servers.find((entry) => entry.id === match.serverId)?.name ?? 'arena'}. Both players have
          been notified.
        </div>
      )}

      <section className="vs-card">
        <div className="vs-player">
          <Avatar player={me} size={56} />
          <div>
            <strong>{me.displayName}</strong>
            <span>@{me.username}</span>
          </div>
          <ScorePill value={me.score} small />
        </div>
        <span className="vs-divider">VS</span>
        <div className="vs-player">
          <Avatar player={player} size={56} />
          <div>
            <strong>{player.displayName}</strong>
            <span>@{player.username}</span>
          </div>
          <ScorePill value={player.score} small />
        </div>
      </section>

      <section className="lobby-section">
        <div className="section-head">
          <h2>Kill milestone</h2>
          <span>{stakeFor(kills).toLocaleString('en-US')} RP stake</span>
        </div>
        <div className="tier-track" role="group" aria-label="Kill milestone">
          {KILL_TIERS.map((entry) => (
            <button
              type="button"
              key={entry.kills}
              className={`tier-seg${kills === entry.kills ? ' is-active' : ''}`}
              onClick={() => setKills(entry.kills)}
              aria-pressed={kills === entry.kills}
            >
              <strong>{entry.kills}</strong>
              <span>{entry.label}</span>
              <em>×{entry.multiplier}</em>
            </button>
          ))}
        </div>
        <p className="section-note">
          {tier.blurb} · win +{delta.win} RP, loss {delta.loss} RP.
        </p>
      </section>

      <section className="lobby-section">
        <div className="section-head">
          <h2>Server arena</h2>
          <span>{servers.length} online</span>
        </div>
        {servers.length === 0 ? (
          <p className="section-note">
            No RCON-connected arenas for {game.name} yet. Once a partner server is connected it shows
            up here with live population and ping.
          </p>
        ) : (
          <ul className="server-list">
            {servers.map((entry) => (
              <li
                key={entry.id}
                className={`server-row${serverId === entry.id ? ' is-selected' : ''}`}
                onClick={() => setServerId(entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setServerId(entry.id);
                }}
              >
                <div className="server-main">
                  <p className="server-name">
                    <i className={`status-dot${entry.active ? ' is-on' : ''}`} />
                    {entry.name}
                  </p>
                  <p className="server-meta">
                    {entry.rules} · {entry.players}/{entry.maxPlayers} · {entry.region}
                  </p>
                </div>
                <div className="server-right">
                  <span className="ping">{entry.ping} ms</span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopy(entry.ip);
                    }}
                  >
                    {/* Console titles (e.g. Rust Console Edition) have no typed connect command - `ip` holds a Discord invite for those, not a real connect string. */}
                    <CopyIcon size={13} /> {/^https?:\/\//.test(entry.ip) ? 'Copy Invite' : 'Copy IP'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="lobby-foot">
        <div className="lobby-stake">
          <strong>
            {kills} kills · {tier.label}
          </strong>
          <small>{server ? `${server.name} · ${server.ping} ms` : 'Pick an arena to continue'}</small>
        </div>
        <button
          type="button"
          className="btn btn-gradient"
          disabled={!serverId}
          onClick={() => serverId && onLock(kills, serverId)}
        >
          {locked ? 'Update challenge' : 'Lock challenge'}
        </button>
      </div>
    </div>
  );
}

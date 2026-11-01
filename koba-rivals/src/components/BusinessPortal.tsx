import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { GAMES } from '../data/games';
import { SERVERS } from '../data/servers';
import { PLAN_LABEL } from '../lib/accounts';
import type { Account } from '../lib/accounts';
import type { ArenaServer } from '../types';
import { AdPortal } from './AdPortal';
import { BrandLockup } from './Brand';
import { BusinessGate } from './BusinessGate';
import { DeveloperPortal } from './DeveloperPortal';
import { Select } from './Select';
import {
  BuildingIcon,
  ChartIcon,
  CheckIcon,
  ChevronLeftIcon,
  CodeIcon,
  CopyIcon,
  LogOutIcon,
  MegaphoneIcon,
  PlusIcon,
  ServerIcon,
  TargetIcon,
} from './ui';

type Tab = 'overview' | 'servers' | 'promotion' | 'ads' | 'developers';

const TREND = [320, 410, 386, 520, 640, 718, 690, 812, 940, 884, 1020, 1140];
const PEAK = [8, 5, 3, 2, 4, 9, 18, 26, 34, 41, 52, 64, 72, 68, 74, 82, 96, 100, 88, 70, 54, 38, 24, 14];

interface BusinessPortalProps {
  account: Account | null;
  onAuthenticated: (account: Account) => void;
  onSignOut: () => void;
  onExit: () => void;
  onCopy: (text: string) => void;
  onNotify: (text: string) => void;
}

function TrendChart({ data }: { data: number[] }) {
  const width = 600;
  const height = 170;
  const pad = 10;
  const max = Math.max(...data) * 1.15;
  const step = (width - pad * 2) / (data.length - 1);
  const points = data.map((value, index) => [
    pad + index * step,
    height - pad - (value / max) * (height - pad * 2),
  ] as const);
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width - pad},${height - pad} L${pad},${height - pad} Z`;

  return (
    <svg className="trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="App-driven joins, last 12 weeks">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c40000" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#c40000" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          className="grid-line"
          x1={pad}
          x2={width - pad}
          y1={pad + fraction * (height - pad * 2)}
          y2={pad + fraction * (height - pad * 2)}
        />
      ))}
      <path d={area} fill="url(#trendFill)" />
      <path d={line} className="trend-line" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="4.5" className="trend-dot" />
    </svg>
  );
}

export function BusinessPortal({
  account,
  onAuthenticated,
  onSignOut,
  onExit,
  onCopy,
  onNotify,
}: BusinessPortalProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [servers, setServers] = useState<ArenaServer[]>(SERVERS.slice(0, 3));
  const [diag, setDiag] = useState<Record<string, string>>({});
  const [featured, setFeatured] = useState<Record<string, boolean>>({ s1: true, s2: false, s3: false });
  const [bid, setBid] = useState(180);
  const [events, setEvents] = useState([
    { id: 'e1', name: 'Rivals Weekend', multiplier: 2 },
    { id: 'e2', name: 'Execution Hour', multiplier: 3 },
  ]);
  const [form, setForm] = useState({ name: '', ip: '', gameId: 'valorant' });
  const [eventName, setEventName] = useState('');

  const revenue = Math.round(12840 + bid * 12);

  // Business tooling is gated: without a signed-in business account only the
  // sign-in / application screen is reachable.
  if (!account) {
    return <BusinessGate onAuthenticated={onAuthenticated} onExit={onExit} />;
  }

  const runDiagnostics = (id: string) => {
    setDiag((prev) => ({ ...prev, [id]: 'Checking RCON handshake…' }));
    window.setTimeout(() => {
      setDiag((prev) => ({ ...prev, [id]: 'Handshake OK · 42 ms · 0% packet loss' }));
    }, 900);
  };

  const addServer = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.ip.trim()) return;
    const server: ArenaServer = {
      id: `n${Date.now()}`,
      name: form.name.trim(),
      gameId: form.gameId,
      ip: form.ip.trim(),
      region: 'America',
      players: 0,
      maxPlayers: 24,
      ping: 0,
      active: false,
      rules: 'New · awaiting RCON verification',
      featured: false,
    };
    setServers((prev) => [...prev, server]);
    setDiag((prev) => ({ ...prev, [server.id]: 'RCON not verified yet — run diagnostics' }));
    setFeatured((prev) => ({ ...prev, [server.id]: false }));
    setForm({ name: '', ip: '', gameId: 'valorant' });
  };

  const addEvent = (event: FormEvent) => {
    event.preventDefault();
    if (!eventName.trim()) return;
    setEvents((prev) => [...prev, { id: `e${Date.now()}`, name: eventName.trim(), multiplier: 2 }]);
    setEventName('');
  };

  return (
    <div className="biz">
      <aside className="biz-rail">
        <BrandLockup subtitle="Business" />

        <nav className="biz-nav" aria-label="Business sections">
          <button
            type="button"
            className={tab === 'overview' ? 'is-active' : ''}
            onClick={() => setTab('overview')}
          >
            <ChartIcon /> Overview
          </button>
          <button
            type="button"
            className={tab === 'servers' ? 'is-active' : ''}
            onClick={() => setTab('servers')}
          >
            <ServerIcon /> Servers
            <span className="nav-count">{servers.length}</span>
          </button>
          <button
            type="button"
            className={tab === 'promotion' ? 'is-active' : ''}
            onClick={() => setTab('promotion')}
          >
            <MegaphoneIcon /> Promotion
          </button>
          <button
            type="button"
            className={tab === 'ads' ? 'is-active' : ''}
            onClick={() => setTab('ads')}
          >
            <TargetIcon /> Ad portal
          </button>
          <button
            type="button"
            className={tab === 'developers' ? 'is-active' : ''}
            onClick={() => setTab('developers')}
          >
            <CodeIcon /> Developers
          </button>
        </nav>

        <div className="biz-rail-foot">
          <div className="biz-account">
            <BuildingIcon size={15} />
            <div>
              <strong>{account.company}</strong>
              <span className="verified-inline">
                <CheckIcon size={10} /> {PLAN_LABEL[account.plan]} plan
              </span>
              <span className="biz-account-mail">{account.email}</span>
            </div>
          </div>
          <button type="button" className="btn btn-soft biz-back" onClick={onExit}>
            <ChevronLeftIcon size={15} /> Back to app
          </button>
          <button type="button" className="btn btn-text biz-signout" onClick={onSignOut}>
            <LogOutIcon size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="biz-main">
        {tab === 'overview' && (
          <>
            <header className="biz-head">
              <div>
                <h1>Server console</h1>
                <p>App-driven traffic across {account.company} · last 12 weeks</p>
              </div>
              <span className="pill pill-live">
                <i className="status-dot is-on" /> All systems active
              </span>
            </header>

            <div className="metric-grid">
              <div className="metric">
                <span className="metric-label">App joins</span>
                <strong className="metric-value">12,480</strong>
                <span className="delta">+18.4% vs last period</span>
              </div>
              <div className="metric">
                <span className="metric-label">Rivalries hosted</span>
                <strong className="metric-value">1,842</strong>
                <span className="delta">+9.1%</span>
              </div>
              <div className="metric">
                <span className="metric-label">Unique players</span>
                <strong className="metric-value">6,204</strong>
                <span className="delta">+12.7%</span>
              </div>
              <div className="metric">
                <span className="metric-label">Est. placement value</span>
                <strong className="metric-value">${revenue.toLocaleString('en-US')}</strong>
                <span className="metric-label">this month</span>
              </div>
            </div>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>App-driven joins</h2>
                <span className="chart-legend">
                  <i /> KOBA traffic
                </span>
              </div>
              <TrendChart data={TREND} />
              <div className="x-axis">
                <span>Week 1</span>
                <span>Week 3</span>
                <span>Week 5</span>
                <span>Week 7</span>
                <span>Week 9</span>
                <span>Week 12</span>
              </div>
            </section>

            <div className="biz-split">
              <section className="biz-card">
                <div className="biz-card-head">
                  <h2>Peak rival hours</h2>
                  <span className="biz-muted">UTC</span>
                </div>
                <div className="peak-bars">
                  {PEAK.map((value, hour) => (
                    <span
                      key={hour}
                      className={`peak-bar${value === 100 ? ' is-peak' : ''}`}
                      style={{ height: `${Math.max(6, value)}%` }}
                      title={`${hour}:00 — ${value} index`}
                    />
                  ))}
                </div>
                <div className="x-axis">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>23</span>
                </div>
              </section>

              <section className="biz-card">
                <div className="biz-card-head">
                  <h2>Retention</h2>
                </div>
                <div className="retention">
                  <div>
                    <strong>68%</strong>
                    <span>bookmark the arena after a challenge</span>
                  </div>
                  <div>
                    <strong>31%</strong>
                    <span>return outside an active challenge</span>
                  </div>
                </div>
              </section>
            </div>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Your servers</h2>
                <button type="button" className="btn btn-soft" onClick={() => setTab('servers')}>
                  Manage
                </button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Server</th>
                    <th>Game</th>
                    <th>Status</th>
                    <th className="num">App joins</th>
                    <th className="num">Rivalries</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((server, index) => (
                    <tr key={server.id}>
                      <td>
                        <strong>{server.name}</strong>
                        <span className="cell-sub">{server.ip}</span>
                      </td>
                      <td>{GAMES.find((game) => game.id === server.gameId)?.short ?? '—'}</td>
                      <td>
                        <span className={`status-pill ${server.active ? 'is-active' : 'is-retrying'}`}>
                          ● {server.active ? 'Active' : 'Retrying'}
                        </span>
                      </td>
                      <td className="num">{(1240 - index * 310).toLocaleString('en-US')}</td>
                      <td className="num">{180 - index * 41}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {tab === 'servers' && (
          <>
            <header className="biz-head">
              <div>
                <h1>Servers</h1>
                <p>RCON-connected arenas available to players in the Arena Finder</p>
              </div>
            </header>

            <form className="biz-card add-form" onSubmit={addServer}>
              <h2>Connect a server</h2>
              <div className="form-grid">
                <label className="form-field">
                  <span>Server name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Rustopia Main"
                  />
                </label>
                <label className="form-field">
                  <span>IP : Query port</span>
                  <input
                    value={form.ip}
                    onChange={(event) => setForm({ ...form, ip: event.target.value })}
                    placeholder="147.185.221.10:28015"
                  />
                </label>
                <div className="form-field">
                  <span>Game</span>
                  <Select
                    label="Game"
                    value={form.gameId}
                    onChange={(gameId) => setForm({ ...form, gameId })}
                    options={GAMES.map((game) => ({
                      value: game.id,
                      label: game.name,
                      hint: `${game.category} · ${game.platforms.join(', ')}`,
                      game,
                    }))}
                  />
                </div>
                <label className="form-field">
                  <span>WebRcon credentials</span>
                  <input placeholder="Stored server-side, never exposed" disabled />
                </label>
              </div>
              <p className="form-note">
                Credentials are encrypted at rest and used only by the log parser. Add them from the
                secure terminal in production.
              </p>
              <button type="submit" className="btn btn-gradient">
                <PlusIcon size={14} /> Provision server
              </button>
            </form>

            <div className="server-cards">
              {servers.map((server) => (
                <section className="biz-card server-card" key={server.id}>
                  <div className="server-card-head">
                    <div>
                      <h2>{server.name}</h2>
                      <p>
                        {GAMES.find((game) => game.id === server.gameId)?.name ?? 'Unknown'} ·{' '}
                        {server.ip}
                      </p>
                    </div>
                    <span className={`status-pill ${server.active ? 'is-active' : 'is-retrying'}`}>
                      ● {server.active ? 'Active' : 'Retrying'}
                    </span>
                  </div>
                  <dl className="server-stats">
                    <div>
                      <dt>Players</dt>
                      <dd>
                        {server.players}/{server.maxPlayers}
                      </dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>{server.ping || 42} ms</dd>
                    </div>
                    <div>
                      <dt>Region</dt>
                      <dd>{server.region}</dd>
                    </div>
                    <div>
                      <dt>Rules</dt>
                      <dd>{server.rules.split(' · ')[0]}</dd>
                    </div>
                  </dl>
                  <div className="server-card-actions">
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={() => onCopy(server.ip)}
                    >
                      <CopyIcon size={13} /> Copy IP
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => runDiagnostics(server.id)}
                    >
                      Run diagnostics
                    </button>
                  </div>
                  {diag[server.id] && <p className="diag-line">{diag[server.id]}</p>}
                </section>
              ))}
            </div>
          </>
        )}

        {tab === 'promotion' && (
          <>
            <header className="biz-head">
              <div>
                <h1>Promotion</h1>
                <p>Buy visibility in the player Arena Finder and host sponsored rivalries</p>
              </div>
            </header>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Featured arena placements</h2>
                <span className="biz-muted">Top row of Arena Finder</span>
              </div>
              <ul className="placement-list">
                {servers.map((server) => (
                  <li key={server.id} className="placement-row">
                    <div>
                      <strong>{server.name}</strong>
                      <span>
                        {GAMES.find((game) => game.id === server.gameId)?.name ?? '—'} ·{' '}
                        {server.region}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`switch${featured[server.id] ? ' is-on' : ''}`}
                      onClick={() =>
                        setFeatured((prev) => ({ ...prev, [server.id]: !prev[server.id] }))
                      }
                      aria-pressed={Boolean(featured[server.id])}
                      aria-label={`Feature ${server.name}`}
                    >
                      <span className="switch-knob" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="bid-row">
                <label htmlFor="bid">Weekly bid</label>
                <input
                  id="bid"
                  type="range"
                  min={0}
                  max={500}
                  step={10}
                  value={bid}
                  onChange={(event) => setBid(Number(event.target.value))}
                  style={{ '--fill': `${(bid / 500) * 100}%` } as CSSProperties}
                />
                <strong>${bid}</strong>
              </div>
              <p className="form-note">
                Est. {Math.round(bid * 4.2)} extra joins per week at this bid. Billing only runs while
                a placement is live.
              </p>
            </section>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Sponsored events</h2>
                <span className="biz-muted">{events.length} scheduled</span>
              </div>
              <ul className="event-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>{event.name}</strong>
                      <span>Points multiplier ×{event.multiplier} on resolved rivalries</span>
                    </div>
                    <span className="status-pill is-active">Scheduled</span>
                  </li>
                ))}
              </ul>
              <form className="event-form" onSubmit={addEvent}>
                <input
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="Rivals Weekend"
                  aria-label="Event name"
                />
                <button type="submit" className="btn btn-gradient">
                  Create event
                </button>
              </form>
            </section>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>VIP perks</h2>
              </div>
              <p className="biz-copy">
                Link your Tebex store to grant automatic VIP slots to players above 90% reliability.
                Store keys stay server-side and are never shown in the player app.
              </p>
              <button type="button" className="btn btn-outline">
                Connect store
              </button>
            </section>
          </>
        )}

        {tab === 'ads' && <AdPortal account={account} onCopy={onCopy} onNotify={onNotify} />}

        {tab === 'developers' && (
          <DeveloperPortal account={account} onCopy={onCopy} onNotify={onNotify} />
        )}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { GAMES, getGame } from '../data/games';
import type { Account } from '../lib/accounts';
import { DEFAULT_CPC, OBJECTIVE_LABEL, estimateDelivery, previewUrl } from '../lib/ads';
import type { Campaign, Objective, PreviewPayload } from '../lib/ads';
import { useAds } from '../lib/useAds';
import { Select } from './Select';
import { SponsoredCard } from './SponsoredCard';
import { CopyIcon, GameLogo, PlayIcon, PlusIcon, TargetIcon, WalletIcon } from './ui';
import './adportal.css';

type AdTab = 'overview' | 'campaigns' | 'billing';

const TABS: { id: AdTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'billing', label: 'Billing' },
];

const money = (value: number): string =>
  `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

interface AdPortalProps {
  account: Account;
  onCopy: (text: string) => void;
  onNotify: (text: string) => void;
}

/** Advertiser-facing portal inside the business console: reporting, PPC campaigns, money. */
export function AdPortal({ account, onCopy, onNotify }: AdPortalProps) {
  const [ads, setAds] = useAds();
  const [tab, setTab] = useState<AdTab>('overview');
  const [review, setReview] = useState(false);

  const [name, setName] = useState('');
  const [objective, setObjective] = useState<Objective>('clicks');
  const [games, setGames] = useState<string[]>(['valorant']);
  const [regions, setRegions] = useState<string[]>(['America', 'EU']);
  const [daily, setDaily] = useState(60);
  const [cpc, setCpc] = useState(DEFAULT_CPC);
  const [headline, setHeadline] = useState('Find a rival at your rank tonight');
  const [body, setBody] = useState('Swipe, match and lock a 5-kill Vendetta on a verified arena.');
  const [cta, setCta] = useState('Find a rival');

  const campaignList = ads.campaigns;
  const wallet = ads.wallet;

  const spend = campaignList.reduce((total, campaign) => total + campaign.spend, 0);
  const impressions = campaignList.reduce((total, campaign) => total + campaign.impressions, 0);
  const clicks = campaignList.reduce((total, campaign) => total + campaign.clicks, 0);
  const conversions = campaignList.reduce((total, campaign) => total + campaign.conversions, 0);
  const reserved = campaignList.reduce((total, campaign) => total + campaign.budget, 0);
  const ctr = impressions ? ((clicks / impressions) * 100).toFixed(2) : '0.00';
  const cpa = conversions ? (spend / conversions).toFixed(2) : '—';
  const avgCpc = clicks ? (spend / clicks).toFixed(2) : cpc.toFixed(2);
  const hero = getGame(games[0] ?? campaignList[0]?.games[0] ?? 'valorant');

  const estimate = estimateDelivery(daily, cpc);
  const flightBudget = daily * 14;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const linkFor = (campaign: Campaign, dailyBudget: number): string =>
    previewUrl(
      {
        name: campaign.name,
        objective: campaign.objective,
        games: campaign.games,
        region: campaign.region ?? '',
        cpc: campaign.cpc ?? DEFAULT_CPC,
        daily: dailyBudget,
        budget: campaign.budget,
        headline: campaign.headline ?? '',
        body: campaign.body ?? '',
        cta: campaign.cta ?? 'Enter arena',
        sponsor: campaign.sponsor ?? account.company,
      },
      origin,
    );

  // The exact campaign the deck would receive, built but not yet committed.
  const draft = useMemo<Campaign>(
    () => ({
      id: 'draft',
      name: name.trim() || 'Untitled campaign',
      objective,
      status: 'active',
      games,
      budget: flightBudget,
      spend: 0,
      cpc,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      sponsor: account.company,
      headline: headline.trim() || 'Find a rival at your rank tonight',
      body: body.trim() || 'Swipe, match and lock a 5-kill Vendetta on a verified arena.',
      cta,
      region: regions[0],
      serverName: `${account.company} arena`,
    }),
    [name, objective, games, flightBudget, cpc, account.company, headline, body, cta, regions],
  );

  useEffect(() => {
    if (!review) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReview(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [review]);

  // Deterministic 12-day delivery curve so the chart moves with real spend.
  const trend = Array.from({ length: 12 }, (_, index) => {
    const base = spend / 12;
    return Math.max(4, Math.round(base * (0.55 + 0.45 * Math.sin(index / 2.1)) + index * 2));
  });

  const toggleGame = (id: string) => {
    setGames((prev) => (prev.includes(id) ? prev.filter((game) => game !== id) : [...prev, id]));
  };

  const toggleRegion = (region: string) => {
    setRegions((prev) => (prev.includes(region) ? prev.filter((entry) => entry !== region) : [...prev, region]));
  };

  const openReview = () => {
    if (!name.trim()) {
      onNotify('Name the campaign first');
      return;
    }
    if (games.length === 0) {
      onNotify('Pick at least one game to target');
      return;
    }
    if (regions.length === 0) {
      onNotify('Pick at least one region');
      return;
    }
    if (flightBudget > wallet) {
      onNotify('Campaign budget is above your wallet balance');
      return;
    }
    setReview(true);
  };

  const commit = (status: 'active' | 'paused') => {
    const campaign: Campaign = { ...draft, status, id: `c${Date.now()}` };
    setAds({ ...ads, wallet: wallet - campaign.budget, campaigns: [campaign, ...campaignList] });
    setReview(false);
    setName('');
    setTab('campaigns');
    onNotify(
      status === 'paused'
        ? `${campaign.name} saved as paused — ${money(campaign.budget)} reserved, nothing delivering`
        : `${campaign.name} is live — ${money(campaign.budget)} reserved at ${money(cpc)} max CPC`,
    );
  };

  const sharePreview = (campaign: Campaign, dailyBudget: number) => {
    const payload: PreviewPayload = {
      name: campaign.name,
      objective: campaign.objective,
      games: campaign.games,
      region: campaign.region ?? '',
      cpc: campaign.cpc ?? DEFAULT_CPC,
      daily: dailyBudget,
      budget: campaign.budget,
      headline: campaign.headline ?? '',
      body: campaign.body ?? '',
      cta: campaign.cta ?? 'Enter arena',
      sponsor: campaign.sponsor ?? account.company,
    };
    onCopy(previewUrl(payload, origin));
  };

  const toggleStatus = (id: string) => {
    setAds({
      ...ads,
      campaigns: campaignList.map((campaign) =>
        campaign.id === id
          ? { ...campaign, status: campaign.status === 'active' ? 'paused' : 'active' }
          : campaign,
      ),
    });
  };

  const topUp = () => {
    setAds({ ...ads, wallet: wallet + 1000 });
    onNotify('$1,000 added to the test wallet');
  };

  return (
    <>
      <header className="biz-head">
        <div>
          <h1>Ad portal</h1>
          <p>{account.company} · PPC campaigns across the deck, billed per click</p>
        </div>
        <div className="wallet">
          <WalletIcon size={15} />
          <span>
            Balance <strong>{money(wallet)}</strong>
          </span>
          <button type="button" className="btn btn-outline" onClick={topUp}>
            <PlusIcon size={13} /> Add funds
          </button>
        </div>
      </header>

      <div className="ad-tabs" role="tablist" aria-label="Ad portal sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`ad-tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'campaigns' && campaignList.length > 0 && (
              <span className="ad-tab-count">{campaignList.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Impressions</span>
              <strong className="metric-value">{impressions.toLocaleString('en-US')}</strong>
              <span className="delta">{ctr}% CTR</span>
            </div>
            <div className="metric">
              <span className="metric-label">Clicks</span>
              <strong className="metric-value">{clicks.toLocaleString('en-US')}</strong>
              <span className="metric-label">{money(Number(avgCpc))} average CPC</span>
            </div>
            <div className="metric">
              <span className="metric-label">Rivalries</span>
              <strong className="metric-value">{conversions.toLocaleString('en-US')}</strong>
              <span className="delta">${cpa} cost each</span>
            </div>
            <div className="metric">
              <span className="metric-label">Spend</span>
              <strong className="metric-value">{money(spend)}</strong>
              <span className="metric-label">of {money(reserved)} reserved</span>
            </div>
          </div>

          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Daily spend</h2>
              <span className="biz-muted">last 12 days · {money(spend / 12)} avg</span>
            </div>
            <div className="ad-chart" aria-hidden="true">
              {trend.map((value, index) => (
                <span
                  key={index}
                  className={`ad-bar${value === Math.max(...trend) ? ' is-peak' : ''}`}
                  style={{ height: `${Math.max(8, (value / Math.max(...trend)) * 100)}%` }}
                />
              ))}
            </div>
            <div className="x-axis">
              <span>Day 1</span>
              <span>Day 4</span>
              <span>Day 8</span>
              <span>Day 12</span>
            </div>
          </section>

          <div className="biz-split">
            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Top campaigns</h2>
                <button type="button" className="btn btn-soft" onClick={() => setTab('campaigns')}>
                  Manage
                </button>
              </div>
              {campaignList.length === 0 ? (
                <p className="ad-empty">No campaigns yet.</p>
              ) : (
                [...campaignList]
                  .sort((a, b) => b.impressions - a.impressions)
                  .slice(0, 4)
                  .map((campaign) => (
                    <div className="ad-row" key={campaign.id}>
                      <span>
                        <strong>{campaign.name}</strong>
                        <span className="biz-muted">
                          {OBJECTIVE_LABEL[campaign.objective]} · {money(campaign.cpc ?? DEFAULT_CPC)} CPC
                        </span>
                      </span>
                      <span className="biz-muted">{campaign.impressions.toLocaleString('en-US')} impr.</span>
                      <span className={`status-pill ${campaign.status === 'active' ? 'is-active' : 'is-retrying'}`}>
                        {campaign.status === 'active' ? 'Delivering' : 'Paused'}
                      </span>
                    </div>
                  ))
              )}
            </section>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Creative preview</h2>
                <span className="biz-muted">In-deck</span>
              </div>
              <div className="preview-card">
                <div
                  className="preview-banner"
                  style={{
                    background: `radial-gradient(120% 90% at 78% 12%, ${hero.accent[0]} 0%, ${hero.accent[1]} 80%)`,
                  }}
                >
                  <span className="preview-ad-label">Sponsored</span>
                  <GameLogo game={hero} className="preview-logo" />
                </div>
                <div className="preview-body">
                  <strong>{headline || 'Your headline here'}</strong>
                  <p>{body || 'Add a line of copy that tells players why they should swipe.'}</p>
                  <span className="preview-cta">{cta}</span>
                  <span className="preview-brand">
                    <TargetIcon size={11} /> {regions.join(' · ') || 'No regions'} · {games.length} game
                    {games.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {tab === 'campaigns' && (
        <>
          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Campaigns</h2>
              <span className="biz-muted">{campaignList.length} total</span>
            </div>
            {campaignList.length === 0 ? (
              <p className="ad-empty">Nothing running yet. Build your first campaign below.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Objective</th>
                    <th className="num">CTR</th>
                    <th className="num">Spend</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campaignList.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <strong>{campaign.name}</strong>
                        <span className="cell-sub">
                          {campaign.games.map((id) => getGame(id).short).join(' · ')} ·{' '}
                          {campaign.status === 'active' ? 'Delivering' : 'Paused'} ·{' '}
                          {money(campaign.cpc ?? DEFAULT_CPC)} CPC
                        </span>
                        <div className="pacing">
                          <div
                            className="pacing-fill"
                            style={{ width: `${Math.min(100, (campaign.spend / Math.max(1, campaign.budget)) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td>{OBJECTIVE_LABEL[campaign.objective]}</td>
                      <td className="num">
                        {campaign.impressions
                          ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2)
                          : '—'}
                        %
                      </td>
                      <td className="num">{money(campaign.spend)}</td>
                      <td className="num">
                        <a
                          className="btn btn-text"
                          href={linkFor(campaign, Math.max(1, Math.round(campaign.budget / 14)))}
                          target="_blank"
                          rel="noreferrer"
                          title="Open the shareable preview"
                        >
                          Preview
                        </a>
                        <button
                          type="button"
                          className={`switch${campaign.status === 'active' ? ' is-on' : ''}`}
                          onClick={() => toggleStatus(campaign.id)}
                          aria-pressed={campaign.status === 'active'}
                          aria-label={`${campaign.status === 'active' ? 'Pause' : 'Resume'} ${campaign.name}`}
                        >
                          <span className="switch-knob" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="add-form-actions">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => sharePreview(draft, daily)}
              >
                <CopyIcon size={13} /> Copy preview link
              </button>
              <span className="biz-muted">
                Opens the exact card with no sign-in — send it to the client.
              </span>
            </div>
          </section>

          <section className="biz-card add-form">
            <div className="biz-card-head">
              <h2>New campaign</h2>
              <span className="biz-muted">
                PPC · {money(daily)}/day · up to {money(cpc)} per click
              </span>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>Campaign name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Skirmish nights · NA"
                />
              </label>
              <div className="form-field">
                <span>Optimise for</span>
                <Select
                  label="Optimise for"
                  value={objective}
                  onChange={(next) => setObjective(next as Objective)}
                  options={(Object.keys(OBJECTIVE_LABEL) as Objective[]).map((option) => ({
                    value: option,
                    label: OBJECTIVE_LABEL[option],
                    hint:
                      option === 'awareness'
                        ? 'impressions only, no click billing'
                        : option === 'clicks'
                          ? 'pay per arena click'
                          : 'pay per locked rivalry',
                  }))}
                />
              </div>
            </div>

            <div className="form-field">
              <span>Games</span>
              <div className="logo-picks">
                {GAMES.slice(0, 12).map((game) => (
                  <button
                    type="button"
                    key={game.id}
                    className={`logo-tile${games.includes(game.id) ? ' is-active' : ''}`}
                    onClick={() => toggleGame(game.id)}
                    aria-pressed={games.includes(game.id)}
                    title={game.name}
                  >
                    <span className="logo-tile-art">
                      <GameLogo game={game} />
                    </span>
                    <span className="logo-tile-name">{game.short}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-field">
              <span>Regions</span>
              <div className="chip-grid">
                {['EU', 'America', 'Oceania'].map((region) => (
                  <button
                    type="button"
                    key={region}
                    className={`chip-select${regions.includes(region) ? ' is-active' : ''}`}
                    onClick={() => toggleRegion(region)}
                    aria-pressed={regions.includes(region)}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            <div className="bid-row">
              <label htmlFor="ad-daily-budget">Daily budget</label>
              <input
                id="ad-daily-budget"
                type="range"
                min={20}
                max={500}
                step={10}
                value={daily}
                onChange={(event) => setDaily(Number(event.target.value))}
                style={{ '--fill': `${((daily - 20) / 480) * 100}%` } as CSSProperties}
              />
              <strong>{money(daily)}</strong>
            </div>

            <div className="bid-row">
              <label htmlFor="ad-cpc">Max cost per click</label>
              <input
                id="ad-cpc"
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={cpc}
                onChange={(event) => setCpc(Number(event.target.value))}
                style={{ '--fill': `${((cpc - 0.2) / 2.8) * 100}%` } as CSSProperties}
              />
              <strong>{money(cpc)}</strong>
            </div>

            <div className="ad-estimate">
              <span>
                <strong>{estimate.clicks.toLocaleString('en-US')}</strong> est. clicks / day
              </span>
              <span>
                <strong>{estimate.impressions.toLocaleString('en-US')}</strong> est. impressions / day
              </span>
              <span>
                <strong>{money(flightBudget)}</strong> reserved for 14 days
              </span>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span>Headline</span>
                <input value={headline} maxLength={46} onChange={(event) => setHeadline(event.target.value)} />
              </label>
              <div className="form-field">
                <span>Button</span>
                <Select
                  label="Call to action"
                  value={cta}
                  onChange={setCta}
                  options={['Find a rival', 'Enter arena', 'Join lobby', 'Copy IP'].map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />
              </div>
            </div>

            <label className="form-field">
              <span>Body</span>
              <input value={body} maxLength={90} onChange={(event) => setBody(event.target.value)} />
            </label>

            <div className="add-form-actions">
              <button type="button" className="btn btn-gradient" onClick={openReview}>
                <PlayIcon size={13} /> Preview &amp; review
              </button>
              <span className="biz-muted">Nothing publishes until you confirm the preview.</span>
            </div>
            <p className="form-note">
              PPC: you pay only when a player taps the sponsored card, never for the impression. Spend
              stops at the daily budget, and the card is always labelled. Prototype: no payments are
              taken and no real pixels fire.
            </p>
          </section>
        </>
      )}

      {tab === 'billing' && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Wallet balance</span>
              <strong className="metric-value">{money(wallet)}</strong>
              <span className="metric-label">available to reserve</span>
            </div>
            <div className="metric">
              <span className="metric-label">Reserved</span>
              <strong className="metric-value">{money(reserved)}</strong>
              <span className="metric-label">across {campaignList.length} campaigns</span>
            </div>
            <div className="metric">
              <span className="metric-label">Spent</span>
              <strong className="metric-value">{money(spend)}</strong>
              <span className="metric-label">billed on clicks</span>
            </div>
            <div className="metric">
              <span className="metric-label">Cost per rivalry</span>
              <strong className="metric-value">${cpa}</strong>
              <span className="metric-label">{conversions.toLocaleString('en-US')} formed</span>
            </div>
          </div>

          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Ledger</h2>
              <span className="biz-muted">test wallet · no real money</span>
            </div>
            <div className="ad-row">
              <span>
                <strong>Opening balance</strong>
                <span className="biz-muted">seeded demo funds</span>
              </span>
              <span className="biz-muted">—</span>
              <span className="ad-amount">+$4,200.00</span>
            </div>
            {campaignList.map((campaign) => (
              <div className="ad-row" key={campaign.id}>
                <span>
                  <strong>Budget reserved</strong>
                  <span className="biz-muted">{campaign.name}</span>
                </span>
                <span className="biz-muted">{money(campaign.cpc ?? DEFAULT_CPC)} CPC</span>
                <span className="ad-amount is-out">−{money(campaign.budget)}</span>
              </div>
            ))}
            <p className="form-note">
              Reservations release pro rata if you pause a campaign. Billing is per click at the bid
              you set, capped by the flight budget. Invoices and VAT are out of scope for this
              prototype.
            </p>
            <div className="add-form-actions">
              <button type="button" className="btn btn-gradient" onClick={topUp}>
                <PlusIcon size={13} /> Add $1,000 test funds
              </button>
            </div>
          </section>
        </>
      )}

      {review && (
        <div
          className="ad-review-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Review campaign before publishing"
          onClick={() => setReview(false)}
        >
          <div className="ad-review" onClick={(event) => event.stopPropagation()}>
            <header className="ad-review-head">
              <div>
                <span className="ad-review-kicker">Step 2 of 2 · review</span>
                <h2>Publish “{draft.name}”?</h2>
              </div>
              <button type="button" className="btn btn-text" onClick={() => setReview(false)}>
                Cancel
              </button>
            </header>

            <div className="ad-review-body">
              <div className="ad-review-card">
                <p className="ad-review-label">Exactly how it appears in the deck</p>
                <SponsoredCard campaign={draft} onOpen={() => {}} onHide={() => {}} />
              </div>

              <div className="ad-review-summary">
                <h3>Delivery estimate</h3>
                <dl>
                  <div>
                    <dt>Pricing</dt>
                    <dd>PPC · {money(cpc)} max CPC</dd>
                  </div>
                  <div>
                    <dt>Daily budget</dt>
                    <dd>{money(daily)}</dd>
                  </div>
                  <div>
                    <dt>Flight</dt>
                    <dd>14 days · {money(flightBudget)}</dd>
                  </div>
                  <div>
                    <dt>Est. clicks / day</dt>
                    <dd>{estimate.clicks.toLocaleString('en-US')}</dd>
                  </div>
                  <div>
                    <dt>Est. impressions / day</dt>
                    <dd>{estimate.impressions.toLocaleString('en-US')}</dd>
                  </div>
                  <div>
                    <dt>Objective</dt>
                    <dd>{OBJECTIVE_LABEL[objective]}</dd>
                  </div>
                  <div>
                    <dt>Targeting</dt>
                    <dd>{regions.join(' · ')}</dd>
                  </div>
                  <div>
                    <dt>Games</dt>
                    <dd>{games.map((id) => getGame(id).short).join(' · ')}</dd>
                  </div>
                </dl>
                <p className="ad-review-note">
                  {money(flightBudget)} is reserved from your wallet when you publish, live or paused.
                  Paused campaigns keep their budget reserved and serve no cards until you resume them.
                  Clicks bill at up to {money(cpc)} each and stop at the budget.
                </p>
                <div className="add-form-actions">
                  <button type="button" className="btn btn-gradient" onClick={() => commit('active')}>
                    Publish live
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => commit('paused')}>
                    Publish as paused
                  </button>
                  <button type="button" className="btn btn-soft" onClick={() => setReview(false)}>
                    Back to edit
                  </button>
                </div>
                <div className="add-form-actions">
                  <button type="button" className="btn btn-text" onClick={() => sharePreview(draft, daily)}>
                    <CopyIcon size={12} /> Copy shareable preview link
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

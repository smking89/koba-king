import { OBJECTIVE_LABEL, estimateDelivery, previewCampaign } from '../lib/ads';
import type { PreviewPayload } from '../lib/ads';
import { BrandLockup } from './Brand';
import { SponsoredCard } from './SponsoredCard';
import './adportal.css';

const money = (value: number): string =>
  `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

interface CampaignPreviewProps {
  payload: PreviewPayload;
}

/**
 * Public, sign-in-free preview of a campaign creative. Everything it needs is
 * encoded in the link, so a client can review the card before anything ships.
 */
export function CampaignPreview({ payload }: CampaignPreviewProps) {
  const campaign = previewCampaign(payload);
  const estimate = estimateDelivery(payload.daily, payload.cpc);

  return (
    <div className="cp">
      <header className="cp-bar">
        <a className="cp-home" href="/">
          <BrandLockup />
        </a>
        <span className="cp-badge">Shared preview</span>
        <a className="btn btn-soft cp-console" href="/?business">
          Ad portal
        </a>
      </header>

      <main className="cp-body">
        <section className="cp-card">
          <p className="cp-kicker">Campaign preview</p>
          <h1>{payload.name}</h1>
          <p className="cp-lede">
            This is the exact card players meet in the deck. Impressions are free; a tap bills up to{' '}
            {money(payload.cpc)}, capped by the flight budget.
          </p>
          <SponsoredCard campaign={campaign} onOpen={() => {}} onHide={() => {}} />
        </section>

        <aside className="cp-panel">
          <h2>At a glance</h2>
          <dl>
            <div>
              <dt>Objective</dt>
              <dd>{OBJECTIVE_LABEL[payload.objective]}</dd>
            </div>
            <div>
              <dt>Pricing</dt>
              <dd>PPC · {money(payload.cpc)} max CPC</dd>
            </div>
            <div>
              <dt>Daily budget</dt>
              <dd>{money(payload.daily)}</dd>
            </div>
            <div>
              <dt>Flight</dt>
              <dd>14 days · {money(payload.budget)}</dd>
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
              <dt>Region</dt>
              <dd>{payload.region || 'Any'}</dd>
            </div>
            <div>
              <dt>Games</dt>
              <dd>{payload.games.join(' · ')}</dd>
            </div>
          </dl>
          <a className="btn btn-gradient" href="/?business">
            Open the ad portal
          </a>
          <p className="cp-note">
            Preview only — this campaign is not live, no budget is reserved and no impressions are
            billed.
          </p>
        </aside>
      </main>
    </div>
  );
}

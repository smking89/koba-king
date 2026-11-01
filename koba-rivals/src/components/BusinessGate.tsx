import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  createBusinessAccount,
  DEMO_BUSINESS,
  isValidEmail,
  PLAN_LABEL,
  signIn,
  signInDemo,
} from '../lib/accounts';
import type { Account, BusinessPlan } from '../lib/accounts';
import { BrandLockup } from './Brand';
import { BuildingIcon, CheckIcon, ChartIcon, ChevronLeftIcon, KeyIcon, MegaphoneIcon, TargetIcon } from './ui';

type Mode = 'signin' | 'signup';

interface BusinessGateProps {
  onAuthenticated: (account: Account) => void;
  onExit: () => void;
}

const PERKS = [
  { icon: <ChartIcon size={15} />, title: 'Server console', copy: 'RCON health, app-driven joins and retention per arena.' },
  { icon: <MegaphoneIcon size={15} />, title: 'Promotion', copy: 'Featured arena placements and sponsored rivalry events.' },
  { icon: <TargetIcon size={15} />, title: 'Ad platform', copy: 'Self-serve campaigns targeted by game, region and rank.' },
  { icon: <KeyIcon size={15} />, title: 'Developer API', copy: 'Keys, webhooks and the match-resolution API.' },
];

export function BusinessGate({ onAuthenticated, onExit }: BusinessGateProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [plan, setPlan] = useState<BusinessPlan>('growth');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const result =
      mode === 'signin'
        ? signIn(email, password)
        : createBusinessAccount({ email, password, name, company, plan });
    if (result.ok) {
      onAuthenticated(result.account);
      return;
    }
    setError(result.error);
  };

  const useDemo = () => {
    const result = signInDemo();
    if (result.ok) onAuthenticated(result.account);
    else setError(result.error);
  };

  return (
    <div className="gate">
      <aside className="gate-story">
        <BrandLockup subtitle="Business" large />

        <div className="gate-story-body">
          <p className="gate-kicker">Business accounts only</p>
          <h1>Run the arenas players fight in.</h1>
          <p className="gate-lede">
            The console is where server owners, advertisers and developers plug into KOBA. It
            requires a business account — player profiles cannot open it.
          </p>

          <ul className="gate-perks">
            {PERKS.map((perk) => (
              <li key={perk.title}>
                <span className="gate-perk-icon">{perk.icon}</span>
                <div>
                  <strong>{perk.title}</strong>
                  <span>{perk.copy}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <button type="button" className="btn btn-text gate-back" onClick={onExit}>
          <ChevronLeftIcon size={15} /> Back to the app
        </button>
      </aside>

      <main className="gate-panel">
        <div className="gate-card">
          <div className="gate-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={mode === 'signin' ? 'is-active' : ''}
              onClick={() => {
                setMode('signin');
                setError('');
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'is-active' : ''}
              onClick={() => {
                setMode('signup');
                setError('');
              }}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="gate-form">
            {mode === 'signup' && (
              <>
                <label className="gate-field">
                  <span>Your name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ada Whitfield"
                    autoComplete="name"
                  />
                </label>
                <label className="gate-field">
                  <span>Server network</span>
                  <input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Rustopia Network"
                    autoComplete="organization"
                  />
                </label>
              </>
            )}

            <label className="gate-field">
              <span>Work email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ops@yournetwork.gg"
                autoComplete="email"
                aria-invalid={Boolean(error) && !isValidEmail(email)}
              />
            </label>

            <label className="gate-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>

            {mode === 'signup' && (
              <div className="gate-field">
                <span>Plan</span>
                <div className="chip-grid">
                  {(Object.keys(PLAN_LABEL) as BusinessPlan[]).map((option) => (
                    <button
                      type="button"
                      key={option}
                      className={`chip-select${plan === option ? ' is-active' : ''}`}
                      onClick={() => setPlan(option)}
                      aria-pressed={plan === option}
                    >
                      {PLAN_LABEL[option]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="gate-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-gradient btn-block gate-submit">
              {mode === 'signin' ? 'Sign in to console' : 'Create business account'}
            </button>
          </form>

          <div className="gate-demo">
            <div className="gate-demo-copy">
              <strong>
                <BuildingIcon size={13} /> Demo account
              </strong>
              <span>
                {DEMO_BUSINESS.email} · {DEMO_BUSINESS.password}
              </span>
            </div>
            <button type="button" className="btn btn-outline" onClick={useDemo}>
              <CheckIcon size={13} /> Use demo
            </button>
          </div>

          <p className="gate-fine">
            Prototype accounts live in this browser only. Nothing is emailed, verified or billed.
          </p>
        </div>
      </main>
    </div>
  );
}

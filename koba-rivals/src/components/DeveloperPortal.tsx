import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Account } from '../lib/accounts';
import {
  BASE_URL,
  ENDPOINTS,
  EVENTS,
  SANDBOX_URL,
  SCOPES,
  loadDeveloper,
  logRequest,
  makeSecret,
  makeWebhookSecret,
  maskKey,
  saveDeveloper,
  snippets,
} from '../lib/developer';
import type {
  ApiKey,
  DeveloperState,
  HttpMethod,
  KeyEnv,
  Scope,
  WebhookEndpoint,
  WebhookEvent,
} from '../lib/developer';
import { SCOPE_LIMITS, callApi, openApiSpec, rateSnapshot, resetRateLimit } from '../lib/api';
import type { ApiResponse } from '../lib/api';
import { Select } from './Select';
import { CheckIcon, CodeIcon, CopyIcon, KeyIcon, PlayIcon, PlusIcon, ShieldIcon } from './ui';
import './developer.css';

type DevTab = 'overview' | 'keys' | 'usage' | 'webhooks' | 'reference' | 'playground' | 'logs';

const TABS: { id: DevTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'keys', label: 'API keys' },
  { id: 'usage', label: 'Usage' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'reference', label: 'Reference' },
  { id: 'playground', label: 'Playground' },
  { id: 'logs', label: 'Request log' },
];

function ago(timestamp: number | null): string {
  if (!timestamp) return 'never used';
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB');
}

function statusClass(status: number): string {
  return status < 400 ? 'is-active' : 'is-retrying';
}

/** Stable pseudo-random shape for a key's 14-day volume chart. */
function seriesFor(key: ApiKey): number[] {
  let seed = 7;
  for (const character of `${key.id}${key.label}`) seed = (seed * 31 + character.charCodeAt(0)) % 9973;
  return Array.from({ length: 14 }, (_, index) => {
    const value = ((seed * (index + 3)) % 67) + 22;
    return Math.min(100, value);
  });
}

interface DeveloperPortalProps {
  account: Account;
  onCopy: (text: string) => void;
  onNotify: (text: string) => void;
}

export function DeveloperPortal({ account, onCopy, onNotify }: DeveloperPortalProps) {
  const [tab, setTab] = useState<DevTab>('overview');
  const [state, setState] = useState<DeveloperState>(() => loadDeveloper());
  const [revealed, setRevealed] = useState<{ label: string; value: string } | null>(null);

  const [keyLabel, setKeyLabel] = useState('');
  const [keyEnv, setKeyEnv] = useState<KeyEnv>('live');
  const [keyScopes, setKeyScopes] = useState<Scope[]>(['matches:read']);

  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<WebhookEvent[]>(['match.resolved']);

  const [openEndpoint, setOpenEndpoint] = useState<string>(ENDPOINTS[0]?.id ?? '');
  const [lang, setLang] = useState<'curl' | 'node' | 'python'>('curl');

  const [method, setMethod] = useState<HttpMethod>('GET');
  const [routePath, setRoutePath] = useState('/matches?status=locked');
  const [bodyText, setBodyText] = useState('{\n  "match_id": "mt_4410",\n  "kills": 5\n}');
  const [keyId, setKeyId] = useState<string>(state.keys[0]?.id ?? '');
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [burst, setBurst] = useState<ApiResponse | null>(null);
  const [, setTick] = useState(0);

  // Keeps the rate-limit countdown honest while the panel stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    saveDeveloper(state);
  }, [state]);

  const languages = useMemo(() => snippets(), []);
  const activeSnippet = languages.find((entry) => entry.id === lang) ?? languages[0];

  const activeEndpoints = state.endpoints.filter((endpoint) => endpoint.active).length;
  const successRate = state.deliveries.length
    ? Math.round((state.deliveries.filter((entry) => entry.status < 400).length / state.deliveries.length) * 1000) / 10
    : 100;

  const toggleKeyScope = (scope: Scope) => {
    setKeyScopes((prev) => (prev.includes(scope) ? prev.filter((entry) => entry !== scope) : [...prev, scope]));
  };

  const toggleHookEvent = (event: WebhookEvent) => {
    setHookEvents((prev) => (prev.includes(event) ? prev.filter((entry) => entry !== event) : [...prev, event]));
  };

  const createKey = () => {
    const label = keyLabel.trim();
    if (!label) {
      onNotify('Give the key a label so you can revoke it later');
      return;
    }
    if (keyScopes.length === 0) {
      onNotify('Select at least one scope');
      return;
    }
    const secret = makeSecret(keyEnv);
    const key: ApiKey = {
      id: `k${Date.now()}`,
      label,
      env: keyEnv,
      last4: secret.slice(-4),
      createdAt: Date.now(),
      lastUsedAt: null,
      scopes: keyScopes,
      requests: 0,
    };
    setState((prev) =>
      logRequest({ ...prev, keys: [key, ...prev.keys] }, {
        method: 'POST',
        path: '/keys',
        status: 201,
        ms: 74,
        keyLabel: label,
      }),
    );
    setRevealed({ label, value: secret });
    setKeyLabel('');
    onNotify(`${label} created — copy the key now, it is shown once`);
  };

  const rotateKey = (id: string) => {
    const key = state.keys.find((entry) => entry.id === id);
    if (!key) return;
    const secret = makeSecret(key.env);
    setState((prev) =>
      logRequest(
        {
          ...prev,
          keys: prev.keys.map((entry) => (entry.id === id ? { ...entry, last4: secret.slice(-4) } : entry)),
        },
        { method: 'POST', path: `/keys/${id}/rotate`, status: 200, ms: 88, keyLabel: key.label },
      ),
    );
    setRevealed({ label: `${key.label} · rotated`, value: secret });
    onNotify('Key rotated — the previous secret stopped working');
  };

  const revokeKey = (id: string) => {
    const key = state.keys.find((entry) => entry.id === id);
    if (!key) return;
    setState((prev) =>
      logRequest(
        { ...prev, keys: prev.keys.filter((entry) => entry.id !== id) },
        { method: 'DELETE', path: `/keys/${id}`, status: 204, ms: 41, keyLabel: key.label },
      ),
    );
    onNotify(`${key.label} revoked`);
  };

  const addHook = (event: FormEvent) => {
    event.preventDefault();
    const url = hookUrl.trim();
    if (!/^https:\/\/[^\s]+$/.test(url)) {
      onNotify('Webhook endpoints must be https:// URLs');
      return;
    }
    if (hookEvents.length === 0) {
      onNotify('Subscribe to at least one event');
      return;
    }
    const endpoint: WebhookEndpoint = {
      id: `w${Date.now()}`,
      url,
      events: hookEvents,
      active: true,
      secret: makeWebhookSecret(),
      createdAt: Date.now(),
    };
    setState((prev) =>
      logRequest({ ...prev, endpoints: [endpoint, ...prev.endpoints] }, {
        method: 'POST',
        path: '/webhooks',
        status: 201,
        ms: 92,
        keyLabel: 'Developer portal',
      }),
    );
    setHookUrl('');
    onNotify('Endpoint added — failed deliveries retry up to 5 times');
  };

  const toggleHook = (id: string) => {
    const endpoint = state.endpoints.find((entry) => entry.id === id);
    if (!endpoint) return;
    setState((prev) =>
      logRequest(
        {
          ...prev,
          endpoints: prev.endpoints.map((entry) =>
            entry.id === id ? { ...entry, active: !entry.active } : entry,
          ),
        },
        { method: 'PATCH', path: `/webhooks/${id}`, status: 200, ms: 63, keyLabel: 'Developer portal' },
      ),
    );
    onNotify(`${endpoint.active ? 'Paused' : 'Resumed'} deliveries to ${endpoint.url}`);
  };

  const removeHook = (id: string) => {
    setState((prev) =>
      logRequest(
        {
          ...prev,
          endpoints: prev.endpoints.filter((entry) => entry.id !== id),
          deliveries: prev.deliveries.filter((entry) => entry.endpointId !== id),
        },
        { method: 'DELETE', path: `/webhooks/${id}`, status: 204, ms: 38, keyLabel: 'Developer portal' },
      ),
    );
    onNotify('Endpoint deleted');
  };

  const sendTest = (endpoint: WebhookEndpoint) => {
    const event = endpoint.events[0] ?? 'match.resolved';
    setState((prev) =>
      logRequest(
        {
          ...prev,
          deliveries: [
            {
              id: `d${Date.now()}`,
              endpointId: endpoint.id,
              event,
              status: 200,
              ms: 60 + Math.round(Math.random() * 70),
              at: Date.now(),
              attempt: 1,
            },
            ...prev.deliveries,
          ].slice(0, 30),
        },
        { method: 'POST', path: `/webhooks/${endpoint.id}/test`, status: 200, ms: 87, keyLabel: 'Developer portal' },
      ),
    );
    onNotify(`Test ${event} delivered · 200 OK`);
  };

  const sendRequest = () => {
    const key = state.keys.find((entry) => entry.id === keyId) ?? state.keys[0] ?? null;
    const response = callApi({ method, path: routePath, body: bodyText, key });
    setResult(response);
    setState((prev) =>
      logRequest(prev, {
        method,
        path: routePath.replace(/^https?:\/\/[^/]+/, ''),
        status: response.status,
        ms: response.ms,
        keyLabel: key?.label ?? 'no key',
      }),
    );
  };

  const downloadSpec = () => {
    const blob = new Blob([JSON.stringify(openApiSpec(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'koba-openapi.json';
    anchor.click();
    URL.revokeObjectURL(url);
    onNotify('OpenAPI 3.1 spec downloaded');
  };

  const runBurst = () => {
    const key = state.keys.find((entry) => entry.id === keyId) ?? state.keys[0];
    if (!key) return;
    let response = callApi({ method: 'GET', path: '/matches', key });
    let sent = 1;
    while (response.status !== 429 && sent < 800) {
      response = callApi({ method: 'GET', path: '/matches', key });
      sent += 1;
    }
    setBurst(response);
    setState((prev) =>
      logRequest(prev, {
        method: 'GET',
        path: '/matches',
        status: response.status,
        ms: response.ms,
        keyLabel: key.label,
      }),
    );
    onNotify(
      response.status === 429
        ? `429 after ${sent} requests — Retry-After ${String((response.body as { retry_after?: number }).retry_after ?? 60)}s`
        : `Burst of ${sent} finished without a 429`,
    );
  };

  const usageKey = state.keys.find((entry) => entry.id === keyId) ?? state.keys[0];
  const totalRequests = state.keys.reduce((total, key) => total + key.requests, 0);
  const limitedCount = state.log.filter((entry) => entry.status === 429).length;
  const headroom = usageKey
    ? Math.min(...usageKey.scopes.map((scope) => rateSnapshot(usageKey.id, scope).remaining))
    : 0;

  return (
    <>
      <header className="biz-head">
        <div>
          <h1>Developers</h1>
          <p>{account.company} · REST API, signed webhooks and sandbox keys</p>
        </div>
        <span className="pill pill-live">API v1 · stable</span>
      </header>

      <div className="dev-tabs" role="tablist" aria-label="Developer portal sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`dev-tab${tab === entry.id ? ' is-active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'keys' && state.keys.length > 0 && (
              <span className="dev-tab-count">{state.keys.length}</span>
            )}
            {entry.id === 'webhooks' && state.endpoints.length > 0 && (
              <span className="dev-tab-count">{state.endpoints.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Active keys</span>
              <strong className="metric-value">{state.keys.length}</strong>
              <span className="metric-label">
                {state.keys.filter((key) => key.env === 'live').length} live ·{' '}
                {state.keys.filter((key) => key.env === 'test').length} sandbox
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Requests logged</span>
              <strong className="metric-value">{state.log.length}</strong>
              <span className="delta">this session</span>
            </div>
            <div className="metric">
              <span className="metric-label">Delivery success</span>
              <strong className="metric-value">{successRate}%</strong>
              <span className="metric-label">last {state.deliveries.length} attempts</span>
            </div>
            <div className="metric">
              <span className="metric-label">Endpoints</span>
              <strong className="metric-value">{activeEndpoints}</strong>
              <span className="metric-label">of {state.endpoints.length} enabled</span>
            </div>
          </div>

          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Quickstart</h2>
              <div className="dev-tabs" style={{ margin: 0 }}>
                {languages.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`dev-tab${lang === entry.id ? ' is-active' : ''}`}
                    onClick={() => setLang(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="dev-code-head">
              <span className="biz-muted">
                <CodeIcon size={12} /> Fetch locked matches
              </span>
              <button type="button" className="btn btn-soft" onClick={() => onCopy(activeSnippet.code)}>
                <CopyIcon size={13} /> Copy snippet
              </button>
            </div>
            <pre className="code-block">{activeSnippet.code}</pre>
            <p className="form-note">
              Every request is scoped to {account.company} and rate limited per key. Swap the base URL
              for the sandbox to rehearse without moving points.
            </p>
          </section>

          <div className="biz-split">
            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Environments</h2>
                <span className="biz-muted">separate keys, shared schema</span>
              </div>
              <div className="dev-base">
                <span className="env-chip is-live">Live</span>
                <code>{BASE_URL}</code>
                <button type="button" className="btn btn-soft" onClick={() => onCopy(BASE_URL)}>
                  Copy
                </button>
              </div>
              <div className="dev-base">
                <span className="env-chip is-test">Sandbox</span>
                <code>{SANDBOX_URL}</code>
                <button type="button" className="btn btn-soft" onClick={() => onCopy(SANDBOX_URL)}>
                  Copy
                </button>
              </div>
              <p className="form-note">
                Sandbox requests never settle points and never fire live webhooks.
              </p>
            </section>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Recent requests</h2>
                <button type="button" className="btn btn-soft" onClick={() => setTab('logs')}>
                  Open log
                </button>
              </div>
              {state.log.slice(0, 4).map((entry) => (
                <div className="delivery" key={entry.id}>
                  <span>
                    <span className={`method-chip is-${entry.method.toLowerCase()}`}>{entry.method}</span>{' '}
                    <code>{entry.path}</code>
                  </span>
                  <span className={`status-pill ${statusClass(entry.status)}`}>{entry.status}</span>
                  <span className="biz-muted">{clock(entry.at)}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}

      {tab === 'keys' && (
        <>
          {revealed && (
            <div className="reveal-box">
              <strong>Copy this key now — it will not be shown again.</strong>
              <code>{revealed.value}</code>
              <div className="add-form-actions">
                <button type="button" className="btn btn-soft" onClick={() => onCopy(revealed.value)}>
                  <CopyIcon size={13} /> Copy key
                </button>
                <button type="button" className="btn btn-text" onClick={() => setRevealed(null)}>
                  I saved it
                </button>
              </div>
            </div>
          )}

          <section className="biz-card">
            <div className="biz-card-head">
              <h2>API keys</h2>
              <span className="biz-muted">{state.keys.length} active</span>
            </div>

            {state.keys.length === 0 ? (
              <p className="dev-empty">No keys yet. Create one below to call the API.</p>
            ) : (
              <ul className="key-list">
                {state.keys.map((key) => (
                  <li className="key-row" key={key.id}>
                    <div className="key-main">
                      <strong>
                        {key.label} <span className={`env-chip is-${key.env}`}>{key.env}</span>
                      </strong>
                      <span className="key-value">
                        <KeyIcon size={11} /> {maskKey(key)}
                      </span>
                      <div className="key-meta">
                        {key.scopes.map((scope) => (
                          <span className="scope-chip" key={scope}>
                            {scope}
                          </span>
                        ))}
                        <span className="biz-muted">
                          used {ago(key.lastUsedAt)} · {key.requests.toLocaleString('en-US')} requests
                        </span>
                      </div>
                    </div>
                    <div className="key-actions">
                      <button type="button" className="btn btn-soft" onClick={() => rotateKey(key.id)}>
                        Rotate
                      </button>
                      <button type="button" className="btn btn-soft danger" onClick={() => revokeKey(key.id)}>
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="form-grid key-create">
              <label className="form-field">
                <span>New key label</span>
                <input
                  value={keyLabel}
                  onChange={(event) => setKeyLabel(event.target.value)}
                  placeholder="Production · tournament bot"
                />
              </label>
              <div className="form-field">
                <span>Environment</span>
                <Select
                  label="Environment"
                  value={keyEnv}
                  onChange={(value) => setKeyEnv(value as KeyEnv)}
                  options={[
                    { value: 'live', label: 'Live', hint: 'Moves points and fires real webhooks' },
                    { value: 'test', label: 'Sandbox', hint: 'Rehearsals only, no side effects' },
                  ]}
                />
              </div>
              <div className="form-field">
                <span>Scopes</span>
                <div className="chip-grid">
                  {SCOPES.map((scope) => (
                    <button
                      type="button"
                      key={scope.id}
                      className={`chip-select${keyScopes.includes(scope.id) ? ' is-active' : ''}`}
                      onClick={() => toggleKeyScope(scope.id)}
                      aria-pressed={keyScopes.includes(scope.id)}
                      title={scope.copy}
                    >
                      {scope.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="add-form-actions">
              <button type="button" className="btn btn-gradient" onClick={createKey}>
                <KeyIcon size={14} /> Create key
              </button>
              <span className="biz-muted">Keys are scoped to {account.company} only.</span>
            </div>
          </section>
        </>
      )}

      {tab === 'webhooks' && (
        <>
          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Endpoints</h2>
              <span className="biz-muted">
                <ShieldIcon size={11} /> HMAC-SHA256 signed
              </span>
            </div>

            {state.endpoints.length === 0 ? (
              <p className="dev-empty">No endpoints yet. Add one below to start receiving events.</p>
            ) : (
              <ul className="key-list">
                {state.endpoints.map((endpoint) => (
                  <li className="webhook-row" key={endpoint.id}>
                    <div className="key-main">
                      <span className="webhook-url">{endpoint.url}</span>
                      <div className="event-chips">
                        {endpoint.events.map((event) => (
                          <span className="event-chip" key={event}>
                            {event}
                          </span>
                        ))}
                      </div>
                      <div className="secret-line">
                        <span className="biz-muted">Signing secret</span>
                        <span className="secret-value">{endpoint.secret}</span>
                        <button
                          type="button"
                          className="btn btn-text"
                          onClick={() => onCopy(endpoint.secret)}
                        >
                          <CopyIcon size={11} /> Copy
                        </button>
                      </div>
                    </div>
                    <div className="key-actions">
                      <button type="button" className="btn btn-soft" onClick={() => sendTest(endpoint)}>
                        <PlayIcon size={11} /> Test
                      </button>
                      <button type="button" className="btn btn-soft danger" onClick={() => removeHook(endpoint.id)}>
                        Delete
                      </button>
                      <button
                        type="button"
                        className={`switch${endpoint.active ? ' is-on' : ''}`}
                        onClick={() => toggleHook(endpoint.id)}
                        aria-pressed={endpoint.active}
                        aria-label={`${endpoint.active ? 'Pause' : 'Resume'} ${endpoint.url}`}
                      >
                        <span className="switch-knob" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form className="add-form" onSubmit={addHook}>
              <div className="form-field">
                <span>Endpoint URL</span>
                <input
                  value={hookUrl}
                  onChange={(event) => setHookUrl(event.target.value)}
                  placeholder="https://yournetwork.gg/hooks/koba"
                />
              </div>
              <div className="form-field">
                <span>Events</span>
                <div className="chip-grid">
                  {EVENTS.map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      className={`chip-select${hookEvents.includes(event.id) ? ' is-active' : ''}`}
                      onClick={() => toggleHookEvent(event.id)}
                      aria-pressed={hookEvents.includes(event.id)}
                      title={event.copy}
                    >
                      {event.id}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-outline">
                <PlusIcon size={13} /> Add endpoint
              </button>
            </form>
          </section>

          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Recent deliveries</h2>
              <span className="biz-muted">
                <CheckIcon size={11} /> 5 retries max, exponential backoff
              </span>
            </div>
            {state.deliveries.length === 0 ? (
              <p className="dev-empty">Nothing delivered yet.</p>
            ) : (
              state.deliveries.slice(0, 8).map((delivery) => (
                <div className="delivery" key={delivery.id}>
                  <span>
                    {delivery.event}{' '}
                    <span className="biz-muted">
                      {state.endpoints.find((entry) => entry.id === delivery.endpointId)?.url ?? 'removed endpoint'}
                    </span>
                  </span>
                  <span className={`status-pill ${statusClass(delivery.status)}`}>{delivery.status}</span>
                  <span className="biz-muted">
                    {delivery.ms} ms · attempt {delivery.attempt} · {clock(delivery.at)}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {tab === 'reference' && (
        <section className="biz-card">
          <div className="biz-card-head">
            <h2>API reference</h2>
            <div className="key-actions">
              <button type="button" className="btn btn-soft" onClick={downloadSpec}>
                <CodeIcon size={12} /> OpenAPI 3.1
              </button>
            </div>
          </div>
          <p className="biz-muted" style={{ marginTop: 0 }}>
            Base {BASE_URL} · sandbox keys resolve against the same schema
          </p>

          {ENDPOINTS.map((endpoint) => {
            const open = openEndpoint === endpoint.id;
            return (
              <div className={`endpoint${open ? ' is-open' : ''}`} key={endpoint.id}>
                <button
                  type="button"
                  className="endpoint-head"
                  onClick={() => setOpenEndpoint(open ? '' : endpoint.id)}
                  aria-expanded={open}
                >
                  <span className={`method-chip is-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                  <span className="endpoint-path">{endpoint.path}</span>
                  <span className="endpoint-summary">{endpoint.summary}</span>
                  <span className="endpoint-caret">▸</span>
                </button>
                {open && (
                  <div className="endpoint-body">
                    <div className="endpoint-meta">
                      <span className="scope-chip">{endpoint.scope}</span>
                      <span>Bearer token · returns JSON</span>
                    </div>
                    <pre className="code-block">{endpoint.example}</pre>
                    <div className="add-form-actions">
                      <button type="button" className="btn btn-soft" onClick={() => onCopy(endpoint.example)}>
                        <CopyIcon size={13} /> Copy example
                      </button>
                      <span className="biz-muted">Replace the key placeholder with a live secret.</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <p className="form-note">
            Errors return <code>{'{ "error": { "code": "scope_missing", "message": "…" } }'}</code> with
            a 4xx status. Resolution is idempotent per challenge id, and webhooks fire after the ledger
            write commits. Prototype only — no endpoint here is deployed.
          </p>
        </section>
      )}

      {tab === 'usage' && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Requests this window</span>
              <strong className="metric-value">{totalRequests.toLocaleString('en-US')}</strong>
              <span className="metric-label">across {state.keys.length} keys</span>
            </div>
            <div className="metric">
              <span className="metric-label">Rate-limit headroom</span>
              <strong className="metric-value">{headroom.toLocaleString('en-US')}</strong>
              <span className="metric-label">requests left on {usageKey?.label ?? 'no key'}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Busiest scope</span>
              <strong className="metric-value">matches:read</strong>
              <span className="metric-label">{SCOPE_LIMITS['matches:read']} / min ceiling</span>
            </div>
            <div className="metric">
              <span className="metric-label">429s logged</span>
              <strong className="metric-value">{limitedCount}</strong>
              <span className="metric-label">this session</span>
            </div>
          </div>

          <section className="biz-card">
            <div className="biz-card-head">
              <h2>Requests by key</h2>
              <span className="biz-muted">relative volume · last 14 days</span>
            </div>
            {state.keys.length === 0 ? (
              <p className="dev-empty">No keys to report on yet.</p>
            ) : (
              state.keys.map((key) => (
                <div className="usage-key" key={key.id}>
                  <div className="usage-key-head">
                    <strong>
                      {key.label} <span className={`env-chip is-${key.env}`}>{key.env}</span>
                    </strong>
                    <span className="biz-muted">
                      {key.requests.toLocaleString('en-US')} requests · used {ago(key.lastUsedAt)}
                    </span>
                  </div>
                  <div className="usage-spark" aria-hidden="true">
                    {seriesFor(key).map((value, index) => (
                      <span
                        key={index}
                        className={value > 78 ? 'is-high' : ''}
                        style={{ height: `${value}%` }}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          <div className="biz-split">
            <section className="biz-card">
              <div className="biz-card-head">
                <h2>Scope ceilings</h2>
                <span className="biz-muted">per key · per minute</span>
              </div>
              {usageKey ? (
                usageKey.scopes.map((scope) => {
                  const snap = rateSnapshot(usageKey.id, scope);
                  const percent = Math.min(100, (snap.used / snap.limit) * 100);
                  return (
                    <div className="limit-row" key={scope}>
                      <div className="limit-head">
                        <span>{scope}</span>
                        <span className="biz-muted">
                          {snap.used} / {snap.limit} · resets in {snap.resetInSeconds}s
                        </span>
                      </div>
                      <div className="limit-bar">
                        <div className="limit-fill" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="dev-empty">Create a key to see its ceilings.</p>
              )}
              <p className="form-note">
                Exceeding a ceiling returns 429 with a <code>Retry-After</code> header; the window is a
                sliding minute per key and scope.
              </p>
            </section>

            <section className="biz-card">
              <div className="biz-card-head">
                <h2>429 simulator</h2>
                <span className="biz-muted">real limiter, not a mock</span>
              </div>
              <p className="dev-hint">
                Fires GET /matches repeatedly on {usageKey?.label ?? 'the selected key'} until the
                limiter refuses it. Reset clears the window for every scope.
              </p>
              <div className="add-form-actions">
                <button type="button" className="btn btn-gradient" onClick={runBurst}>
                  <PlayIcon size={12} /> Send burst
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => {
                    resetRateLimit();
                    setBurst(null);
                    onNotify('Rate-limit windows cleared');
                  }}
                >
                  Reset windows
                </button>
              </div>
              {burst && (
                <div className="pg-response">
                  <div className="pg-response-head">
                    <span className={`status-pill ${statusClass(burst.status)}`}>{burst.status}</span>
                    <span className="biz-muted">{burst.ms} ms · JSON</span>
                  </div>
                  <pre className="code-block">{JSON.stringify(burst.body, null, 2)}</pre>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {tab === 'playground' && (
        <section className="biz-card">
          <div className="biz-card-head">
            <h2>Playground</h2>
            <span className="biz-muted">runs against the local API runtime</span>
          </div>

          {state.keys.length === 0 ? (
            <p className="dev-empty">Create a key first — the playground authenticates like any client.</p>
          ) : (
            <>
              <div className="form-grid">
                <div className="form-field">
                  <span>Method</span>
                  <Select
                    label="HTTP method"
                    value={method}
                    onChange={(next) => setMethod(next as HttpMethod)}
                    options={(['GET', 'POST', 'PATCH', 'DELETE'] as HttpMethod[]).map((entry) => ({
                      value: entry,
                      label: entry,
                    }))}
                  />
                </div>
                <label className="form-field">
                  <span>Path</span>
                  <input
                    value={routePath}
                    onChange={(event) => setRoutePath(event.target.value)}
                    placeholder="/matches?status=locked"
                  />
                </label>
                <div className="form-field">
                  <span>Key</span>
                  <Select
                    label="API key"
                    value={keyId}
                    onChange={setKeyId}
                    options={state.keys.map((entry) => ({
                      value: entry.id,
                      label: `${entry.label} · ${entry.env}`,
                      hint: entry.scopes.join(' · '),
                    }))}
                  />
                </div>
              </div>

              <label className="form-field">
                <span>JSON body (writes only)</span>
                <textarea
                  className="pg-body"
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  spellCheck={false}
                />
              </label>

              <div className="add-form-actions">
                <button type="button" className="btn btn-gradient" onClick={sendRequest}>
                  <PlayIcon size={12} /> Send request
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => {
                    resetRateLimit();
                    onNotify('Rate-limit window cleared');
                  }}
                >
                  Reset limits
                </button>
                <span className="biz-muted">Scopes, validation and the 120/min limit are enforced.</span>
              </div>

              {result && (
                <div className="pg-response">
                  <div className="pg-response-head">
                    <span className={`status-pill ${statusClass(result.status)}`}>{result.status}</span>
                    <span className="biz-muted">{result.ms} ms · JSON</span>
                  </div>
                  <pre className="code-block">{JSON.stringify(result.body, null, 2)}</pre>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'logs' && (
        <section className="biz-card">
          <div className="biz-card-head">
            <h2>Request log</h2>
            <span className="biz-muted">{state.log.length} entries · newest first</span>
          </div>
          {state.log.length === 0 ? (
            <p className="dev-empty">No requests logged in this session.</p>
          ) : (
            <div className="dev-scroll">
              <table className="dev-log">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Request</th>
                    <th>Status</th>
                    <th className="num">Latency</th>
                    <th>Key</th>
                  </tr>
                </thead>
                <tbody>
                  {state.log.map((entry) => (
                    <tr key={entry.id}>
                      <td>{clock(entry.at)}</td>
                      <td>
                        <span className={`method-chip is-${entry.method.toLowerCase()}`}>{entry.method}</span>{' '}
                        <code>{entry.path}</code>
                      </td>
                      <td>
                        <span className={`status-pill ${statusClass(entry.status)}`}>{entry.status}</span>
                      </td>
                      <td className="num">{entry.ms} ms</td>
                      <td>{entry.keyLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="form-note">
            The log is local to this browser and covers portal actions in this prototype; a deployed
            portal would stream server-side request history per key.
          </p>
        </section>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Check, Copy, KeyRound, Loader2, Play, Search, ShieldCheck, Terminal, Webhook, Zap } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  API_BASE,
  API_ENDPOINTS,
  API_GROUPS,
  API_VERSION,
  SANDBOX_GAMES,
  sandboxScenarios,
  type SandboxPlatform,
  SCOPES,
  WEBHOOK_EVENTS,
  defaultValues,
  endpointById,
  endpointsByGroup,
  type ApiEndpoint,
} from "./api-reference";
import { buildSnippets, requestHeaders, requestUrl } from "./snippets";

const START_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "auth", label: "Authentication" },
  { id: "sandbox", label: "Sandbox" },
] as const;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function DeveloperDocs() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { endpoint?: string };
  const requested = typeof search.endpoint === "string" ? search.endpoint : "overview";
  const endpoint = endpointById(requested);
  // The URL is the source of truth, so every endpoint has a shareable link and
  // the back button works. An unknown value (stale link, hand-edited query)
  // falls back to the overview rather than an empty page.
  const known = endpoint !== undefined || START_VIEWS.some((item) => item.id === requested);
  const view = known ? requested : "overview";

  const open = (next: string) => {
    void navigate({
      to: "/developers",
      search: (current) => ({ ...(current as Record<string, unknown>), endpoint: next === "overview" ? undefined : next }),
      resetScroll: false,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <PortalHeader />
      <div className="mx-auto w-full max-w-[96rem] flex-1 px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 pr-1">
              <Rail view={view} onOpen={open} />
            </div>
          </aside>
          <main className="min-w-0 py-6 lg:py-10">
            <MobileNav view={view} onOpen={open} />
            {view === "overview" || !known ? <Overview onOpen={open} /> : null}
            {view === "auth" ? <Authentication /> : null}
            {view === "sandbox" ? <Sandbox /> : null}
            {endpoint ? <EndpointDoc key={endpoint.id} endpoint={endpoint} onOpen={open} /> : null}
          </main>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

/* ---------------------------------------------------------------- shell ---- */

function PortalHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[96rem] items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link to="/" aria-label="KOBA home" className="flex shrink-0 items-center">
          <img src="/brand/koba-wordmark-tight.png" alt="KOBA" width={132} height={28} className="h-6 w-auto object-contain sm:h-7" />
        </Link>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
        <p className="hidden text-xs font-semibold tracking-[0.16em] text-muted uppercase sm:block">Developers</p>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
            API v1 operational
          </span>
          <Link to="/login" className="flex h-9 items-center rounded-full bg-fg px-3 text-xs font-semibold text-bg sm:px-3.5">
            <span className="sm:hidden">Key</span>
            <span className="hidden sm:inline">Get a key</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function Rail({ view, onOpen }: { view: string; onOpen: (next: string) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  return (
    <nav aria-label="Reference" className="grid gap-6">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-bg-elevated px-3">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter endpoints"
          aria-label="Filter endpoints"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </label>

      <div className="grid gap-1">
        <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Start</p>
        {START_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onOpen(item.id)}
            className={`flex min-h-9 items-center rounded-lg px-2 text-left text-sm transition-colors ${
              view === item.id ? "bg-fg font-medium text-bg" : "text-muted hover:bg-bg-subtle hover:text-fg"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {API_GROUPS.map((group) => {
        const rows = endpointsByGroup(group.id).filter(
          (endpoint) => !needle || `${endpoint.path} ${endpoint.title} ${endpoint.scope}`.toLowerCase().includes(needle),
        );
        if (rows.length === 0) return null;
        return (
          <div key={group.id} className="grid gap-1">
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">{group.label}</p>
            {rows.map((endpoint) => {
              const active = view === endpoint.id;
              return (
                <button
                  key={endpoint.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpen(endpoint.id)}
                  title={`${endpoint.method} ${endpoint.path}`}
                  className={`flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-colors ${
                    active ? "bg-fg text-bg" : "text-muted hover:bg-bg-subtle hover:text-fg"
                  }`}
                >
                  <span className={`w-8 shrink-0 font-mono text-[10px] tracking-wide ${active ? "text-bg/70" : "text-faint"}`}>
                    {endpoint.method}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs">{endpoint.path.replace("/v1", "")}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      {needle && API_ENDPOINTS.every((endpoint) => !`${endpoint.path} ${endpoint.title}`.toLowerCase().includes(needle)) ? (
        <p className="px-2 text-xs text-muted">No endpoint matches “{query.trim()}”.</p>
      ) : null}
    </nav>
  );
}

function MobileNav({ view, onOpen }: { view: string; onOpen: (next: string) => void }) {
  return (
    <div className="mb-6 grid gap-3 lg:hidden">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-noswipe>
        {START_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => onOpen(item.id)}
            className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold ${
              view === item.id ? "bg-fg text-bg" : "border border-border text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <select
        aria-label="Jump to an endpoint"
        value={endpointById(view) ? view : ""}
        onChange={(event) => onOpen(event.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-bg-elevated px-3 text-sm"
      >
        <option value="" disabled>
          Jump to an endpoint…
        </option>
        {API_GROUPS.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {endpointsByGroup(group.id).map((endpoint) => (
              <option key={endpoint.id} value={endpoint.id}>
                {endpoint.method} {endpoint.path}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------- overview ---- */

function Overview({ onOpen }: { onOpen: (next: string) => void }) {
  return (
    <div className="grid gap-10">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-bg-elevated">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(120% 80% at 80% 0%, #000 0%, transparent 72%)",
          }}
        />
        <img
          src="/brand/koba-mark-tight.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-6 -bottom-10 h-52 w-52 object-contain opacity-[0.07] sm:h-72 sm:w-72"
        />
        <div className="relative p-6 sm:p-10">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">KOBA developer platform</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Build on the gaming graph.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Identity, leaderboards, match results, and normalized events for every title KOBA tracks. The same API the
            platform runs on, documented to the field.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpen("players-get")}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg"
            >
              Read the reference
              <ArrowRight size={15} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onOpen("sandbox")}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-fg hover:bg-bg-subtle"
            >
              <Play size={14} aria-hidden />
              Open the sandbox
            </button>
          </div>
          <p className="mt-4 font-mono text-[11px] text-faint">
            v1 · {API_VERSION} · REST / JSON · mock playground, no key required
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Base URL", value: API_BASE.replace("https://", ""), note: "Every path below is relative to it." },
          { label: "Auth", value: "Bearer key", note: "Server-side only. Never in a browser bundle." },
          { label: "Rate limit", value: "6 / 10 s", note: "Per token, per endpoint class. Excess is dropped." },
          { label: "Webhooks", value: "HMAC-SHA256", note: "Signed body, timestamped, five retries." },
        ].map((fact) => (
          <div key={fact.label} className="rounded-2xl border border-border bg-bg-elevated p-4">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">{fact.label}</p>
            <p className="mt-1.5 truncate font-mono text-sm">{fact.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{fact.note}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-medium">Start here</h2>
          <p className="text-xs text-muted">Three calls cover most integrations.</p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Pick a board",
              body: "Boards are the routing primitive: global, region, server, clan, season. Everything ranked hangs off one.",
              action: "List leaderboards",
              view: "leaderboards-list",
            },
            {
              n: "02",
              title: "Pull a player",
              body: "One call returns XP, hours, badges, active challenges, and the points to the next tier.",
              action: "Retrieve a player",
              view: "players-get",
            },
            {
              n: "03",
              title: "Receive events",
              body: "Send one normalized event, then let webhooks run your Discord bot, dashboard, or tournament site.",
              action: "Send a test delivery",
              view: "webhooks-test",
            },
          ].map((step) => (
            <li key={step.n} className="grid content-start gap-2 bg-bg-elevated p-5">
              <p className="font-mono text-[11px] text-faint">{step.n}</p>
              <h3 className="text-base font-medium">{step.title}</h3>
              <p className="text-sm leading-6 text-muted">{step.body}</p>
              <button
                type="button"
                onClick={() => onOpen(step.view)}
                className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-fg hover:gap-2.5"
              >
                {step.action}
                <ArrowRight size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-medium">Coverage</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {API_GROUPS.map((group) => {
            const rows = endpointsByGroup(group.id);
            const first = rows[0];
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => first && onOpen(first.id)}
                className="card-lift grid content-start gap-2 rounded-2xl border border-border bg-bg-elevated p-4 text-left hover:border-fg/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{group.label}</h3>
                  <span className="font-mono text-[11px] text-faint">{rows.length} endpoints</span>
                </div>
                <p className="text-xs leading-5 text-muted">{group.blurb}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-faint">{first?.path}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-border bg-bg-elevated p-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center">
        <div>
          <h2 className="text-base font-medium">The playground is simulated</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            Every “Send request” returns a documented mock - the same envelope you will get in production, never a real
            player’s record. Point it at a live key when you are ready to ship.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen("auth")}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-medium hover:bg-bg-subtle"
        >
          <KeyRound size={15} aria-hidden />
          Authentication
        </button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ auth ---- */

function Authentication() {
  const headerExample = `Authorization: Bearer koba_live_8f2c9a41d7be0356
X-KOBA-Version: ${API_VERSION}`;
  return (
    <div className="grid max-w-4xl gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Authentication</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Two doors. A scoped API key for server-to-server calls, and Sign in with KOBA when a player is involved. Both
          are monochrome to you: one header, one token, one scope list.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid content-start gap-2 rounded-2xl border border-border bg-bg-elevated p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound size={15} aria-hidden />
            API keys
          </h2>
          <p className="text-sm leading-6 text-muted">
            Server-to-server. Send the key as a bearer token; it carries exactly the scopes you ticked at creation.
            Rotate from the console without downtime: the old key keeps working for 24 hours.
          </p>
          <ul className="mt-1 grid gap-1 text-xs text-faint">
            <li className="font-mono">koba_test_… · sandbox, no production rows</li>
            <li className="font-mono">koba_live_… · verified business accounts only</li>
          </ul>
        </section>
        <section className="grid content-start gap-2 rounded-2xl border border-border bg-bg-elevated p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck size={15} aria-hidden />
            Sign in with KOBA
          </h2>
          <p className="text-sm leading-6 text-muted">
            OAuth 2.0 authorization code with PKCE. The player approves{" "}
            <span className="font-mono text-fg">identify</span>; you receive their name and handle. Never a password,
            never an email, never a payment method.
          </p>
          <div className="mt-1 grid gap-1 font-mono text-[11px] text-faint">
            <span>GET /oauth/authorize?scope=identify</span>
            <span>POST /oauth/token</span>
            <span>GET /oauth/userinfo</span>
          </div>
        </section>
      </div>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Send the header</h2>
        <CodeBlock code={headerExample} label="HTTP" />
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-medium">Scopes</h2>
          <p className="text-xs text-muted">Ask for the narrowest set that ships your feature.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-subtle text-[10px] tracking-[0.14em] text-faint uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">Scope</th>
                <th className="px-3 py-2 font-semibold">Grants</th>
              </tr>
            </thead>
            <tbody>
              {SCOPES.map((row) => (
                <tr key={row.scope} className="border-t border-border">
                  <td className="px-3 py-2 align-top font-mono text-xs whitespace-nowrap">{row.scope}</td>
                  <td className="px-3 py-2 text-muted">{row.grants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-bg-elevated p-5">
          <h2 className="text-sm font-medium">Rate limits</h2>
          <ul className="mt-2 grid gap-1.5 text-sm text-muted">
            <li className="flex justify-between gap-3">
              <span>Reads</span>
              <span className="font-mono text-xs">120 / min</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Event ingest</span>
              <span className="font-mono text-xs">6 / 10 s</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Webhook tests</span>
              <span className="font-mono text-xs">30 / hour</span>
            </li>
          </ul>
          <p className="mt-3 text-xs leading-5 text-faint">
            Every response carries X-KOBA-RateLimit-Remaining. A 429 includes retry_after in seconds.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-bg-elevated p-5">
          <h2 className="text-sm font-medium">Handle keys like passwords</h2>
          <ul className="mt-2 grid gap-2 text-sm text-muted">
            <li>Keep keys server-side. A key in a bundle is a public key.</li>
            <li>Verify webhook signatures before trusting the body.</li>
            <li>Check the timestamp, not just the hash, or a replay looks fresh.</li>
            <li>Issue one key per service so a leak revokes one thing.</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Webhook events</h2>
        <div className="flex flex-wrap gap-1.5">
          {WEBHOOK_EVENTS.map((event) => (
            <code key={event} className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted">
              {event}
            </code>
          ))}
        </div>
        <p className="text-xs text-faint">
          Subscribe on the console. There is no polling endpoint for these: KOBA posts, you acknowledge with a 2xx.
        </p>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- sandbox ---- */

interface Delivery {
  id: string;
  event: string;
  status: number;
  attempt: number;
  at: string;
}

function Sandbox() {
  const [gameId, setGameId] = useState(SANDBOX_GAMES[0]!.id);
  const game = SANDBOX_GAMES.find((item) => item.id === gameId) ?? SANDBOX_GAMES[0]!;
  const [platform, setPlatform] = useState<SandboxPlatform>(game.platforms[0]!);
  // Every scenario, board id, and payload follows the title and platform you
  // pick here - no game is baked into the docs.
  const scenarios = useMemo(() => sandboxScenarios(game, platform), [game, platform]);
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id);
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]!;
  const chooseGame = (next: string) => {
    const picked = SANDBOX_GAMES.find((item) => item.id === next) ?? SANDBOX_GAMES[0]!;
    setGameId(picked.id);
    if (!picked.platforms.includes(platform)) setPlatform(picked.platforms[0]!);
  };
  const [done, setDone] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Delivery[]>([]);
  const cancelled = useRef(true);

  useEffect(() => {
    cancelled.current = true;
    setDone([]);
    setActive(null);
    setRunning(false);
    setLog([]);
  }, [scenarioId, gameId, platform]);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const run = async () => {
    cancelled.current = false;
    setRunning(true);
    setDone([]);
    setLog([]);
    setActive(null);
    for (const step of scenario.steps) {
      if (cancelled.current) return;
      setActive(step.id);
      await wait(step.ms);
      if (cancelled.current) return;
      setActive(null);
      setDone((current) => [...current, step.id]);
      if (step.event) {
        setLog((current) => [
          {
            id: `${step.id}-${current.length}`,
            event: step.event!,
            status: 200,
            attempt: 1,
            at: new Date().toLocaleTimeString("en-GB", { hour12: false }),
          },
          ...current,
        ]);
      }
    }
    if (!cancelled.current) setRunning(false);
  };

  const finished = done.length === scenario.steps.length;

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sandbox</h1>
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted uppercase">
            simulated
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Run a scenario end to end without touching a real player, a real board, or real money. Pick any title and
          platform - the board id, score rules, and payload follow it - then each step shows the event that fires and
          what your endpoint receives.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <div className="mb-2 grid gap-2 rounded-xl border border-border bg-bg-elevated p-3">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Simulate</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid min-w-0 gap-1">
                <span className="text-[10px] tracking-[0.14em] text-faint uppercase">Game</span>
                <select
                  aria-label="Sandbox game"
                  value={game.id}
                  onChange={(event) => chooseGame(event.target.value)}
                  className="h-9 w-full min-w-0 rounded-lg border border-border bg-bg px-1.5 text-xs"
                >
                  {SANDBOX_GAMES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-[10px] tracking-[0.14em] text-faint uppercase">Platform</span>
                <select
                  aria-label="Sandbox platform"
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as SandboxPlatform)}
                  className="h-9 w-full min-w-0 rounded-lg border border-border bg-bg px-1.5 text-xs"
                >
                  {game.platforms.map((item) => (
                    <option key={item} value={item}>
                      {item === "PC" ? "PC" : "Console"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Scenarios</p>
          {scenarios.map((item) => {
            const activeScenario = item.id === scenarioId;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={activeScenario}
                onClick={() => setScenarioId(item.id)}
                className={`grid gap-1 rounded-xl border p-3 text-left transition-colors ${
                  activeScenario ? "border-fg bg-bg-elevated" : "border-border hover:border-fg/40"
                }`}
              >
                <span className="text-sm font-medium">{item.title}</span>
                <span className="font-mono text-[11px] text-faint">{item.trigger}</span>
              </button>
            );
          })}
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-2xl border border-border bg-bg-elevated p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-medium">{scenario.title}</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{scenario.summary}</p>
              </div>
              <button
                type="button"
                disabled={running}
                onClick={() => void run()}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-fg px-4 text-xs font-semibold text-bg disabled:opacity-50"
              >
                {running ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
                {running ? "Running" : finished ? "Run again" : "Run scenario"}
              </button>
            </div>

            <ol className="mt-4 grid gap-2">
              {scenario.steps.map((step, index) => {
                const complete = done.includes(step.id);
                const live = active === step.id;
                return (
                  <li key={step.id} className="rounded-xl border border-border bg-bg p-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-mono ${
                          complete ? "border-fg bg-fg text-bg" : live ? "border-fg text-fg" : "border-border text-faint"
                        }`}
                        aria-hidden
                      >
                        {complete ? <Check size={11} /> : live ? <Loader2 size={11} className="animate-spin" /> : index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm ${complete || live ? "text-fg" : "text-muted"}`}>{step.label}</p>
                        <p className="mt-0.5 text-xs leading-5 text-faint">{step.detail}</p>
                        {step.event ? (
                          <p className="mt-1 font-mono text-[11px] text-muted">{step.event}</p>
                        ) : null}
                        {step.payload && complete ? (
                          <details className="mt-2 rounded-lg border border-border bg-bg-elevated px-2 py-1.5">
                            <summary className="cursor-pointer text-[11px] text-muted">Webhook payload</summary>
                            <JsonView value={step.payload} className="mt-2 max-h-64" />
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-2xl border border-border bg-bg-elevated p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Webhook size={14} aria-hidden />
                Delivery log
              </h2>
              <span className="font-mono text-[11px] text-faint">{log.length} sent</span>
            </div>
            {log.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing delivered yet. Run the scenario to see signed deliveries.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {log.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 font-mono text-[11px]">
                    <span className="text-faint">{entry.at}</span>
                    <span className="min-w-0 flex-1 truncate">{entry.event}</span>
                    <span className="text-muted">attempt {entry.attempt}</span>
                    <span className="text-ok">{entry.status} OK</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs leading-5 text-faint">
              A real delivery signs the raw body with your endpoint secret and retries five times before parking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- endpoint ---- */

function EndpointDoc({ endpoint, onOpen }: { endpoint: ApiEndpoint; onOpen: (next: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => defaultValues(endpoint));
  const [bodyText, setBodyText] = useState(() => (endpoint.body ? JSON.stringify(endpoint.body, null, 2) : ""));
  const url = useMemo(() => requestUrl(endpoint, values), [endpoint, values]);
  const headers = useMemo(() => requestHeaders(endpoint, values), [endpoint, values]);
  const snippets = useMemo(() => buildSnippets(endpoint, values, bodyText), [endpoint, values, bodyText]);
  const group = API_GROUPS.find((item) => item.id === endpoint.group);

  return (
    <div className="grid min-w-0 gap-8">
      <header className="grid gap-3">
        <button
          type="button"
          onClick={() => onOpen("overview")}
          className="flex w-fit items-center gap-1 text-[11px] font-semibold tracking-[0.16em] text-faint uppercase hover:text-fg"
        >
          {group?.label ?? "Reference"}
          <span aria-hidden>/</span>
          <span className="text-muted">{endpoint.title}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2.5">
          <MethodChip method={endpoint.method} />
          <EndpointPath path={endpoint.path} />
          <CopyButton text={url} label="Copy request URL" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{endpoint.title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">{endpoint.summary}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-border px-2 py-1 font-mono text-muted">{endpoint.scope}</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted">Mock responses</span>
          <span className="rounded-full border border-border px-2 py-1 text-muted">JSON</span>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
        <div className="grid min-w-0 gap-8">
          <section className="grid gap-3">
            <h2 className="text-sm font-medium">Parameters</h2>
            {endpoint.params.length === 0 ? (
              <p className="rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-muted">
                No request parameters. The body is the whole call.
              </p>
            ) : (
              <div className="grid gap-2">
                {endpoint.params.map((param) => (
                  <label
                    key={param.name}
                    className="grid gap-2 rounded-xl border border-border bg-bg-elevated p-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-fg">{param.name}</span>
                        <span className="text-[10px] tracking-[0.14em] text-faint uppercase">{param.in}</span>
                        {param.required ? <span className="text-[10px] tracking-[0.14em] text-fg uppercase">required</span> : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">{param.detail}</span>
                    </span>
                    <input
                      value={values[param.name] ?? ""}
                      onChange={(event) => setValues((current) => ({ ...current, [param.name]: event.target.value }))}
                      placeholder={param.example || "optional"}
                      aria-label={`${param.name} value`}
                      spellCheck={false}
                      className="h-10 w-full min-w-0 rounded-lg border border-border bg-bg px-2.5 font-mono text-xs outline-none focus:border-fg"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          {endpoint.body ? (
            <section className="grid gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-sm font-medium">Request body</h2>
                <span className="font-mono text-[11px] text-faint">application/json</span>
              </div>
              <textarea
                value={bodyText}
                onChange={(event) => setBodyText(event.target.value)}
                spellCheck={false}
                aria-label="Request body"
                className="min-h-56 w-full min-w-0 rounded-xl border border-border bg-bg-elevated p-3 font-mono text-xs leading-5 outline-none focus:border-fg"
              />
            </section>
          ) : null}

          <section className="grid gap-2">
            <h2 className="text-sm font-medium">Response fields</h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-bg-elevated">
              {endpoint.fields.map((field) => (
                <li key={field.name} className="grid gap-1 px-3 py-2 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-3">
                  <span className="font-mono text-xs break-all text-fg">{field.name}</span>
                  <span className="text-xs leading-5 text-muted">
                    <span className="mr-1.5 font-mono text-[10px] text-faint">{field.type}</span>
                    {field.detail}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-2 rounded-xl border border-border bg-bg-elevated p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Zap size={14} aria-hidden />
              Notes
            </h2>
            <ul className="grid gap-1.5 text-xs leading-5 text-muted">
              {endpoint.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span className="text-faint" aria-hidden>
                    ·
                  </span>
                  {note}
                </li>
              ))}
            </ul>
          </section>

          {/* The snippets live in the doc column beside the playground, not
              full width below it - a full-width block would slide under the
              request panel on shorter screens. */}
          <section className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-sm font-medium">Code</h2>
              <p className="text-xs text-muted">Reads the key from your environment, never from this page.</p>
            </div>
            <SnippetTabs snippets={snippets} />
          </section>
        </div>

        <Playground
          endpoint={endpoint}
          values={values}
          url={url}
          headers={headers}
          bodyText={bodyText}
          snippets={snippets}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ playground ---- */

type SimMode = "success" | "missing-key" | "scope" | "not-found" | "invalid-body" | "rate-limit";

interface PlaygroundResult {
  code: number;
  label: string;
  ms: number;
  body: unknown;
  requestId: string;
}

function Playground({
  endpoint,
  values,
  url,
  headers,
  bodyText,
  snippets,
}: {
  endpoint: ApiEndpoint;
  values: Record<string, string>;
  url: string;
  headers: { name: string; value: string }[];
  bodyText: string;
  snippets: ReturnType<typeof buildSnippets>;
}) {
  const [mode, setMode] = useState<SimMode>("success");
  const [token, setToken] = useState("koba_test_pk_3f9c2a71d4");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const send = async () => {
    cancelled.current = false;
    setBusy(true);
    setResult(null);
    const started = Date.now();
    await wait(mode === "rate-limit" ? 90 : 180 + Math.round(Math.random() * 240));
    if (cancelled.current) return;

    const requestId = `req_${Math.random().toString(16).slice(2, 10)}`;
    const fail = (code: number, label: string, body: unknown) => {
      setResult({ code, label, ms: Date.now() - started, body, requestId });
      setBusy(false);
    };

    let bodyError = false;
    if (endpoint.body) {
      try {
        JSON.parse(bodyText);
      } catch {
        bodyError = true;
      }
    }

    if (mode === "missing-key" || !token.trim()) {
      fail(401, "Unauthorized", {
        error: "unauthorized",
        message: "No API key was sent. Send Authorization: Bearer <key>.",
        request_id: requestId,
      });
      return;
    }
    if (mode === "scope") {
      fail(403, "Forbidden", {
        error: "insufficient_scope",
        message: `This key is missing ${endpoint.scope}.`,
        scope_required: endpoint.scope,
        request_id: requestId,
      });
      return;
    }
    if (mode === "invalid-body" || bodyError) {
      fail(400, "Bad Request", {
        error: "invalid_request",
        message: "Request body is not valid JSON.",
        request_id: requestId,
      });
      return;
    }
    if (mode === "rate-limit") {
      fail(429, "Too Many Requests", {
        error: "rate_limited",
        message: "6 requests per 10 seconds per token.",
        retry_after: 4,
        request_id: requestId,
      });
      return;
    }
    if (mode === "not-found") {
      fail(404, "Not Found", {
        error: "not_found",
        message: "No record matches that id.",
        request_id: requestId,
      });
      return;
    }
    setResult({ code: 200, label: "OK", ms: Date.now() - started, body: endpoint.sample(values), requestId });
    setBusy(false);
  };

  const success = result ? result.code >= 200 && result.code < 300 : false;

  return (
    <div className="grid gap-3 self-start rounded-2xl border border-border bg-bg-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Terminal size={14} aria-hidden />
          Playground
        </h2>
        <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-faint uppercase">
          mock
        </span>
      </div>

      <div className="rounded-xl border border-border bg-bg p-3">
        <p className="font-mono text-[11px] break-all text-muted">
          <span className="text-fg">{endpoint.method}</span> {url}
        </p>
        <p className="mt-1.5 font-mono text-[10px] break-all text-faint">authorization: Bearer ••••{token.slice(-4) || "----"}</p>
        {headers.map((header) => (
          <p key={header.name} className="font-mono text-[10px] break-all text-faint">
            {header.name.toLowerCase()}: {header.value}
          </p>
        ))}
        {endpoint.body ? <p className="font-mono text-[10px] text-faint">content-type: application/json</p> : null}
      </div>

      <label className="grid gap-1">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">API key</span>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          spellCheck={false}
          placeholder="koba_test_…"
          className="h-10 w-full rounded-lg border border-border bg-bg px-2.5 font-mono text-xs outline-none focus:border-fg"
        />
      </label>

      <label className="grid gap-1">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">Simulate</span>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as SimMode)}
          className="h-10 w-full rounded-lg border border-border bg-bg px-2 text-xs"
        >
          <option value="success">200 · success</option>
          <option value="missing-key">401 · missing key</option>
          <option value="scope">403 · missing scope</option>
          <option value="not-found">404 · unknown record</option>
          <option value="invalid-body">400 · invalid body</option>
          <option value="rate-limit">429 · rate limited</option>
        </select>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-fg text-xs font-semibold text-bg disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={12} aria-hidden />}
          {busy ? "Sending" : "Send request"}
        </button>
        <CopyButton text={url} label="Copy request URL" />
      </div>

      {result ? (
        <div className="grid gap-2">
          <div
            className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
              success ? "border-fg/60" : "border-border"
            }`}
          >
            <span className="font-semibold text-fg">
              {result.code} {result.label}
            </span>
            <span className="text-faint">{result.ms} ms</span>
            <span className="ml-auto text-faint">{result.requestId}</span>
          </div>
          <JsonView value={result.body} className="max-h-80" />
          <details className="rounded-lg border border-border bg-bg px-2.5 py-1.5">
            <summary className="cursor-pointer font-mono text-[11px] text-muted">Response headers</summary>
            <div className="mt-1.5 grid gap-0.5 font-mono text-[10px] text-faint">
              <span>content-type: application/json; charset=utf-8</span>
              <span>x-koba-version: {API_VERSION}</span>
              <span>x-koba-request-id: {result.requestId}</span>
              <span>x-koba-ratelimit-remaining: {result.code === 429 ? 0 : 118}</span>
            </div>
          </details>
        </div>
      ) : (
        <p className="text-xs leading-5 text-faint">
          Responses are generated from the reference, not a live account. Paste a real key to switch this panel to
          production.
        </p>
      )}

      <SnippetTabs snippets={snippets} compact />
    </div>
  );
}

function SnippetTabs({ snippets, compact = false }: { snippets: ReturnType<typeof buildSnippets>; compact?: boolean }) {
  const [tab, setTab] = useState<string>(snippets[0]?.id ?? "curl");
  const active = snippets.find((snippet) => snippet.id === tab) ?? snippets[0];

  return (
    <div className={`grid gap-2 ${compact ? "mt-1" : ""}`}>
      <div className="flex flex-wrap items-center gap-1">
        {snippets.map((snippet) => (
          <button
            key={snippet.id}
            type="button"
            aria-pressed={tab === snippet.id}
            onClick={() => setTab(snippet.id)}
            className={`h-8 rounded-full px-2.5 text-[11px] font-medium ${
              tab === snippet.id ? "bg-fg text-bg" : "border border-border text-muted hover:text-fg"
            }`}
          >
            {snippet.label}
          </button>
        ))}
        {active ? <CopyButton text={active.code} label="Copy snippet" className="ml-auto" /> : null}
      </div>
      {active ? (
        <pre
          className={`overflow-auto rounded-xl border border-border bg-bg p-3 font-mono leading-5 ${
            compact ? "max-h-56 text-[10.5px]" : "text-xs"
          }`}
        >
          <code>{active.code}</code>
        </pre>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ bits ---- */

function MethodChip({ method }: { method: ApiEndpoint["method"] }) {
  return (
    <span
      className={`rounded-md px-2 py-1 font-mono text-[11px] font-semibold tracking-wide ${
        method === "GET" ? "border border-fg/70 text-fg" : "bg-fg text-bg"
      }`}
    >
      {method}
    </span>
  );
}

function EndpointPath({ path }: { path: string }) {
  const parts = path.split(/(\{[a-z_]+\})/g);
  return (
    <code className="min-w-0 font-mono text-sm break-all sm:text-base">
      {parts.map((part, index) =>
        part.startsWith("{") ? (
          <span key={`${part}-${index}`} className="text-muted">
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </code>
  );
}

function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-fg ${className}`}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
    </button>
  );
}

type JsonTokenKind = "plain" | "key" | "string" | "number" | "literal";

function tokenizeJson(text: string): { text: string; kind: JsonTokenKind }[] {
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|\b(true|false|null)\b/g;
  const tokens: { text: string; kind: JsonTokenKind }[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    if (match.index > cursor) tokens.push({ text: text.slice(cursor, match.index), kind: "plain" });
    if (match[1]) {
      tokens.push({ text: match[1], kind: match[2] ? "key" : "string" });
      if (match[2]) tokens.push({ text: match[2], kind: "plain" });
    } else if (match[3]) {
      tokens.push({ text: match[3], kind: "number" });
    } else if (match[4]) {
      tokens.push({ text: match[4], kind: "literal" });
    }
    cursor = pattern.lastIndex;
    match = pattern.exec(text);
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor), kind: "plain" });
  return tokens;
}

const TOKEN_CLASS: Record<JsonTokenKind, string> = {
  plain: "text-muted",
  key: "text-fg",
  string: "text-ok",
  number: "text-fg",
  literal: "text-violet",
};

function JsonView({ value, className = "" }: { value: unknown; className?: string }) {
  const tokens = useMemo(() => tokenizeJson(JSON.stringify(value, null, 2) ?? "null"), [value]);
  const copyText = useMemo(() => JSON.stringify(value, null, 2) ?? "null", [value]);

  return (
    <div className={`relative min-w-0 overflow-hidden rounded-xl border border-border bg-bg ${className}`}>
      <div className="absolute top-1.5 right-1.5 z-10">
        <CopyButton text={copyText} label="Copy JSON" className="bg-bg/80" />
      </div>
      {/* The height cap lives on the wrapper (`max-h-80` etc). The pre must
          inherit it and own the scroll, otherwise its content spills out of
          the border and paints over the rows below. */}
      <pre className="max-h-[inherit] overflow-auto p-3 pr-10 font-mono text-[11px] leading-5 whitespace-pre">
        <code>
          {tokens.map((token, index) => (
            <span key={index} className={TOKEN_CLASS[token.kind]}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="rounded-xl border border-border bg-bg-elevated">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-wide text-faint uppercase">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-fg"
        >
          {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}

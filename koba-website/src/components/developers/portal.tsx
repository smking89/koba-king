import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui";
import { readAccount, type KobaAccount } from "@/components/network/auth-screen";
import { accountFor } from "@/site/astro";
import { GAME_TYPES, MATCH_EVENT, SAMPLE_EVENT, WIPE_EVENT, type Gate } from "@/site/ingest";
import { CORE, EDGE_NODES } from "@/site/regions";
import { useSite } from "@/site/ui";

type Panel = "home" | "oauth" | "apis" | "docs" | "keys" | "admin";

const PANELS: { id: Panel; label: string; desktop?: boolean }[] = [
  { id: "home", label: "Overview" },
  { id: "oauth", label: "Sign in" },
  { id: "docs", label: "Events" },
  { id: "keys", label: "Keys" },
  { id: "apis", label: "APIs" },
  { id: "admin", label: "Admin", desktop: true },
];

const API_CATALOG = [
  { id: "identity", name: "Identity", owner: "KOBA", note: "Sign in with KOBA. Name and handle. Never the password." },
  { id: "games", name: "Games", owner: "KOBA", note: "The adapter owns the title. The core does not." },
  { id: "servers", name: "Servers", owner: "KOBA", note: "Register a host. Population and events stay on that server id." },
  { id: "events", name: "Events", owner: "KOBA", note: "Normalized combat, wipe, and match events." },
  { id: "webhooks", name: "Webhooks", owner: "KOBA", note: "KOBA posts the event. You do not poll." },
  { id: "leaderboards", name: "Leaderboards", owner: "KOBA", note: "Scoped by the route: global, region, server, clan, or season." },
];

const SAMPLE = JSON.stringify(SAMPLE_EVENT, null, 2);
const FORGED = SAMPLE.replace("AK47_RIFLE", "<script>alert(1)</script>");

const FIELDS = [
  ["route.game", "The title, not the platform. RUST stays RUST on both PC and console."],
  ["route.platform", "PC or CONSOLE. Boards do not mix."],
  ["route.region", "NA, EU, OC, AS, SA, or RU. The site filter is finer: NA East, NA West, EU, OCE."],
  ["route.leaderboard_scope", "GLOBAL, REGION, SERVER, CLAN, or SEASON."],
  ["integration_metadata.koba_server_id", "Your KOBA server key. srv_ then lowercase."],
  ["integration_metadata.game_type", "RUST, RUST_CONSOLE, DAYZ, ARK, SEVEN_DAYS, LOL, VALORANT, APEX, or CS2."],
  ["integration_metadata.payload_timestamp_utc", "Unix seconds. The sample clock is accepted."],
  ["event_envelope.event_type", "COMBAT_KILL, OBJECTIVE, SESSION_JOIN, MATCH_END, or WIPE."],
  ["event_envelope.cryptographic_signature", "0x and at least 16 hex characters."],
  ["data_payload.metrics", "Game numbers only. The core scores the event type, not the scrap count."],
];

interface Audit {
  jti: string;
  exp: number;
  issuedAt: number;
  rotated: boolean;
  requests: number;
  dropped: number;
  live: boolean;
}

interface Series {
  ingress: number[];
  failures: number[];
  forgery: number[];
  bandwidth: number[];
}

async function post<T>(path: string, kobaId: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-koba-id": kobaId },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function DeveloperPortal() {
  const opened = useSite((state) => state.opened);
  const [account, setAccount] = useState<KobaAccount | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setAccount(readAccount());
    setReady(true);
  }, []);
  if (!ready) return <div className="min-h-dvh bg-black" />;
  if (!account) {
    return (
      <Locked
        title="Sign in first"
        body="The developer portal is closed until you are signed in."
      />
    );
  }
  const standing = accountFor(account.viewerId, opened);
  if (!standing.business) {
    return (
      <Locked
        title="Business account required"
        body="The developer portal is for business accounts. Open one on KOBA, then come back."
      />
    );
  }
  return <PortalDesk account={account} />;
}

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <header className="flex items-center gap-4 border-b border-[#2a2a2a] px-4 py-3">
        <Link to="/" aria-label="KOBA home">
          <img src="/brand/koba-wordmark.png" alt="" width={1096} height={500} className="h-10 w-auto object-contain" />
        </Link>
      </header>
      <main className="mx-auto grid w-full max-w-lg flex-1 content-center gap-3 px-4">
        <h1 className="text-2xl">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        <Link to="/" className="h-11 text-sm">
          Back to KOBA
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function PortalDesk({ account }: { account: KobaAccount }) {
  const [panel, setPanel] = useState<Panel>("home");
  const [kobaId, setKobaId] = useState(account.viewerId);
  const [secret, setSecret] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({ identity: true, games: true, servers: true, events: true, webhooks: true, leaderboards: true });
  const [extra, setExtra] = useState<{ id: string; name: string; owner: string; note: string }[]>([]);
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const catalog = [...API_CATALOG, ...extra];
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-[#050505] lg:min-h-dvh lg:border-r lg:border-b-0">
        <Link to="/" aria-label="KOBA home" className="flex items-center gap-3 px-4 pt-4 lg:pt-5">
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
            <rect width="34" height="34" rx="9" fill="#ffffff" />
            <path d="M9.2 8.4h4.4l3.6 6.4 3.6-6.4h4.4l-5.8 8.6 6 8.6h-4.5l-3.7-6.2-3.7 6.2H8.9l6.1-8.6-5.8-8.6Z" fill="#fff" />
          </svg>
          <span>
            <span className="block text-lg font-bold tracking-[0.14em]">KOBA</span>
            <span className="block text-xs text-muted">Developer Portal</span>
          </span>
        </Link>
        <nav aria-label="Portal" className="flex gap-1 overflow-x-auto px-3 py-3 lg:mt-4 lg:grid lg:overflow-visible">
          {PANELS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={panel === item.id}
              onClick={() => setPanel(item.id)}
              className={`${item.desktop ? "hidden lg:inline" : ""} h-11 rounded-xl px-3 text-left text-sm lg:w-full ${panel === item.id ? "bg-accent text-black" : "text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
      <header className="flex items-center gap-4 border-b border-border px-4 py-3">
        <p className="text-sm text-muted">Build integrations. Extend the ecosystem.</p>
        <Link to="/apps" className="ml-auto text-sm text-violet">
          App store
        </Link>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-28">
          {panel === "home" ? <Home onSignIn={() => setPanel("oauth")} onEvents={() => setPanel("docs")} /> : null}
        {panel === "oauth" ? <SignInWithKoba account={account} /> : null}
        {panel === "apis" ? (
          <Apis
            catalog={catalog.filter((item) => shown[item.id] !== false)}
            subscribed={subscribed}
            onSubscribe={async (id) => {
              const minted = await post<{ token: string }>("/api/v1/developers/tokens", kobaId, { action: "issue" });
              setSecret(minted.token);
              setSubscribed((current) => (current.includes(id) ? current : [...current, id]));
            }}
          />
        ) : null}
        {panel === "docs" ? (
          <div className="grid gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl">Send one event</h1>
                <p className="mt-1 max-w-xl text-sm text-muted">The route is the board. The metrics are the game. KOBA Power Rating adds a weight for the event type inside that route. It does not store a rule per title.</p>
              </div>
              <a href="/sdk/koba-event.schema.json" download className="text-sm">
                Event schema
              </a>
            </div>
            <Payload />
            <Sandbox kobaId={kobaId} secret={secret} />
          </div>
        ) : null}
        {panel === "keys" ? <Tokens kobaId={kobaId} onId={setKobaId} onIssued={setSecret} /> : null}
        {panel === "admin" ? (
          <>
            <p className="text-sm text-muted lg:hidden">The admin panel is a computer screen.</p>
            <div className="hidden lg:grid lg:gap-4">
              <Admin catalog={catalog} shown={shown} onToggle={(id) => setShown((current) => ({ ...current, [id]: current[id] === false }))} onAdd={(name) => setExtra((current) => [...current, { id: `gen_${current.length}`, name, owner: "Generic", note: "Uploaded spec. Not subscribable until displayed." }])} />
              <Status />
            </div>
          </>
        ) : null}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function Home({ onSignIn, onEvents }: { onSignIn: () => void; onEvents: () => void }) {
  const steps = [
    {
      n: "01",
      title: "Let players sign in",
      body: "They already have a KOBA account. You get a name and a handle. Never the password.",
      action: "Set up sign-in",
      onClick: onSignIn,
    },
    {
      n: "02",
      title: "Send one event",
      body: "Map the match onto the KOBA envelope. The sandbox shows which gate failed.",
      action: "Open the sandbox",
      onClick: onEvents,
    },
    {
      n: "03",
      title: "Ship the plugin",
      body: "Rust, DayZ, ARK, and 7 Days to Die. The plugin posts the event. It does not run inside KOBAbot.",
      action: "Download the plugin",
      href: "/sdk/koba-dedicated.cs",
    },
  ];
  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-bg-elevated p-6">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 280" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <linearGradient id="portal-sky" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#050505" />
              <stop offset="0.5" stopColor="#262626" />
              <stop offset="1" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>
          <rect width="1200" height="280" fill="url(#portal-sky)" />
          <rect x="640" y="48" width="150" height="90" rx="6" fill="#1a1a1a" />
          <rect x="810" y="36" width="180" height="110" rx="6" fill="#333333" />
          <rect x="700" y="150" width="220" height="70" rx="6" fill="#222222" />
          <circle cx="980" cy="70" r="40" fill="#fafafa" opacity="0.2" />
        </svg>
        <div className="relative max-w-xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-violet uppercase">KOBA</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Developer Portal</h1>
          <p className="mt-2 text-sm text-muted">Build integrations. Extend the ecosystem. Connect a game, server, or service to KOBA.</p>
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="text-sm">Where it runs</h2>
        <p className="max-w-xl text-sm text-muted">{CORE.place}. {CORE.holds} Live telemetry stays on the edge and syncs back in batches.</p>
        <ul>
          {EDGE_NODES.map((node) => (
            <li key={node.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm">
              <span>{node.label}</span>
              <span className="text-muted">{node.place}</span>
            </li>
          ))}
        </ul>
      </section>
      <ol className="grid gap-px bg-[#2a2a2a] lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step.n} className="grid content-start gap-3 bg-black p-4">
            <p className="font-mono text-xs text-faint">{step.n}</p>
            <h2 className="text-xl">{step.title}</h2>
            <p className="text-sm text-muted">{step.body}</p>
            {"href" in step && step.href ? (
              <a href={step.href} download className="mt-auto inline-flex h-11 items-center text-sm font-medium">
                {step.action}
              </a>
            ) : (
              <button type="button" onClick={step.onClick} className="mt-auto h-11 text-left text-sm font-medium">
                {step.action}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SignInWithKoba({ account }: { account: KobaAccount }) {
  const [name, setName] = useState("");
  const [redirect, setRedirect] = useState("");
  const [error, setError] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string; redirect: string; secret: string }[]>([]);
  const [picked, setPicked] = useState(0);
  const [consent, setConsent] = useState(false);
  const [issued, setIssued] = useState("");
  const client = clients[picked];

  const register = () => {
    const title = name.trim();
    if (title.length < 2) {
      setError("Name the application.");
      return;
    }
    let url: URL;
    try {
      url = new URL(redirect);
    } catch {
      setError("Redirect must be a full URL.");
      return;
    }
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      setError("Use https, or localhost for development.");
      return;
    }
    const next = {
      id: `koba_${crypto.randomUUID().slice(0, 8)}`,
      name: title,
      redirect: url.toString(),
      secret: `sec_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
    };
    setClients((current) => [next, ...current]);
    setPicked(0);
    setIssued("");
    setError("");
    setName("");
  };

  const allow = () => {
    if (!client) return;
    const code = `kcode_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    setConsent(false);
    setIssued(
      JSON.stringify(
        {
          redirect: `${client.redirect}${client.redirect.includes("?") ? "&" : "?"}code=${code}`,
          token: {
            access_token: `kat_${crypto.randomUUID().replaceAll("-", "")}`,
            token_type: "Bearer",
            expires_in: 3600,
            scope: "identify",
          },
          user: { id: account.viewerId, name: account.name, handle: account.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 16) },
        },
        null,
        2,
      ),
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Sign in with KOBA</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">Authorization code grant. Your app sends the player to KOBA, they approve identify, and you exchange the code for a bearer token.</p>
        </div>
        <ol className="grid gap-2 text-sm">
          {[
            ["1", "GET /oauth/authorize", "client_id, redirect_uri, response_type=code, scope=identify"],
            ["2", "Player approves", "KOBA returns the browser to your redirect_uri with ?code="],
            ["3", "POST /oauth/token", "client_id, client_secret, code, grant_type=authorization_code"],
            ["4", "GET /oauth/userinfo", "Authorization: Bearer access_token"],
          ].map(([step, title, detail]) => (
            <li key={step} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border border-border p-3">
              <span className="text-muted">{step}</span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="text-muted">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
        {client ? (
          <div className="grid gap-2 border border-border p-4 text-sm">
            <p className="font-medium">{client.name}</p>
            <p className="break-all font-mono text-xs text-muted">client_id {client.id}</p>
            <p className="break-all font-mono text-xs text-muted">client_secret {client.secret}</p>
            <p className="break-all font-mono text-xs text-muted">redirect_uri {client.redirect}</p>
            <button type="button" onClick={() => setConsent(true)} className="mt-2 flex h-11 items-center justify-center gap-2 bg-accent text-sm font-medium text-black">
              <img src="/brand/koba-mark-tight.png" alt="" width={320} height={437} className="h-5 w-5 object-contain" />
              Continue with KOBA
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Register an application to try the consent screen.</p>
        )}
        {issued ? <pre className="overflow-x-auto border border-border p-4 font-mono text-xs leading-5 text-muted">{issued}</pre> : null}
        {consent && client ? (
          <div className="grid gap-3 border border-white p-4">
            <p className="text-sm font-medium">{client.name} wants to use your KOBA account</p>
            <p className="text-sm text-muted">Scope: identify. KOBA shares your name and handle. Not your password.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConsent(false)} className="h-11 flex-1 border border-border text-sm">
                Deny
              </button>
              <button type="button" onClick={allow} className="h-11 flex-1 bg-accent text-sm font-medium text-black">
                Allow
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <form
        className="grid content-start gap-3 border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          register();
        }}
      >
        <h2 className="text-sm font-medium">Register an application</h2>
        <label className="grid gap-1 text-sm">
          Application name
          <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 border border-border bg-black px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Redirect URI
          <input value={redirect} onChange={(event) => setRedirect(event.target.value)} className="h-11 border border-border bg-black px-3" />
        </label>
        {error ? <p className="text-sm text-white">{error}</p> : null}
        <button type="submit" className="h-11 bg-accent text-sm font-medium text-black">
          Create client
        </button>
        {clients.length > 1 ? (
          <ul className="grid gap-1">
            {clients.map((item, index) => (
              <li key={item.id}>
                <button type="button" onClick={() => { setPicked(index); setIssued(""); }} className={`h-10 w-full rounded-lg px-2 text-left text-sm ${index === picked ? "bg-accent text-black" : "text-muted"}`}>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </div>
  );
}

function Apis({
  catalog,
  subscribed,
  onSubscribe,
}: {
  catalog: { id: string; name: string; owner: string; note: string }[];
  subscribed: string[];
  onSubscribe: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  return (
    <ul className="divide-y divide-border border-y border-border">
      {catalog.map((api) => (
        <li key={api.id} className="flex items-center gap-3 py-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center border border-border text-xs">{api.name.slice(0, 2)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{api.name}</span>
            <span className="block truncate text-xs text-muted">{api.owner}</span>
            <span className="hidden text-xs text-faint lg:block">{api.note}</span>
          </span>
          <button
            type="button"
            disabled={busy === api.id || subscribed.includes(api.id)}
            onClick={() => {
              setBusy(api.id);
              void onSubscribe(api.id).finally(() => setBusy(""));
            }}
            className="min-h-8 border border-fg px-3 text-xs disabled:opacity-40"
          >
            {subscribed.includes(api.id) ? "Subscribed" : "Subscribe"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Admin({
  catalog,
  shown,
  onToggle,
  onAdd,
}: {
  catalog: { id: string; name: string; owner: string }[];
  shown: Record<string, boolean>;
  onToggle: (id: string) => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="grid gap-4">
      <table className="w-full border border-border text-left text-sm">
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-normal">API</th>
            <th className="px-3 py-2 font-normal">Owner</th>
            <th className="px-3 py-2 font-normal">Displayed</th>
          </tr>
        </thead>
        <tbody>
          {catalog.map((api) => (
            <tr key={api.id} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2">{api.name}</td>
              <td className="px-3 py-2 text-muted">{api.owner}</td>
              <td className="px-3 py-2">
                <button type="button" onClick={() => onToggle(api.id)} className={`min-h-8 px-2 text-xs ${shown[api.id] === false ? "text-muted" : "bg-fg text-bg"}`}>
                  {shown[api.id] === false ? "Hidden" : "Shown"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length < 3) return;
          onAdd(name.trim());
          setName("");
        }}
      >
        <label className="grid gap-1 text-sm">
          Generic API
          <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 border border-border bg-bg px-3" />
        </label>
        <Button variant="primary" type="submit">
          Add API
        </Button>
      </form>
    </div>
  );
}

function Payload() {
  const examples = [
    ["Combat", SAMPLE_EVENT],
    ["Wipe", WIPE_EVENT],
    ["Match", MATCH_EVENT],
  ] as const;
  const [picked, setPicked] = useState(0);
  const body = JSON.stringify(examples[picked][1], null, 2);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="flex gap-1">
          {examples.map(([label], index) => (
            <button key={label} type="button" aria-pressed={picked === index} onClick={() => setPicked(index)} className="tab-plain">
              {label}
            </button>
          ))}
        </div>
        <pre className="overflow-x-auto border border-border p-4 font-mono text-xs leading-5 text-muted">{body}</pre>
      </div>
      <ul className="grid content-start gap-2">
        {FIELDS.map(([name, detail]) => (
          <li key={name} className="rounded-2xl border border-border bg-bg-elevated px-3 py-2">
            <p className="font-mono text-xs text-fg">{name}</p>
            <p className="text-sm text-muted">{detail}</p>
          </li>
        ))}
        <li className="rounded-2xl border border-border px-3 py-2 text-sm text-muted">Accepted game types: {GAME_TYPES.join(", ")}.</li>
      </ul>
    </div>
  );
}

function Sandbox({ kobaId, secret }: { kobaId: string; secret: string }) {
  const [raw, setRaw] = useState(SAMPLE);
  const [token, setToken] = useState(secret);
  const [gates, setGates] = useState<Gate[]>([]);
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (secret) setToken(secret);
  }, [secret]);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ ok: boolean; gates: Gate[] }>("/api/v1/developers/ingest", kobaId, { raw, token });
      setGates(result.gates);
      setOk(result.ok);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Integration token
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Issue one on the Tokens tab" className="h-11 rounded-xl border border-border bg-bg px-3 font-mono text-xs" />
        </label>
        <label className="grid gap-1 text-sm">
          Payload
          <textarea value={raw} onChange={(event) => setRaw(event.target.value)} spellCheck={false} className="min-h-72 w-full min-w-0 rounded-2xl border border-border bg-bg p-3 font-mono text-xs" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Checking…" : "Test ingest"}
          </Button>
          <Button variant="ghost" onClick={() => setRaw(FORGED)}>
            Load a forged sample
          </Button>
        </div>
        <p className="text-sm text-muted">Every string is cleaned in an isolated layer. Markup, nulls, and template markers fail the forgery gate and are not written. A token past 6 calls in 10 seconds is dropped. Verification checks the HMAC only. It does not open a session.</p>
      </div>
      <div className="grid content-start gap-2">
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        {ok !== null ? <p className={`text-sm ${ok ? "text-ok" : "text-danger"}`}>{ok ? "Accepted. The normalized event can be stored." : "Rejected. Nothing was written."}</p> : <p className="text-sm text-muted">Run a payload to see each gate.</p>}
        {gates.map((gate) => (
          <p key={gate.id} className="rounded-2xl border border-border bg-bg-elevated px-3 py-2 text-sm">
            <span className={gate.pass ? "text-ok" : "text-danger"}>{gate.pass ? "Pass" : "Fail"}</span>
            <span className="mx-2 text-fg">{gate.name}.</span>
            <span className="text-muted">{gate.detail}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function Tokens({ kobaId, onId, onIssued }: { kobaId: string; onId: (id: string) => void; onIssued: (token: string) => void }) {
  const [rows, setRows] = useState<Audit[]>([]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (id = kobaId) => {
    const data = await post<{ tokens: Audit[] }>("/api/v1/developers/tokens", id);
    setRows(data.tokens);
  };

  useEffect(() => {
    let cancel = false;
    post<{ tokens: Audit[] }>("/api/v1/developers/tokens", kobaId)
      .then((data) => {
        if (!cancel) setRows(data.tokens);
      })
      .catch(() => {
        if (!cancel) setRows([]);
      });
    return () => {
      cancel = true;
    };
  }, [kobaId]);

  const act = async (body: { action: "issue" | "rotate"; jti?: string }) => {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ token: string }>("/api/v1/developers/tokens", kobaId, body);
      setSecret(result.token);
      onIssued(result.token);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Token request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          KOBAid
          <input value={kobaId} onChange={(event) => onId(event.target.value)} className="h-11 rounded-xl border border-border bg-bg px-3 font-mono text-sm" />
        </label>
        <Button variant="primary" disabled={busy} onClick={() => void act({ action: "issue" })}>
          Generate token
        </Button>
      </div>
      <p className="text-sm text-muted">Tokens live 15 minutes. The secret is shown once. Rotation retires the old id immediately. The gateway still checks the signature without loading an account session.</p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {secret ? <pre className="overflow-x-auto rounded-2xl border border-border bg-bg-elevated p-3 font-mono text-xs">{secret}</pre> : null}
      <ul className="grid gap-2">
        {rows.length === 0 ? <li className="text-sm text-muted">No tokens for this KOBAid.</li> : null}
        {rows.map((row) => (
          <li key={row.jti} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-bg-elevated px-3 py-2 text-sm">
            <div>
              <p className="font-mono text-xs">{row.jti}</p>
              <p className="text-muted">{row.live ? "Live" : row.rotated ? "Rotated" : "Expired"} · {row.requests} accepted · {row.dropped} dropped</p>
            </div>
            {row.live ? (
              <Button variant="ghost" disabled={busy} onClick={() => void act({ action: "rotate", jti: row.jti })}>
                Rotate
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Status() {
  const [series, setSeries] = useState<Series | null>(null);
  useEffect(() => {
    let cancel = false;
    fetch("/api/v1/developers/status")
      .then((response) => response.json())
      .then((data: Series) => {
        if (!cancel) setSeries(data);
      })
      .catch(() => {
        if (!cancel) setSeries(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Chart label="Ingress" points={series?.ingress ?? []} />
        <Chart label="Validation failures" points={series?.failures ?? []} />
        <Chart label="Forgery drops" points={series?.forgery ?? []} />
        <Chart label="Bandwidth" points={series?.bandwidth ?? []} />
      </div>
      <ul className="grid gap-2">
        {[
          ["Dedicated plugin 1.4.0", "Operational", "Rust, DayZ, ARK, 7 Days to Die"],
          ["VALORANT webhook 1.2.0", "Operational", "Kill feed to COMBAT_KILL"],
          ["League hook 1.2.0", "Operational", "Champion kills and match end"],
          ["Apex and CS2 1.1.0", "Operational", "Same envelope, own game_type"],
        ].map(([name, state, note]) => (
          <li key={name} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-bg-elevated px-3 py-2 text-sm">
            <span>{name}</span>
            <span className="text-ok">{state}</span>
            <span className="w-full text-muted sm:w-auto">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chart({ label, points }: { label: string; points: number[] }) {
  const width = 280;
  const height = 72;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${index * step},${height - 8 - (point / max) * (height - 16)}`).join(" ");
  return (
    <figure className="rounded-3xl border border-border bg-bg-elevated p-3">
      <figcaption className="text-sm text-muted">{label}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-20 w-full text-ok" role="img" aria-label={label}>
        <path d={line || "M0 60"} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </figure>
  );
}

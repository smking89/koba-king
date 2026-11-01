import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui";
import {
  dollars,
  GAME_LABEL,
  SEATS,
  TYPE_LABEL,
  type AppDraft,
  type AppListing,
  type AppType,
  type Billing,
  type GameId,
  type PublicApp,
  type Purchase,
  type Rarity,
  type StoreUser,
} from "@/site/app-store";

type Tab = "browse" | "purchases" | "develop" | "licensing";

const TABS: { id: Tab; to: "/apps" | "/apps/purchases" | "/apps/develop" | "/apps/licensing"; label: string }[] = [
  { id: "browse", to: "/apps", label: "Browse Apps" },
  { id: "purchases", to: "/apps/purchases", label: "My Purchases" },
  { id: "develop", to: "/apps/develop", label: "Submit listing" },
  { id: "licensing", to: "/apps/licensing", label: "Licensing" },
];

const TYPES: AppType[] = ["BOT", "PLUGIN", "ADAPTER"];
const GAMES: GameId[] = ["RUST", "DAYZ", "ARK", "MINECRAFT"];
const RARITIES: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "RELIC"];

interface Owned extends Purchase {
  app: PublicApp;
}

async function call<T>(path: string, kobaId: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-koba-id": kobaId },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function AppStore({ tab }: { tab: Tab }) {
  const [kobaId, setKobaId] = useState(SEATS[0]?.kobaId ?? "");
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<StoreUser | null>(SEATS[0] ?? null);
  const [apps, setApps] = useState<PublicApp[]>([]);
  const [owned, setOwned] = useState<Owned[]>([]);
  const [queue, setQueue] = useState<AppListing[]>([]);
  const [type, setType] = useState<AppType | "">("");
  const [game, setGame] = useState<GameId | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [shelf, setShelf] = useState<"featured" | "categories" | "charts" | "search">("featured");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("koba-store-seat");
    if (stored && SEATS.some((seat) => seat.kobaId === stored)) setKobaId(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !kobaId) return;
    let cancel = false;
    window.sessionStorage.setItem("koba-store-seat", kobaId);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (game) params.set("game", game);
    Promise.all([
      call<{ apps: PublicApp[] }>(`/api/v1/apps/browse?${params.toString()}`, kobaId),
      call<{ user: StoreUser; purchases: Owned[]; queue: AppListing[] }>("/api/v1/apps/mine", kobaId),
    ])
      .then(([catalog, mine]) => {
        if (cancel) return;
        setApps(catalog.apps);
        setUser(mine.user);
        setOwned(mine.purchases);
        setQueue(mine.queue);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "The store did not answer.");
      });
    return () => {
      cancel = true;
    };
  }, [ready, kobaId, type, game, busy]);

  const run = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    setError("");
    try {
      await call(path, kobaId, body);
      setNotice(done);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4">
          <Link to="/" aria-label="KOBA home">
            <img src="/brand/koba-wordmark.png" alt="" width={1096} height={500} className="h-10 w-auto object-contain" />
          </Link>
          <p className="hidden text-sm sm:block">Store</p>
          <nav aria-label="App store" className="ml-auto hidden lg:flex">
            {TABS.map((item) => (
              <Link key={item.id} to={item.to} aria-current={tab === item.id ? "page" : undefined} className={`tab-plain ${tab === item.id ? "is-on" : ""}`}>
                {item.label}
              </Link>
            ))}
          </nav>
          {SEATS.length > 0 ? (
            <label className="ml-auto text-sm text-muted lg:ml-0">
              <span className="sr-only">Account</span>
              <select value={kobaId} onChange={(event) => setKobaId(event.target.value)} className="h-10 bg-transparent text-sm text-white outline-none">
                {SEATS.map((seat) => (
                  <option key={seat.kobaId} value={seat.kobaId}>
                    {seat.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="ml-auto text-sm text-muted lg:ml-0">No account connected</p>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28">
        {error ? <p className="mb-3 text-sm text-danger" role="alert">{error}</p> : null}
        {notice ? <p className="mb-3 text-sm">{notice}</p> : null}
        {tab === "browse" ? (
          <Browse
            apps={apps}
            owned={owned}
            shelf={shelf}
            query={query}
            picked={picked}
            type={type}
            game={game}
            busy={busy}
            onQuery={setQuery}
            onPick={setPicked}
            onType={setType}
            onGame={setGame}
            onBuy={(app) => run("/api/v1/apps/purchase", { appId: app.id }, `Licensed ${app.name}. Fee ${app.feeLabel}.`)}
          />
        ) : null}
        {tab === "purchases" ? <Purchases owned={owned} /> : null}
        {tab === "develop" ? (
          <>
            <p className="text-sm text-muted lg:hidden">Submitting a listing is a computer screen.</p>
            <div className="hidden lg:block">
              {user ? (
                <Develop
                  user={user}
                  queue={queue}
                  busy={busy}
                  onSubmit={(draft) => run("/api/v1/apps/submit", draft, `${draft.name} is pending staff review.`)}
                  onReview={(appId, decision) => run("/api/v1/apps/review", { appId, decision }, decision === "APPROVED" ? "Listing approved." : "Listing rejected.")}
                />
              ) : (
                <p className="text-sm text-muted">Sign in with a KOBA account to submit a listing.</p>
              )}
            </div>
          </>
        ) : null}
        {tab === "licensing" ? (
          <>
            <p className="text-sm text-muted lg:hidden">Download links are issued on a computer.</p>
            <div className="hidden lg:block">
              <Licensing kobaId={kobaId} owned={owned} />
            </div>
          </>
        ) : null}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg xl:hidden" aria-label="Catalog">
        {(
          [
            ["featured", "Featured"],
            ["categories", "Categories"],
            ["charts", "Charts"],
            ["search", "Search"],
          ] as const
        ).map(([id, label]) => (
          <Link key={id} to="/apps" onClick={() => setShelf(id)} className={`flex min-h-14 items-center justify-center text-xs ${tab === "browse" && shelf === id ? "text-fg" : "text-muted"}`}>
            {label}
          </Link>
        ))}
        <Link to="/apps/purchases" className={`flex min-h-14 items-center justify-center text-xs ${tab === "purchases" ? "text-fg" : "text-muted"}`}>
          Library
        </Link>
      </nav>
      <SiteFooter />
    </div>
  );
}

function scoreOf(app: PublicApp) {
  const tier: Record<PublicApp["rarityTier"], number> = { COMMON: 3.8, UNCOMMON: 4.1, RARE: 4.4, EPIC: 4.6, LEGENDARY: 4.8, RELIC: 4.9 };
  return tier[app.rarityTier];
}

const PITCH: Record<string, [string, string, string]> = {
  app_wipe: ["Know the wipe before the server does.", "The bot posts the clock where the squad already talks.", "One license. It stays on this KOBAid."],
  app_corpse: ["Find the body before it despawns.", "The plugin drops a pin on the DayZ host.", "Buy once. Install it on the machine you already run."],
  app_nest: ["See the nest without tabbing out.", "The adapter watches ARK and updates the board.", "Monthly. Cancel it from the library."],
  app_claim: ["Stop arguing about who claimed the plot.", "The bot writes the claim where the server reads it.", "One payment. Minecraft only."],
  app_relic: ["The relic shows up before the raid does.", "A Rust plugin watches the spawn and pings you.", "Monthly. The license checks KOBA, not the bot."],
};

function framesFor(app: PublicApp): [string, string, string] {
  return (
    PITCH[app.id] ?? [
      `${app.name} on ${GAME_LABEL[app.game]}.`,
      `${TYPE_LABEL[app.type]}. It does not run inside KOBAbot.`,
      app.billingModel === "SUBSCRIPTION" ? "Billed every month. Stop it from the library." : "One payment. The license stays on this KOBAid.",
    ]
  );
}

function Mark({ name }: { name: string }) {
  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#111] text-xl font-medium" aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

function PriceButton({ owned, busy, price, billing, onBuy }: { owned: boolean; busy: boolean; price: string; billing: string; onBuy: () => void }) {
  return (
    <button type="button" disabled={busy || owned} onClick={onBuy} className="h-9 min-w-20 bg-white px-3 text-sm font-medium text-black disabled:bg-transparent disabled:text-white">
      {owned ? "In library" : billing === "SUBSCRIPTION" ? `${price}/mo` : price}
    </button>
  );
}

function StoreFrames({ app }: { app: PublicApp }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {framesFor(app).map((line, index) => (
        <figure key={line} className="grid min-h-48 content-between bg-[#111] p-4">
          <p className="font-mono text-xs text-faint">0{index + 1}</p>
          <figcaption className="text-xl font-medium leading-snug">{line}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Browse({
  apps,
  owned,
  shelf,
  query,
  picked,
  type,
  game,
  busy,
  onQuery,
  onPick,
  onType,
  onGame,
  onBuy,
}: {
  apps: PublicApp[];
  owned: Owned[];
  shelf: "featured" | "categories" | "charts" | "search";
  query: string;
  picked: string | null;
  type: AppType | "";
  game: GameId | "";
  busy: boolean;
  onQuery: (query: string) => void;
  onPick: (id: string | null) => void;
  onType: (type: AppType | "") => void;
  onGame: (game: GameId | "") => void;
  onBuy: (app: PublicApp) => void;
}) {
  const ownedIds = new Set(owned.filter((item) => item.isActive).map((item) => item.appId));
  const needle = query.trim().toLowerCase();
  let rows = apps.filter((app) => (shelf === "search" && needle ? `${app.name} ${app.developerName} ${GAME_LABEL[app.game]}`.toLowerCase().includes(needle) : true));
  if (shelf === "charts") rows = rows.slice().sort((a, b) => scoreOf(b) - scoreOf(a) || a.name.localeCompare(b.name));
  const open = apps.find((app) => app.id === picked) ?? null;
  const lead = rows[0];
  const list = open || shelf !== "featured" || !lead ? rows : rows.filter((app) => app.id !== lead.id);
  return (
    <div className="grid gap-8">
      {shelf === "search" ? (
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search apps, developers, games" aria-label="Search the app store" className="h-12 w-full border-b border-border bg-transparent text-lg outline-none placeholder:text-faint" />
      ) : null}
      {shelf === "categories" ? (
        <div className="flex gap-1 overflow-x-auto" data-noswipe>
          <button type="button" aria-pressed={type === ""} onClick={() => onType("")} className="tab-plain">
            All
          </button>
          {TYPES.map((item) => (
            <button key={item} type="button" aria-pressed={type === item} onClick={() => onType(item)} className="tab-plain">
              {TYPE_LABEL[item]}
            </button>
          ))}
          <select value={game} onChange={(event) => onGame(event.target.value as GameId | "")} aria-label="Game" className="tab-plain bg-transparent outline-none">
            <option value="">All games</option>
            {GAMES.map((item) => (
              <option key={item} value={item}>
                {GAME_LABEL[item]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {open ? (
        <Product app={open} owned={ownedIds.has(open.id)} busy={busy} onBuy={() => onBuy(open)} onClose={() => onPick(null)} />
      ) : lead && shelf === "featured" ? (
        <section className="grid gap-4">
          <StoreFrames app={lead} />
          <div className="flex items-center gap-4">
            <Mark name={lead.name} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-medium">{lead.name}</h1>
              <p className="truncate text-sm text-muted">{lead.developerName}</p>
            </div>
            <PriceButton owned={ownedIds.has(lead.id)} busy={busy} price={dollars(lead.basePrice)} billing={lead.billingModel} onBuy={() => onBuy(lead)} />
          </div>
        </section>
      ) : null}
      {shelf === "charts" ? <h2 className="text-sm text-muted">Ranked by rating, not price.</h2> : null}
      <ul>
        {list.map((app, index) => (
          <li key={app.id} className="border-b border-border">
            <div className="flex items-center gap-4 py-3">
              <button type="button" onClick={() => onPick(app.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                {shelf === "charts" ? <span className="w-6 font-mono text-sm text-muted">{index + 1}</span> : null}
                <Mark name={app.name} />
                <span className="min-w-0">
                  <span className="block truncate text-base">{app.name}</span>
                  <span className="block truncate text-sm text-muted">{app.developerName}</span>
                </span>
              </button>
              <PriceButton owned={ownedIds.has(app.id)} busy={busy} price={dollars(app.basePrice)} billing={app.billingModel} onBuy={() => onBuy(app)} />
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="text-sm text-muted">Nothing matches.</p> : null}
    </div>
  );
}

function Product({ app, owned, busy, onBuy, onClose }: { app: PublicApp; owned: boolean; busy: boolean; onBuy: () => void; onClose: () => void }) {
  return (
    <section className="grid gap-4">
      <StoreFrames app={app} />
      <div className="flex items-center gap-4">
        <Mark name={app.name} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-medium">{app.name}</h1>
          <p className="truncate text-sm text-muted">
            {app.developerName}
            {app.developerVerified ? " · Verified" : ""} · {GAME_LABEL[app.game]} · {scoreOf(app).toFixed(1)}
          </p>
        </div>
        <PriceButton owned={owned} busy={busy} price={dollars(app.basePrice)} billing={app.billingModel} onBuy={onBuy} />
      </div>
      <button type="button" onClick={onClose} className="w-fit text-sm text-muted">
        Back to the store
      </button>
    </section>
  );
}

function Purchases({ owned }: { owned: Owned[] }) {
  if (owned.length === 0) return <p className="text-sm text-muted">No licenses on this KOBAid yet. Browse the store to buy one.</p>;
  return (
    <ul className="grid gap-2">
      {owned.map((purchase) => (
        <li key={purchase.id} className="border-b border-border py-4">
          <p className="text-lg">{purchase.app.name}</p>
          <p className="mt-1 font-mono text-xs text-muted">License {purchase.licenseKey}</p>
          <p className="mt-1 text-sm text-muted">
            Paid {dollars(purchase.amountPaidTotal)}. Platform fee {dollars(purchase.platformFeeCharged)}. Developer received {dollars(purchase.developerPayout)}.
          </p>
          {purchase.subscriptionEnd ? <p className="text-sm text-muted">Renews through {new Date(purchase.subscriptionEnd).toLocaleDateString()}.</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Develop({
  user,
  queue,
  busy,
  onSubmit,
  onReview,
}: {
  user: StoreUser;
  queue: AppListing[];
  busy: boolean;
  onSubmit: (draft: AppDraft) => void;
  onReview: (appId: string, decision: "APPROVED" | "REJECTED") => void;
}) {
  const [draft, setDraft] = useState<AppDraft>({ name: "", type: "PLUGIN", game: "RUST", rarityTier: "RARE", billingModel: "BUY_NOW", basePrice: 1000 });
  const staff = user.role === "STAFF";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="grid gap-3 border-b border-border pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(draft);
        }}
      >
        <h1 className="text-2xl">Submit a listing</h1>
        <p className="text-sm text-muted">Staff approve it before anyone can buy it. Verified developers pay 2.5%. Unverified pay 3.0%. The listing does not run inside KOBAbot.</p>
        <label className="grid gap-1 text-sm">
          Name
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-11 rounded-xl border border-border bg-bg px-3" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" value={draft.type} options={TYPES} labels={TYPE_LABEL} onChange={(type) => setDraft({ ...draft, type })} />
          <Field label="Game" value={draft.game} options={GAMES} labels={GAME_LABEL} onChange={(game) => setDraft({ ...draft, game })} />
          <Field label="Rarity" value={draft.rarityTier} options={RARITIES} onChange={(rarityTier) => setDraft({ ...draft, rarityTier })} />
          <Field label="Billing" value={draft.billingModel} options={["BUY_NOW", "SUBSCRIPTION"] as Billing[]} labels={{ BUY_NOW: "Buy now", SUBSCRIPTION: "Subscription" }} onChange={(billingModel) => setDraft({ ...draft, billingModel })} />
        </div>
        <label className="grid gap-1 text-sm">
          Price in cents
          <input value={draft.basePrice} onChange={(event) => setDraft({ ...draft, basePrice: Number(event.target.value) })} inputMode="numeric" className="h-11 rounded-xl border border-border bg-bg px-3" />
        </label>
        <Button variant="primary" type="submit" disabled={busy || user.role === "PLAYER"}>
          {user.role === "PLAYER" ? "Switch to a business seat" : "Submit for review"}
        </Button>
      </form>
      <section className="grid content-start gap-2">
        <h2 className="text-lg">{staff ? "Pending review" : "Your listings"}</h2>
        {queue.length === 0 ? <p className="text-sm text-muted">{staff ? "Nothing is waiting." : "You have not submitted a listing."}</p> : null}
        {queue.map((app) => (
          <article key={app.id} className="border-b border-border py-4">
            <p className="text-lg">{app.name}</p>
            <p className="text-sm text-muted">
              {app.developerName} · {app.status.replace("_", " ")} · {dollars(app.basePrice)}
            </p>
            {staff && app.status === "PENDING_REVIEW" ? (
              <div className="mt-3 flex gap-2">
                <Button variant="primary" disabled={busy} onClick={() => onReview(app.id, "APPROVED")}>
                  Approve
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => onReview(app.id, "REJECTED")}>
                  Reject
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function Field<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels?: Record<string, string>; onChange: (value: T) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className="h-11 rounded-xl border border-border bg-bg px-2">
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Licensing({ kobaId, owned }: { kobaId: string; owned: Owned[] }) {
  const [token, setToken] = useState<{ appId: string; token: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [file, setFile] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(token.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [token]);

  if (owned.length === 0) return <p className="text-sm text-muted">Buy a listing first. A download link is only issued to a KOBAid with an active license.</p>;

  return (
    <ul className="grid gap-2">
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {owned.map((purchase) => (
        <li key={purchase.id} className="border-b border-border py-4">
          <p className="text-lg">{purchase.app.name}</p>
          <p className="font-mono text-xs text-muted">{purchase.licenseKey}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setError("");
                setFile("");
                void call<{ token: string; expiresAt: string }>("/api/v1/plugins/download", kobaId, { appId: purchase.appId })
                  .then((issued) => setToken({ appId: purchase.appId, token: issued.token, expiresAt: issued.expiresAt }))
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not issue a link"));
              }}
            >
              Generate download link
            </Button>
            {token?.appId === purchase.appId ? (
              <Button
                variant="ghost"
                disabled={left <= 0}
                onClick={() => {
                  void call<{ file: string }>("/api/v1/plugins/download", kobaId, { token: token.token })
                    .then((redeemed) => {
                      setFile(redeemed.file);
                      setToken(null);
                    })
                    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Link rejected"));
                }}
              >
                Use once · {left}s
              </Button>
            ) : null}
          </div>
          {token?.appId === purchase.appId ? <p className="mt-2 break-all font-mono text-xs text-muted">{token.token}</p> : null}
          {file && token?.appId !== purchase.appId ? null : null}
        </li>
      ))}
      {file ? <p className="text-sm">Package handed off once: {file}</p> : null}
    </ul>
  );
}

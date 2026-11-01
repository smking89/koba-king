import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui";
import { FilterSelect } from "@/components/network/filter-select";
import { GameSelect } from "@/components/network/game-select";
import type { Identity } from "@/platform/engine";
import { LFG, LISTINGS, PARTIES, wipeFor, type Region } from "@/site/catalog";
import { gameIcon } from "@/site/games";
import { PUBLIC_REGIONS, regionLabel } from "@/site/regions";
import { socialLinks } from "@/site/public-config";
import type { GameFilter, PlatformFilter } from "@/site/ui";

const REGIONS: { id: "all" | Region; label: string }[] = [
  { id: "all", label: "Global" },
  ...PUBLIC_REGIONS.map((region) => ({ id: region.id, label: region.label })),
];

const PLATFORMS: { id: PlatformFilter; label: string }[] = [
  { id: "all", label: "All platforms" },
  { id: "PC", label: "PC" },
  { id: "Console", label: "Console" },
];

const LISTING_GAME: Record<string, string> = {
  DAYZ: "dayz",
  ARK: "ark",
  MINECRAFT: "minecraft",
};

/**
 * The game menu lists one row per title. PC vs console is a separate platform
 * filter, not two entries in the menu: picking Rust returns Rust servers on
 * both platforms, and the platform menu narrows from there.
 */
function sameGame(filter: GameFilter, gameId: string) {
  if (filter === "all") return true;
  return (LISTING_GAME[filter] ?? filter.toLowerCase()) === gameId.toLowerCase();
}

/** Geometric server stack for the empty directory — drawn, not an image, so it stays crisp and monochrome. */
function ServerTower() {
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M60 16V6M52 10h16" opacity=".55" />
        <rect x="30" y="16" width="60" height="92" rx="10" opacity=".85" />
        <rect x="40" y="28" width="40" height="16" rx="4" opacity=".55" />
        <rect x="40" y="54" width="40" height="16" rx="4" opacity=".55" />
        <rect x="40" y="80" width="40" height="16" rx="4" opacity=".55" />
        <path d="M18 110h84" opacity=".35" />
        <path d="M18 116h84" opacity=".18" />
      </g>
      <g fill="currentColor">
        <circle cx="46" cy="36" r="2" opacity=".9" />
        <circle cx="46" cy="62" r="2" opacity=".9" />
        <circle cx="46" cy="88" r="2" opacity=".9" />
        <rect x="54" y="34" width="18" height="3" rx="1.5" opacity=".45" />
        <rect x="54" y="60" width="18" height="3" rx="1.5" opacity=".45" />
        <rect x="54" y="86" width="18" height="3" rx="1.5" opacity=".45" />
      </g>
    </svg>
  );
}

function ServerCardSkeleton() {
  return (
    <li className="rounded-2xl border border-border bg-bg-elevated p-3 sm:p-4" aria-hidden>
      <div className="flex items-center gap-3 motion-reduce:animate-none animate-pulse">
        <span className="h-14 w-14 shrink-0 rounded-xl bg-bg-subtle" />
        <span className="min-w-0 flex-1">
          <span className="block h-3 w-1/2 rounded bg-bg-subtle" />
          <span className="mt-2 block h-2.5 w-2/3 rounded bg-bg-subtle" />
          <span className="mt-2 block h-2.5 w-1/3 rounded bg-bg-subtle" />
        </span>
        <span className="h-9 w-16 shrink-0 rounded-full bg-bg-subtle" />
      </div>
    </li>
  );
}

function ConnectServerDialog({ onClose, onClans }: { onClose: () => void; onClans: () => void }) {
  const social = socialLinks();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Connect your server">
      <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl border border-border bg-bg-elevated p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Connect your server</h2>
            <p className="mt-1 text-sm text-muted">KOBA reads matches straight from a server-side plugin — no screenshots, no manual score entry.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close connect server" className="grid h-11 w-11 shrink-0 place-items-center text-muted hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <ol className="mt-4 grid gap-3 text-sm">
          {[
            "Install the KOBA plugin on your server.",
            "Send us the server name, game and region.",
            "We issue the ingest key and matches start landing on the board.",
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border font-mono text-xs text-muted">{index + 1}</span>
              <span className="text-muted">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="mailto:partner@koba.games?subject=Connect%20my%20KOBA%20server"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-fg px-4 text-sm font-semibold text-bg"
          >
            Email partner@koba.games
          </a>
          {social[0] ? (
            <a
              href={social[0].href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-sm"
            >
              Ask in Discord
            </a>
          ) : null}
        </div>

        <button type="button" onClick={onClans} className="mt-3 inline-flex h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-fg">
          Browse clans instead
        </button>
      </div>
    </div>
  );
}

export function DiscoverPage({
  identities,
  query,
  game,
  platform,
  region,
  saved,
  loading,
  onQuery,
  onGame,
  onPlatform,
  onRegion,
  onSave,
  onOpenPlayer,
  onClans,
}: {
  identities: Identity[];
  query: string;
  game: GameFilter;
  platform: PlatformFilter;
  region: "all" | Region;
  saved: string[];
  loading?: boolean;
  onQuery: (value: string) => void;
  onGame: (value: GameFilter) => void;
  onPlatform: (value: PlatformFilter) => void;
  onRegion: (value: "all" | Region) => void;
  onSave: (id: string) => void;
  onOpenPlayer: (id: string) => void;
  onClans: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const listings = LISTINGS.filter((listing) => {
    if (!sameGame(game, listing.gameId)) return false;
    if (platform !== "all" && listing.platform !== platform) return false;
    if (region !== "all" && listing.region !== region) return false;
    if (needle && !`${listing.name} ${listing.tags.join(" ")} ${listing.blurb}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const parties = PARTIES.filter((party) => (region === "all" || party.region === region) && sameGame(game, party.gameId)).slice(0, 3);
  const people = identities.filter(
    (identity) =>
      (region === "all" || identity.region === region) &&
      (!needle || `${identity.name} ${identity.handle}`.toLowerCase().includes(needle)),
  );
  const narrowing = Boolean(needle) || region !== "all" || game !== "all" || platform !== "all";
  const filtering = region !== "all" || game !== "all" || platform !== "all";
  const reset = () => {
    onGame("all");
    onPlatform("all");
    onRegion("all");
    onQuery("");
  };
  // Each menu applies on pick, so Reset just clears the three filters.
  const resetFilters = () => {
    onGame("all");
    onPlatform("all");
    onRegion("all");
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Discover</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">Find a server, a clan or a player.</p>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <span className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">Game</span>
            <GameSelect
              value={game}
              onChange={(id) => onGame(id as GameFilter)}
              label="Game"
              allLabel="All games"
              className="w-full"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">Platform</span>
            <FilterSelect label="Platform" value={platform} options={PLATFORMS} onChange={onPlatform} />
          </div>
          <div className="grid gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">Region</span>
            <FilterSelect label="Region" value={region} options={REGIONS} onChange={onRegion} />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={resetFilters}
            disabled={!filtering}
            className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            Reset filters
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6">
          {loading ? (
            <section aria-label="Loading servers">
              <h2 className="text-sm font-semibold">Servers</h2>
              <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3">
                <ServerCardSkeleton />
                <ServerCardSkeleton />
                <ServerCardSkeleton />
              </ul>
            </section>
          ) : listings.length === 0 ? (
            <section className="grid justify-items-center gap-5 px-4 py-14 text-center sm:py-20">
              <span className="text-faint"><ServerTower /></span>
              <div className="grid max-w-md justify-items-center gap-2">
                <h2 className="text-xl font-medium tracking-tight">
                  {needle ? "No server matches that search" : narrowing ? "No server matches those filters" : "No servers on the network yet"}
                </h2>
                <p className="text-sm text-muted">
                  {needle
                    ? "Try a shorter keyword, or clear the search to see the whole board."
                    : narrowing
                      ? "Try another game, platform or region — or clear the filters."
                      : "Be the first to bring yours in. Connected servers feed scores, match results and wipes straight to the board."}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {narrowing ? (
                  <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-medium">
                    Clear search and filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConnectOpen(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg"
                  >
                    Connect Your Server
                  </button>
                )}
                <button type="button" onClick={onClans} className="inline-flex h-11 items-center px-2 text-sm text-muted underline underline-offset-4 hover:text-fg">
                  Browse clans instead
                </button>
              </div>
            </section>
          ) : (
            <section aria-labelledby="servers-heading">
              <h2 id="servers-heading" className="text-sm font-semibold">Servers <span className="font-mono text-xs font-normal text-faint">{listings.length}</span></h2>
              <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3">
                {listings.map((listing) => {
                  const clock = wipeFor(listing.id);
                  const open = openId === listing.id;
                  const posts = LFG.filter((post) => post.listingId === listing.id);
                  const icon = gameIcon(listing.gameId.toUpperCase());
                  return (
                    <li key={listing.id} className="rounded-2xl border border-border bg-bg-elevated">
                      <div className="flex items-stretch gap-3 p-3 sm:p-4">
                        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-bg-subtle">
                          {icon ? (
                            <img src={icon} alt="" className="h-9 w-9 rounded-[6px] object-contain" />
                          ) : (
                            <span className="text-xs font-semibold">{listing.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className="truncate text-sm font-medium">{listing.name}</p>
                            <span className="shrink-0 font-mono text-[11px] text-faint">{listing.rating}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {regionLabel(listing.region)} · {listing.style} · {listing.platform}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-faint">
                            {listing.players}/{listing.cap} online · wipe {clock.next}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : listing.id)}
                            aria-expanded={open}
                            aria-label={`${open ? "Close" : "Open"} ${listing.name}`}
                            className="inline-flex h-9 items-center gap-1 rounded-full bg-fg px-3 text-xs font-semibold text-bg"
                          >
                            {open ? "Close" : "Open"}
                            <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden />
                          </button>
                          <span className="hidden max-w-32 truncate text-[11px] text-faint sm:block">{listing.tags[0]}</span>
                        </div>
                      </div>
                      {open ? (
                        <div className="grid gap-2 border-t border-border/70 px-3 py-3 sm:px-4">
                          <p className="text-sm text-muted">{listing.blurb}</p>
                          <p className="text-xs text-muted">{listing.tags.join(" · ")}</p>
                          {posts.map((post) => (
                            <p key={post.id} className="text-sm">{post.need}</p>
                          ))}
                          <Button className="w-fit" onClick={() => onSave(listing.id)}>
                            {saved.includes(listing.id) ? "Saved" : "Save server"}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {parties.length ? (
            <section aria-labelledby="parties-heading">
              <h2 id="parties-heading" className="text-sm font-semibold">Open parties</h2>
              <ul className="mt-2 divide-y divide-border/70 border-y border-border/70">
                {parties.map((party) => {
                  const where = LISTINGS.find((listing) => listing.id === party.listingId);
                  return (
                    <li key={party.id} className="py-2 text-sm">
                      <span className="text-muted">{party.name} · {where?.name} · {regionLabel(party.region)} · {party.hours}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="players-heading">
            <h2 id="players-heading" className="text-sm font-semibold">Players</h2>
            {loading ? (
              <ul className="mt-2 grid gap-x-6 md:grid-cols-2" aria-hidden>
                {[0, 1, 2].map((row) => (
                  <li key={row} className="border-b border-border/70 py-3">
                    <div className="flex animate-pulse items-center justify-between gap-3 motion-reduce:animate-none">
                      <span className="h-3 w-24 rounded bg-bg-subtle" />
                      <span className="h-2.5 w-8 rounded bg-bg-subtle" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : people.length === 0 ? (
              <p className="mt-2 border-y border-border/70 py-4 text-sm text-muted">
                {needle ? `No player matches “${query.trim()}”.` : "No players in that region yet."}
              </p>
            ) : (
              <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-6 md:grid-cols-2">
                {people.map((identity) => (
                  <li key={identity.id} className="border-b border-border/70">
                    <button type="button" onClick={() => onOpenPlayer(identity.id)} className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm">
                      <span className="truncate">{identity.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted">{regionLabel(identity.region)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
      </div>

      {connectOpen ? <ConnectServerDialog onClose={() => setConnectOpen(false)} onClans={() => { setConnectOpen(false); onClans(); }} /> : null}
    </div>
  );
}

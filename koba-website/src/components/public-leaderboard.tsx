import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Crown, Search, TrendingDown, TrendingUp } from "lucide-react";
import { loadRealIdentities } from "@/lib/pulse/api";
import type { Identity } from "@/platform/engine";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlayerFace } from "@/components/network/shared";
import { PUBLIC_REGIONS, regionLabel, type PublicRegion } from "@/site/regions";

const MEDAL: Record<number, { label: string; textClassName: string; color: string }> = {
  1: { label: "1", textClassName: "text-fg", color: "var(--color-fg)" },
  2: { label: "2", textClassName: "text-fg", color: "#d4d4d4" },
  3: { label: "3", textClassName: "text-muted", color: "#a3a3a3" },
};

const PODIUM: Record<number, { order: string; height: string; scoreClass: string; color: string }> = {
  1: { order: "order-2", height: "pb-9 pt-5", scoreClass: "text-fg", color: "var(--color-fg)" },
  2: { order: "order-1", height: "py-4", scoreClass: "text-fg/90", color: "#d4d4d4" },
  3: { order: "order-3", height: "py-4", scoreClass: "text-muted", color: "#a3a3a3" },
};

function RankVelocity({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp size={13} className="shrink-0 text-ok" aria-label="Climbing" />;
  if (delta < 0) return <TrendingDown size={13} className="shrink-0 text-danger" aria-label="Falling" />;
  return null;
}

function PodiumCard({ identity, rank, onOpen }: { identity: Identity; rank: number; onOpen: () => void }) {
  const spec = PODIUM[rank]!;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`podium-frame is-elite ${spec.order} ${spec.height} flex min-w-0 flex-1 flex-col items-center gap-2 bg-bg-elevated px-3 text-center transition-transform hover:-translate-y-0.5`}
      style={{ "--podium-color": spec.color } as CSSProperties}
    >
      {rank === 1 ? <Crown size={22} className="text-gold" aria-hidden /> : <span className="h-[22px]" aria-hidden />}
      <span className="medal-ring rounded-full p-1" style={{ "--medal-color": spec.color } as CSSProperties}>
        <PlayerFace name={identity.name} id={identity.id} avatarUrl={identity.avatarUrl} size={rank === 1 ? "lg" : "md"} />
      </span>
      <span className="min-w-0 max-w-full">
        <span className="name-tip block truncate font-semibold text-fg" data-tip={identity.name} style={{ fontSize: "clamp(0.8rem, 2vw, 0.95rem)" }}>
          {identity.name}
        </span>
        <span className="block truncate text-xs text-fg/60">@{identity.handle}</span>
      </span>
      <span className={`font-mono text-base font-extrabold tabular-nums ${spec.scoreClass}`}>{identity.score.toLocaleString("en-US")}</span>
    </button>
  );
}

/**
 * Public, unauthenticated homepage: the real leaderboard, read-only. Anyone
 * can see it; only signed-in visitors can interact (open a profile, follow,
 * etc.) - any interactive control here routes through `requireAuth`, which
 * sends a signed-out visitor to /login instead of acting.
 */
export function PublicLeaderboard() {
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<"all" | PublicRegion>("all");
  const navigate = useNavigate();

  useEffect(() => {
    void loadRealIdentities().then(setIdentities);
  }, []);

  const ranked = useMemo(() => (identities ?? []).slice().sort((a, b) => b.score - a.score), [identities]);
  const needle = query.trim().toLowerCase();
  const filtered = ranked.filter((identity) => {
    if (region !== "all" && identity.region !== region) return false;
    if (needle && !`${identity.name} ${identity.handle}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const byRegion = PUBLIC_REGIONS.map((item) => ({ ...item, count: ranked.filter((identity) => identity.region === item.id).length }));

  const requireAuth = () => {
    void navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-border px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <img src="/brand/koba-wordmark-tight.png" alt="KOBA" className="h-8 w-auto object-contain sm:h-10" />
          <ThemeToggle />
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <img src="/brand/hero-background.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/60 to-black/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 py-12 text-white sm:px-8 sm:py-16">
          <img
            src="/brand/koba-mark-tight.png"
            alt=""
            aria-hidden
            style={{ filter: "none" }}
            className="brand-mark-slant mb-3 h-12 w-12 object-contain sm:h-16 sm:w-16"
          />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-white/80 uppercase">Your competitive world</p>
          <h1 className="mt-2 max-w-xl text-3xl font-bold tracking-tight text-white sm:text-5xl">Global leaderboard</h1>
          <p className="mt-3 max-w-lg text-sm text-white/75 sm:text-base">KOBA score across every linked server. Sign in to follow players, join clans, and compete.</p>
          <button
            type="button"
            onClick={requireAuth}
            className="brand-gradient mt-6 inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
          >
            Sign in to compete
          </button>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20.5rem]">
          <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex h-11 items-center gap-2 rounded-full border border-border bg-bg-elevated px-4 sm:w-64">
                <Search size={16} className="shrink-0 text-muted" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search players"
                  aria-label="Search players"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setRegion("all")}
                  className={`h-9 rounded-full px-3.5 text-xs font-semibold ${region === "all" ? "bg-fg text-bg" : "bg-bg-elevated text-muted"}`}
                >
                  Global
                </button>
                {PUBLIC_REGIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRegion(item.id)}
                    className={`h-9 rounded-full px-3.5 text-xs font-semibold ${region === item.id ? "bg-fg text-bg" : "bg-bg-elevated text-muted"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {!needle && filtered.length >= 3 ? (
              <div className="mt-5 flex items-end gap-3">
                {filtered.slice(0, 3).map((identity, index) => (
                  <PodiumCard key={identity.id} identity={identity} rank={index + 1} onOpen={requireAuth} />
                ))}
              </div>
            ) : null}

            <ol className="mt-5 overflow-hidden rounded-3xl border border-border bg-bg-elevated">
              {filtered.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted">
                  {identities === null ? "Loading…" : identities.length === 0 ? "No players yet. Sign in to put the first score on the board." : "No players match."}
                </li>
              ) : null}
              {(!needle && filtered.length >= 3 ? filtered.slice(3) : filtered).map((identity, idx) => {
                const rank = !needle && filtered.length >= 3 ? idx + 4 : idx + 1;
                const medal = MEDAL[rank];
                return (
                  <li key={identity.id} className={`border-b border-border/60 last:border-b-0 ${idx % 2 === 1 ? "bg-bg/40" : ""}`}>
                    <button
                      type="button"
                      onClick={requireAuth}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-subtle"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        {medal ? (
                          <span
                            className={`medal-ring grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-base font-bold ${medal.textClassName}`}
                            style={{ "--medal-color": medal.color } as CSSProperties}
                          >
                            {medal.label}
                          </span>
                        ) : (
                          <span className="w-4 shrink-0 pl-1 font-mono text-sm font-semibold text-muted">{rank}</span>
                        )}
                        <RankVelocity delta={identity.scoreDelta} />
                        <PlayerFace name={identity.name} id={identity.id} avatarUrl={identity.avatarUrl} size="sm" />
                        <span className="min-w-0 border-r border-dotted border-border/60 pr-3">
                          <span className="name-tip block truncate text-base font-semibold text-fg" data-tip={identity.name}>
                            {identity.name}
                          </span>
                          <span className="block truncate text-xs text-fg/60">@{identity.handle}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-base font-bold tabular-nums text-fg">{identity.score.toLocaleString("en-US")}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-2xl border border-border bg-bg-elevated p-4">
              <ul className="grid gap-1.5 text-sm text-muted">
                <li>• Track your ranking</li>
                <li>• Sync console & PC accounts</li>
                <li>• Join clans and challenge rivals</li>
              </ul>
            </div>
            {byRegion.length > 0 ? (
              <div className="rounded-2xl border border-border bg-bg-elevated p-4">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Players by region</p>
                <ul className="mt-3 grid gap-2">
                  {byRegion.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setRegion(item.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${region === item.id ? "bg-fg text-bg" : "text-muted hover:bg-bg-subtle"}`}
                      >
                        <span>{regionLabel(item.id)}</span>
                        <span className="font-mono text-xs">{item.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

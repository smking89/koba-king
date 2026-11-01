import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { CountUp, PlayerFace } from "@/components/network/shared";
import { BadgeStrip, useUnlockedBadgeCount } from "@/components/network/achievements";
import type { Clan, Identity } from "@/platform/engine";
import { LISTINGS } from "@/site/catalog";
import { inspectPayload, MATCH_EVENT, WIPE_EVENT } from "@/site/ingest";
import { useSite } from "@/site/ui";
import { usePlatform } from "@/platform/store";
import type { AppSection } from "@/site/sections";

type Navigate = (section: AppSection, tab?: string) => void;

export function HomePage({
  viewer,
  identities,
  clans,
  rank,
  feed,
  onNavigate,
  onOpenPlayer,
}: {
  viewer: Identity;
  identities: Identity[];
  clans: Clan[];
  rank: number;
  feed: { id: string; title: string; detail: string; tone: string }[];
  onNavigate: Navigate;
  onOpenPlayer: (id: string) => void;
}) {
  const rivals = viewer.rivals
    .map((id) => identities.find((identity) => identity.id === id))
    .filter((identity): identity is Identity => Boolean(identity))
    .slice(0, 3);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const badgeCount = useUnlockedBadgeCount(viewer.id);
  const connectedServer = viewer.homes.length > 0;
  const joinedClan = Boolean(viewer.clanId) || clans.some((clan) => clan.memberIds.includes(viewer.id));
  const hasRivals = rivals.length >= 3;
  const steps = [
    {
      id: "server",
      done: connectedServer,
      title: "Connect a server",
      detail: "Scores, match results and wipes flow in from a connected server.",
      cta: "Find a server",
      go: () => onNavigate("discover"),
    },
    {
      id: "clan",
      done: joinedClan,
      title: "Join a clan",
      detail: "Clans give you a roster, a tag and a war to fight.",
      cta: "Browse clans",
      go: () => onNavigate("discover", "clans"),
    },
    {
      id: "rivals",
      done: hasRivals,
      title: "Follow three players",
      detail: "Rivals show up on your dashboard with the gap to close.",
      cta: "Find players",
      go: () => onNavigate("discover"),
    },
  ];
  const next = steps.find((step) => !step.done) ?? null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-6">
        <section className="rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs tracking-[0.14em] text-muted uppercase">
                {next ? "Next step" : "You're set up"}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {next ? next.title : `Ranked #${rank}. Keep climbing.`}
              </h1>
              <p className="mt-2 max-w-md text-sm text-muted">
                {next ? next.detail : `${hello}, @${viewer.handle}. Your next hundred points is the only thing on the board.`}
              </p>
              <p className="mt-3 text-xs text-faint">{hello}, @{viewer.handle}</p>
            </div>
            <dl className="grid shrink-0 grid-cols-3 gap-4 sm:text-right">
              <div>
                <dt className="text-xs text-muted">Score</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                  <CountUp value={viewer.score} from={viewer.score - Math.max(0, viewer.scoreDelta)} impact />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Global</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{viewer.score > 0 ? `#${rank}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Badges</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{badgeCount}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {next ? (
              <button
                type="button"
                onClick={next.go}
                className="brand-gradient inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-black"
              >
                {next.cta}
                <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate("compete")}
                className="brand-gradient inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-black"
              >
                Open Compete
                <ArrowRight size={16} aria-hidden />
              </button>
            )}
            <button type="button" onClick={() => onNavigate("you")} className="h-11 px-3 text-sm text-muted hover:text-fg">
              View your profile
            </button>
          </div>
        </section>

        {next ? (
          <section aria-labelledby="setup-heading" className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="setup-heading" className="text-sm font-semibold">Set up your account</h2>
              <span className="font-mono text-xs text-faint">{steps.filter((step) => step.done).length}/{steps.length}</span>
            </div>
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {steps.map((step) => (
                <li key={step.id} className="flex min-h-14 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className={`text-sm ${step.done ? "text-muted line-through" : "font-medium"}`}>{step.title}</p>
                    <p className="text-xs text-muted">{step.detail}</p>
                  </div>
                  {step.done ? (
                    <span className="shrink-0 font-mono text-xs text-faint">Done</span>
                  ) : (
                    <button type="button" onClick={step.go} className="mt-1 h-11 shrink-0 text-left text-sm font-semibold text-fg underline-offset-4 hover:underline sm:mt-0 sm:text-right">
                      {step.cta}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="activity-heading" className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="activity-heading" className="text-sm font-semibold">Recent activity</h2>
            <button type="button" onClick={() => onNavigate("compete")} className="min-h-11 px-2 text-sm text-muted hover:text-fg">View all</button>
          </div>
          {feed.length === 0 ? (
            <div className="flex flex-col items-start gap-3 border-y border-border/70 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">No confirmed activity yet. Your first match or wipe will land here.</p>
              <button type="button" onClick={() => onNavigate("discover")} className="inline-flex h-11 shrink-0 items-center text-sm font-semibold underline decoration-border decoration-1 underline-offset-4 hover:decoration-fg">
                Connect a server
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {feed.slice(0, 4).map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onNavigate("compete")} className="flex w-full min-h-14 items-center gap-3 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs tracking-wide text-muted uppercase">{row.tone}</span>
                      <span className="mt-0.5 block text-sm">{row.title}</span>
                      <span className="block text-xs text-muted">{row.detail}</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-faint" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Challenges onNavigate={onNavigate} />
      </div>

      <aside className="grid content-start gap-6">
        <section aria-labelledby="rivals-heading" className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="rivals-heading" className="text-sm font-semibold">Rival watch</h2>
            <button type="button" onClick={() => onNavigate("compete")} className="min-h-11 px-2 text-sm text-muted hover:text-fg">View all</button>
          </div>
          {rivals.length === 0 ? (
            <div className="flex items-start justify-between gap-3 border-y border-border/70 py-3">
              <p className="text-sm text-muted">No rivals yet.</p>
              <button type="button" onClick={() => onNavigate("discover")} className="inline-flex h-11 shrink-0 items-center text-sm font-semibold underline decoration-border decoration-1 underline-offset-4 hover:decoration-fg">Find players</button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {rivals.map((item) => {
                const ahead = item.score - viewer.score;
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => onOpenPlayer(item.id)} className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left">
                      <PlayerFace name={item.name} id={item.id} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block text-xs text-muted">{item.form} · {item.score.toLocaleString("en-US")}</span>
                      </span>
                      <span className="text-xs font-semibold">{ahead === 0 ? "Level" : ahead > 0 ? `${ahead} ahead` : `${Math.abs(ahead)} back`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="circle-heading" className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="circle-heading" className="text-sm font-semibold">Your clan and servers</h2>
            <button type="button" onClick={() => onNavigate("you", "clans")} className="min-h-11 px-2 text-sm text-muted hover:text-fg">Manage</button>
          </div>
          <div className="border-y border-border/70 py-2">
            {joinedClan ? (
              <button type="button" onClick={() => onNavigate("you", "clans")} className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
                <span className="text-sm">{clans.find((clan) => clan.id === viewer.clanId || clan.memberIds.includes(viewer.id))?.name ?? "Your clan"}</span>
                <ArrowRight size={16} className="text-faint" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={() => onNavigate("discover", "clans")} className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm">
                Find a clan
                <ArrowRight size={16} className="text-faint" aria-hidden />
              </button>
            )}
            {connectedServer ? (
              viewer.homes.map((home) => (
                <div key={home.name ?? "server"} className="py-2">
                  <p className="text-sm">{home.name}</p>
                  <p className="text-xs text-muted">Connected</p>
                </div>
              ))
            ) : (
              <button type="button" onClick={() => onNavigate("discover")} className="flex min-h-12 w-full items-center justify-between gap-3 border-t border-border/70 text-left text-sm">
                Connect a server
                <ArrowRight size={16} className="text-faint" aria-hidden />
              </button>
            )}
          </div>
        </section>

        <section aria-labelledby="you-heading" className="grid gap-3 rounded-2xl border border-border bg-bg-elevated p-4">
          <div className="flex items-center gap-3">
            <PlayerFace name={viewer.name} id={viewer.id} size="md" avatarUrl={viewer.avatarUrl} />
            <div className="min-w-0">
              <h2 id="you-heading" className="truncate text-base font-semibold">{viewer.name}</h2>
              <p className="text-xs text-muted">@{viewer.handle}</p>
            </div>
            <button type="button" onClick={() => onNavigate("you")} className="ml-auto min-h-11 shrink-0 px-2 text-sm text-muted hover:text-fg">Open</button>
          </div>
          <div className="grid gap-2 border-t border-border/70 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-[0.12em] text-muted uppercase">Recent badges</p>
              <button type="button" onClick={() => onNavigate("you")} className="min-h-11 px-2 text-xs text-muted hover:text-fg">All badges</button>
            </div>
            <BadgeStrip kobaId={viewer.id} />
            {badgeCount === 0 ? (
              <button type="button" onClick={() => onNavigate("you")} className="h-11 text-left text-xs font-semibold text-fg underline-offset-4 hover:underline">
                See how badges work
              </button>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="around-heading" className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="around-heading" className="text-sm font-semibold">Around you</h2>
            <button type="button" onClick={() => onNavigate("compete", "rankings")} className="min-h-11 px-2 text-sm text-muted hover:text-fg">Rankings</button>
          </div>
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {around(identities, viewer.id).map((identity) => {
              const place = identities.slice().sort((a, b) => b.score - a.score).findIndex((item) => item.id === identity.id) + 1;
              return (
                <li key={identity.id}>
                  <button type="button" onClick={() => onOpenPlayer(identity.id)} className={`grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 text-left ${identity.id === viewer.id ? "font-medium" : ""}`}>
                    <span className="font-mono text-xs text-faint">{place}</span>
                    <span className="truncate text-sm">{identity.name}</span>
                    <span className="text-sm tabular-nums">{identity.score.toLocaleString("en-US")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {LISTINGS.length > 0 ? (
          <p className="text-xs text-muted">
            {LISTINGS.length} server{LISTINGS.length === 1 ? "" : "s"} on the network right now.{" "}
            <button type="button" onClick={() => onNavigate("discover")} className="min-h-11 text-fg underline-offset-4 hover:underline">Browse</button>
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function around(identities: Identity[], viewerId: string): Identity[] {
  const board = identities.slice().sort((a, b) => b.score - a.score);
  const index = board.findIndex((identity) => identity.id === viewerId);
  return board.slice(Math.max(0, index - 1), Math.max(0, index) + 4);
}

function Challenges({ onNavigate }: { onNavigate: Navigate }) {
  const quests = useSite((s) => s.quests);
  const advanceQuest = useSite((s) => s.advanceQuest);
  const emitCombat = usePlatform((s) => s.emitCombat);
  const [note, setNote] = useState("");
  return (
    <section aria-labelledby="challenges-heading" className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="challenges-heading" className="text-sm font-semibold">Active challenges</h2>
        <button type="button" onClick={() => onNavigate("compete")} className="min-h-11 px-2 text-sm text-muted hover:text-fg">View all</button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {quests.slice(0, 3).map((quest) => {
          const ratio = Math.min(100, Math.round((quest.progress / Math.max(1, quest.need)) * 100));
          return (
            <li key={quest.id} className="rounded-2xl border border-border bg-bg-elevated p-4">
              <p className="text-xs tracking-wide text-muted uppercase">{quest.event.replaceAll("_", " ")}</p>
              <p className="mt-1 text-sm font-medium">{quest.title}</p>
              <p className="mt-1 text-xs text-muted">{quest.detail}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                <i className="block h-full rounded-full bg-fg" style={{ width: `${ratio}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted">{quest.progress}/{quest.need}</span>
                <button
                  type="button"
                  disabled={quest.progress >= quest.need}
                  className="h-11 px-2 text-sm font-semibold disabled:text-muted"
                  onClick={() => {
                    if (quest.event === "COMBAT_KILL") {
                      void emitCombat().then((sent) => setNote(sent ? "Combat sent." : "No combat to send yet. Connect a server and link a second player first."));
                      return;
                    }
                    const sample = quest.event === "MATCH_END" ? MATCH_EVENT : WIPE_EVENT;
                    const result = inspectPayload(JSON.stringify(sample), sample.integration_metadata.payload_timestamp_utc);
                    if (result.event) {
                      advanceQuest(quest.event);
                      setNote(`${quest.event} passed.`);
                    } else {
                      setNote(result.gates.find((gate) => !gate.pass)?.detail ?? "Rejected.");
                    }
                  }}
                >
                  {quest.progress >= quest.need ? "Done" : "Run"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </section>
  );
}

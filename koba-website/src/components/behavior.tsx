import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Chip, Panel } from "@/components/ui";
import {
  BEHAVIOR_AXES,
  BEHAVIOR_LABEL,
  behaviorSnapshot,
  formatSpan,
  formatWhen,
  isCombatKind,
  type Engagement,
  type PlaceLookup,
} from "@/engine/behavior";
import type { Player } from "@/engine/types";
import { CANDIDATES, gameName } from "@/engine/world";
import { playerById, usePulse } from "@/state/pulse";

const ENGAGEMENT: Record<Engagement, { label: string; tone: "neutral" | "ok" | "warn" | "danger" }> = {
  "locked-in": { label: "Locked in", tone: "ok" },
  steady: { label: "Steady", tone: "neutral" },
  drifting: { label: "Drifting", tone: "warn" },
  between: { label: "Between sessions", tone: "neutral" },
  "idle-risk": { label: "Idle risk", tone: "danger" },
};

type Cut = "all" | "combat" | "world";

export function BehaviorView({ people }: { people: Player[] }) {
  const viewerId = usePulse((s) => s.viewerId);
  const catalogCandidates = usePulse((s) => s.catalogCandidates);
  const [now, setNow] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const [cut, setCut] = useState<Cut>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (held !== null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [held]);

  const lookup = useMemo<PlaceLookup>(() => {
    const source = catalogCandidates.length ? catalogCandidates : CANDIDATES;
    const places = new Map<string, { title: string; gameId?: string }>();
    for (const candidate of source) {
      if (candidate.kind !== "server") continue;
      places.set(candidate.id, { title: candidate.title, gameId: candidate.gameId });
    }
    return (id) => places.get(id);
  }, [catalogCandidates]);

  const player = playerById(people, viewerId);
  const clock = held ?? now;
  const snap = useMemo(
    () => (player ? behaviorSnapshot(player, people, clock, lookup) : null),
    [player, people, clock, lookup],
  );

  if (!player || !snap) return null;
  const status = ENGAGEMENT[snap.engagement];
  const live = held === null && !snap.anchor;
  const tape = snap.events.filter((event) => {
    if (cut === "combat") return isCombatKind(event.kind);
    if (cut === "world") return !isCombatKind(event.kind);
    return true;
  });
  const kd = snap.deaths > 0 ? (snap.kills / snap.deaths).toFixed(2) : snap.kills > 0 ? String(snap.kills) : "—";
  const rank = `${snap.rankDelta > 0 ? "+" : ""}${snap.rankDelta}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">Behavior</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Live session tape for {player.name}. Kills, objectives, rank ticks, and server hops from the
            last 24 minutes, paced by how they actually play.
          </p>
          <p className="mt-2 font-mono text-xs text-faint">
            {gameName(snap.gameId)} · {snap.place} · {player.region}
            {live ? " · live" : held !== null ? " · held" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={status.tone}>{status.label}</Chip>
          <Button
            variant="ghost"
            aria-pressed={held !== null}
            onClick={() => setHeld((current) => (current === null ? Date.now() : null))}
          >
            {held !== null ? "Resume" : "Hold"}
          </Button>
        </div>
      </div>

      {snap.integrity === "mismatch" ? (
        <p className="rounded-3xl border border-warn/40 px-4 py-3 text-sm text-warn">
          Population pings do not match this session tape. Treat the concurrent number as untrusted.
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {snap.events[0]
          ? `${BEHAVIOR_LABEL[snap.events[0].kind]}. ${snap.events[0].detail}. ${formatWhen(snap.events[0].at, snap.nowMs)}.`
          : "No events in this window."}
      </p>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={snap.online ? "Session" : "Returns"}
          value={snap.online ? formatSpan(snap.elapsedMs, true) : formatSpan(snap.returnInMs)}
          hint={snap.online ? snap.place : "Between sessions"}
        />
        <Stat
          label={snap.online ? "This minute" : "Last minute"}
          value={String(snap.lastMinute)}
          hint={`${snap.perMinute.toFixed(1)} / min over 24m`}
        />
        <Stat label={snap.deaths > 0 ? "K/D" : "Kills"} value={kd} hint={`${snap.kills} kills · ${snap.deaths} deaths`} />
        <Stat label="Rank" value={rank} hint={`Score ${snap.scoreNow}`} />
      </dl>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Panel
            title="Activity"
            action={
              <span className="flex items-center gap-3 font-mono text-xs text-faint">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 bg-fg" /> Combat
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 bg-ok" /> World
                </span>
              </span>
            }
          >
            <p className="mt-2 text-sm text-muted">
              {snap.online
                ? "One-minute buckets. New rows land as the clock crosses them."
                : `Last session, ended ${formatSpan(snap.offlineForMs)} ago. The tape holds until they queue again.`}
            </p>
            <div className="h-52 w-full min-w-0">
              {mounted && snap.series.some((point) => point.combat + point.world > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={snap.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={28}
                      tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        color: "var(--color-fg)",
                        fontSize: 12,
                      }}
                      cursor={{ stroke: "var(--color-border)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="combat"
                      name="Combat"
                      stackId="activity"
                      stroke="var(--color-fg)"
                      fill="var(--color-fg)"
                      fillOpacity={0.35}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="world"
                      name="World"
                      stackId="activity"
                      stroke="var(--color-ok)"
                      fill="var(--color-ok)"
                      fillOpacity={0.45}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center text-sm text-muted">No rows in this window.</p>
              )}
            </div>
          </Panel>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <Panel title="Playstyle drift">
            <ul className="grid gap-3">
              {BEHAVIOR_AXES.map((label, index) => (
                <Drift key={label} label={label} base={snap.baseline[index] ?? 0} live={snap.liveVector[index] ?? 0} />
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">This window against the stored six-axis vector.</p>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Panel title="Event tape">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {(
                [
                  ["all", "All"],
                  ["combat", "Combat"],
                  ["world", "World"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={cut === id}
                  onClick={() => setCut(id)}
                  className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm ${
                    cut === id ? "border-fg bg-fg text-bg" : "border-border text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tape.length === 0 ? (
              <p className="text-sm text-muted">
                {snap.events.length === 0
                  ? snap.online
                    ? "Quiet minute. Nothing has landed on the tape yet."
                    : `No rows in the last 24 minutes. Next session ${formatSpan(snap.returnInMs)}.`
                  : "Nothing in this cut of the tape."}
              </p>
            ) : (
              <ol className="grid">
                {tape.map((event) => (
                  <li key={event.id} className="flex items-baseline justify-between gap-3 border-b border-border py-3 last:border-b-0">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-faint">{formatWhen(event.at, snap.nowMs)}</span>
                      <span className="ml-2 text-sm">{BEHAVIOR_LABEL[event.kind]}</span>
                      {event.rankDelta !== 0 ? (
                        <span className={`ml-2 font-mono text-xs tabular-nums ${event.rankDelta > 0 ? "text-ok" : "text-danger"}`}>
                          {event.rankDelta > 0 ? "+" : ""}
                          {event.rankDelta}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-sm text-muted">{event.detail}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-xs text-muted">{gameName(event.gameId)}</span>
                      <span className="block font-mono text-xs text-faint">{event.place}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <Panel title="Around them">
            {snap.party.length === 0 ? (
              <p className="text-sm text-muted">No friends or rivals on the graph.</p>
            ) : (
              <ul className="grid">
                {snap.party.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 border-b border-border py-3 last:border-b-0">
                    <span className="min-w-0">
                      <span className="block text-sm">{row.name}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {row.relation === "rival" ? "Rival" : "Friend"}
                        {row.online ? ` · ${row.place}` : ""}
                        {row.samePlace ? " · same server" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {row.online ? `${row.perMinute}/min` : formatSpan(row.returnInMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-border bg-bg-elevated p-4">
      <dt className="font-mono text-xs text-faint">{label}</dt>
      <dd className="mt-2 font-mono text-2xl tabular-nums tracking-tight">{value}</dd>
      <dd className="mt-1 truncate text-sm text-muted">{hint}</dd>
    </div>
  );
}

function Drift({ label, base, live }: { label: string; base: number; live: number }) {
  const delta = Math.round((live - base) * 100) / 100;
  const mark = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-fg">
          {live.toFixed(2)} <span className="text-faint">{mark}</span>
        </span>
      </div>
      <div className="relative mt-1 h-1 overflow-hidden rounded-sm bg-bg-subtle">
        <div className="absolute inset-y-0 left-0 bg-fg/30" style={{ width: `${Math.round(base * 100)}%` }} />
        <div className="absolute inset-y-0 left-0 h-1 bg-fg" style={{ width: `${Math.round(live * 100)}%` }} />
      </div>
    </li>
  );
}

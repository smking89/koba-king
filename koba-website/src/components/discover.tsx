import { Button, Chip, Meter } from "@/components/ui";
import { ACTIONS, APPLICABLE, KIND_LABEL } from "@/engine/types";
import type { PulseResult, ScoredItem } from "@/engine/types";
import { CLAN_MAP, gameName } from "@/engine/world";
import { activateLedgerBoost, closeLedgerBoost } from "@/lib/pulse/api";
import { boostRemaining, creditsLeft, formatClock, playerById, usePulse } from "@/state/pulse";

export function Discover({ result }: { result: PulseResult }) {
  const roster = usePulse((s) => s.roster);
  const scores = usePulse((s) => s.scores);
  const viewer = playerById(roster, result.viewerId);
  const query = usePulse((s) => s.query);
  const boosts = usePulse((s) => s.boosts);
  const nowMs = usePulse((s) => s.nowMs);
  const spent = usePulse((s) => s.spent);
  const dismissed = usePulse((s) => s.dismissed);
  const token = usePulse((s) => s.token);
  const portal = usePulse((s) => s.portal);
  const setView = usePulse((s) => s.setView);
  const setFocus = usePulse((s) => s.setFocus);
  const setGateNote = usePulse((s) => s.setGateNote);
  const activateBoost = usePulse((s) => s.activateBoost);
  const endBoost = usePulse((s) => s.endBoost);
  const dismiss = usePulse((s) => s.dismiss);
  const restore = usePulse((s) => s.restore);
  if (!viewer) return null;
  const credits = creditsLeft(viewer.astro, result.viewerId, spent);
  const clan = viewer.clanId ? CLAN_MAP[viewer.clanId]?.name : "Unaffiliated";
  const gameScores = scores.filter((row) => row.playerId === viewer.id);

  const eligibleOrder = result.scored
    .filter((s) => s.visibility === "allow")
    .sort((a, b) => b.clickScore - a.clickScore);

  async function commitBoost(id: string) {
    const ok = activateBoost(id);
    if (!ok) {
      setGateNote("No boost credits left on this identity.");
      return;
    }
    if (!token) {
      setGateNote("Ledger rejected the write (401). The window is local until this console is authorized.");
      return;
    }
    const ledger = await activateLedgerBoost({
      data: { authorization: `Bearer ${token}`, portal, itemId: id, actorId: result.viewerId },
    });
    if (!ledger.ok) {
      setGateNote(`Ledger rejected the write (${ledger.status}). ${ledger.error}`);
      return;
    }
    setGateNote(`Ledger ${ledger.id}. ${ledger.creditsRemaining} credits remain on the wallet.`);
  }

  async function endWindow(id: string) {
    endBoost(id);
    if (!token) return;
    const ledger = await closeLedgerBoost({
      data: { authorization: `Bearer ${token}`, portal, itemId: id, actorId: result.viewerId },
    });
    setGateNote(ledger.ok ? "Boost window closed on the ledger." : `Ledger close refused (${ledger.status}).`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">Feed for {viewer.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {viewer.region} · KOBA {Math.round(viewer.score)} · {clan} · {result.clusterName}
            {viewer.astro ? " · Astro" : ""}
            {result.coldStart.active ? " · Cold start" : ""}
          </p>
          {result.coldStart.active ? (
            <p className="mt-3 rounded-3xl border border-border px-4 py-3 text-sm text-muted">{result.coldStart.note}</p>
          ) : null}
          {gameScores.length ? (
            <p className="mt-2 text-sm text-muted">
              {gameScores
                .map(
                  (row) =>
                    `${gameName(row.gameId)} ${Math.round(row.normalizedScore)} (${Math.round(row.confidenceLow)}–${Math.round(row.confidenceHigh)})`,
                )
                .join(" · ")}
            </p>
          ) : null}
        </div>

        {result.dropped.length > 0 ? (
          <button
            type="button"
            onClick={() => setView("gate")}
            className="rounded-3xl border border-border px-4 py-3 text-left text-sm text-muted hover:bg-bg-elevated"
          >
            <span className="text-fg">{result.dropped.length} blocked by the gate.</span> Highest
            counterfactual rank #{result.dropped[0]?.counterfactualRank}. Ranking did not save them.
          </button>
        ) : null}

        {result.feed.length === 0 ? (
          <p className="rounded-3xl border border-border p-4 text-sm text-muted">
            {query
              ? "Nothing in the catalog matched that query well enough to score."
              : "The pool is empty after dismissals and the gate."}
          </p>
        ) : (
          <ol className="grid gap-3">
            {result.feed.map((item) => (
              <FeedCard
                key={item.candidate.id}
                item={item}
                scoreRank={eligibleOrder.findIndex((s) => s.candidate.id === item.candidate.id) + 1}
                credits={credits}
                remaining={boostRemaining(boosts[item.candidate.id], nowMs)}
                onWhy={() => setFocus(item.candidate.id)}
                onBoost={() => void commitBoost(item.candidate.id)}
                onEnd={() => void endWindow(item.candidate.id)}
                onDismiss={() => dismiss(item.candidate.id)}
              />
            ))}
          </ol>
        )}

        {result.held.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Held for review</h3>
            <p className="text-sm text-muted">
              These scored, then the visibility gate quarantined them. They are not in the feed.
            </p>
            <ul className="grid gap-2">
              {result.held.map((item) => (
                <li key={item.candidate.id}>
                  <button
                    type="button"
                    onClick={() => setFocus(item.candidate.id)}
                    className="w-full rounded-3xl border border-border px-4 py-3 text-left hover:bg-bg-elevated"
                  >
                    <span className="font-mono text-xs text-warn">Interstitial</span>
                    <span className="mt-1 block text-sm">{item.candidate.title}</span>
                    <span className="mt-1 block text-sm text-muted">{item.visibilityReason}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dismissed.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dismissed.map((id) => (
              <Button key={id} variant="quiet" onClick={() => restore(id)}>
                Restore {id}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <aside className="grid content-start gap-3">
        <section className="rounded-3xl border border-border bg-bg-elevated p-4">
          <h2 className="text-sm font-medium">This pass</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs">
            <Stat label="Retrieved" value={String(result.retrieved)} />
            <Stat label="Scored" value={String(result.scored.length)} />
            <Stat label="Allowed" value={String(result.scored.filter((s) => s.visibility === "allow").length)} />
            <Stat label="In feed" value={String(result.feed.length)} />
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {result.membership[0]
              ? `${Math.round(result.membership[0].weight * 100)}% ${result.membership[0].name}.`
              : null}{" "}
            Boost credits left: {credits}. Astro accounts start with four; everyone else starts with one.
          </p>
        </section>
        <section className="rounded-3xl border border-border p-4">
          <h2 className="text-sm font-medium">How to read a card</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The large number is organic click relevance. A 3× mark is exposure weight only — it does not
            reorder the cards. A sponsor in slot 4 is placed by policy and stays labeled.
          </p>
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-1 text-sm text-fg tabular-nums">{value}</dd>
    </div>
  );
}

function FeedCard({
  item,
  scoreRank,
  credits,
  remaining,
  onWhy,
  onBoost,
  onEnd,
  onDismiss,
}: {
  item: ScoredItem;
  scoreRank: number;
  credits: number;
  remaining: number | null;
  onWhy: () => void;
  onBoost: () => void;
  onEnd: () => void;
  onDismiss: () => void;
}) {
  const c = item.candidate;
  const moved = item.placed !== "native-slot" && scoreRank > 0 && scoreRank !== item.rank;
  return (
    <li className={`rounded-3xl border bg-bg-elevated p-4 ${item.placed === "native-slot" ? "border-fg" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-faint">
            {String(item.rank).padStart(2, "0")} · {KIND_LABEL[c.kind]}
            {c.gameId ? ` · ${gameName(c.gameId)}` : ""}
            {c.region ? ` · ${c.region}` : ""}
          </p>
          <h3 className="mt-1 truncate text-lg font-medium tracking-tight">{c.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{c.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg tabular-nums">{item.clickScore.toFixed(2)}</p>
          <p className="font-mono text-xs text-faint">click</p>
          {item.boostMultiplier > 1 ? (
            <p className="font-mono text-xs text-muted tabular-nums">exp {item.distributionScore.toFixed(2)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip>{c.meta}</Chip>
        {item.boostMultiplier > 1 && remaining !== null ? (
          <Chip tone="warn">3× opportunity · {formatClock(remaining)}</Chip>
        ) : null}
        {c.coldStart ? <Chip tone="warn">Cold start</Chip> : null}
        {item.placed === "native-slot" ? <Chip>Labeled slot</Chip> : null}
        {c.verified ? <Chip tone="ok">Verified</Chip> : null}
      </div>

      {item.placed === "native-slot" ? (
        <p className="mt-3 text-sm text-muted">
          Reserved slot. Score order would be {scoreRank || "outside the cut"}. It does not outrank the
          cards around it.
        </p>
      ) : item.boostMultiplier > 1 && item.shadowRank == null ? (
        <p className="mt-3 text-sm text-muted">
          Exposure reserve. It missed the organic cut. Click order still follows relevance, so it does not
          jump the cards above it.
        </p>
      ) : moved ? (
        <p className="mt-3 text-sm text-muted">
          Diversity moved this from score order {scoreRank}. Same game and kind are not allowed to stack.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {APPLICABLE[c.kind].map((id) => {
          const action = ACTIONS.find((a) => a.id === id)!;
          return <Meter key={id} label={action.label} value={item.probs[id]} />;
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onWhy}>
          Why this
        </Button>
        {c.boostEligible ? (
          remaining !== null ? (
            <Button onClick={onEnd}>End window</Button>
          ) : (
            <Button onClick={onBoost} disabled={credits <= 0}>
              {credits > 0 ? "Boost 10 min" : "No boost credits"}
            </Button>
          )
        ) : null}
        <Button variant="quiet" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

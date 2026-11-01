import * as Dialog from "@radix-ui/react-dialog";
import { Meter } from "@/components/ui";
import { ACTIONS, APPLICABLE, KIND_LABEL } from "@/engine/types";
import type { PulseResult, ScoredItem } from "@/engine/types";
import { CANDIDATE_MAP, CLAN_MAP, gameName, playerName } from "@/engine/world";
import { usePulse } from "@/state/pulse";

export function ExplainDialog({ result }: { result: PulseResult }) {
  const focusId = usePulse((s) => s.focusId);
  const setFocus = usePulse((s) => s.setFocus);
  const catalog = usePulse((s) => s.catalogCandidates);
  const item = focusId ? result.scored.find((s) => s.candidate.id === focusId) : undefined;
  const candidate = focusId
    ? (item?.candidate ?? catalog.find((row) => row.id === focusId) ?? CANDIDATE_MAP[focusId])
    : undefined;

  return (
    <Dialog.Root open={!!focusId} onOpenChange={(open) => !open && setFocus(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-scrim/80" />
        <div className="pointer-events-none fixed inset-0 z-30 flex items-end justify-center p-4 sm:items-center">
          <Dialog.Content className="pointer-events-auto max-h-full w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-bg-elevated p-4">
            {candidate ? (
              <ExplainBody item={item} candidateId={candidate.id} result={result} />
            ) : (
              <Dialog.Title className="text-lg font-medium">Nothing selected</Dialog.Title>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ExplainBody({
  item,
  candidateId,
  result,
}: {
  item?: ScoredItem;
  candidateId: string;
  result: PulseResult;
}) {
  const catalog = usePulse((s) => s.catalogCandidates);
  const candidate = item?.candidate ?? catalog.find((row) => row.id === candidateId) ?? CANDIDATE_MAP[candidateId];
  if (!candidate) return null;
  const scoreRank =
    item &&
    result.scored
      .filter((s) => s.visibility === "allow")
      .sort((a, b) => b.clickScore - a.clickScore)
      .findIndex((s) => s.candidate.id === candidate.id) + 1;

  return (
    <div className="grid gap-4">
      <div>
        <p className="font-mono text-xs text-faint">
          {KIND_LABEL[candidate.kind]}
          {candidate.gameId ? ` · ${gameName(candidate.gameId)}` : ""}
          {candidate.region ? ` · ${candidate.region}` : ""}
        </p>
        <Dialog.Title className="mt-1 text-xl font-medium tracking-tight">{candidate.title}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
          {candidate.detail}
        </Dialog.Description>
      </div>

      {item ? (
        <>
          <p className="text-sm leading-relaxed">{item.why}</p>
          <dl className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
            <Stat label="Click" value={item.clickScore.toFixed(2)} />
            <Stat label="Boost" value={item.boostMultiplier === 3 ? "×3" : "×1"} />
            <Stat label="Exposure" value={item.distributionScore.toFixed(2)} />
            <Stat label="Gate" value={item.visibility} />
          </dl>
          {item.placed === "native-slot" && scoreRank ? (
            <p className="text-sm text-muted">
              Reserved sponsor slot. On score alone this would sit at {scoreRank}. It is labeled so it
              cannot pass as an organic result.
            </p>
          ) : null}
          {item.boostMultiplier > 1 && item.rank > 0 && item.shadowRank === item.rank ? (
            <p className="text-sm text-muted">
              Exposure is ×3. Click rank stayed at {item.rank}. Organic relevance still orders the feed.
            </p>
          ) : null}
          {item.shadowRank !== null && item.rank > 0 && item.shadowRank !== item.rank ? (
            <p className="text-sm text-muted">
              Exposure reserve changed placement from {item.shadowRank} to click rank {item.rank}. The
              multiplier does not outrank a higher organic score.
            </p>
          ) : null}
          {item.shadowRank === null && item.boostMultiplier > 1 && item.rank > 0 ? (
            <p className="text-sm text-muted">
              The exposure cap reserved a slot the organic cut missed. Cards above it still outrank it on
              click relevance.
            </p>
          ) : null}
          <div className="grid gap-3">
            {APPLICABLE[candidate.kind].map((id) => {
              const action = ACTIONS.find((a) => a.id === id)!;
              return <Meter key={id} label={action.label} value={item.probs[id]} />;
            })}
          </div>
          {item.contributions.length ? (
            <div>
              <h3 className="text-sm font-medium">What moved the leading intent</h3>
              <ul className="mt-2 grid gap-1">
                {item.contributions.map((c) => (
                  <li key={c.label} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted">{c.label}</span>
                    <span className="font-mono tabular-nums">{c.weight.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted">
            Sources: {item.sources.map((s) => s.label).join(", ") || "none"}. Counterfactual rank if the
            gate were off: {item.counterfactualRank}.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">
          Not in this player's retrieved set, so it was never scored. Retrieval is personal. The
          catalog row still exists for the gate.
        </p>
      )}

      <p className="text-sm text-muted">
        {candidate.complianceNote} Fraud risk {candidate.fraudRisk.toFixed(2)}.
        {candidate.anchors.length ? ` Anchors: ${candidate.anchors.map(playerName).join(", ")}.` : ""}
        {candidate.clanId ? ` Clan ${CLAN_MAP[candidate.clanId]?.name}.` : ""}
      </p>
      <div className="flex justify-end">
        <Dialog.Close className="inline-flex min-h-11 items-center rounded-lg bg-fg px-3 text-sm font-medium text-bg">
          Close
        </Dialog.Close>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg p-2">
      <dt className="text-faint">{label}</dt>
      <dd className="mt-1 text-sm text-fg tabular-nums">{value}</dd>
    </div>
  );
}

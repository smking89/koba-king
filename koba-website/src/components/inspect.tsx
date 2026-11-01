import * as Slider from "@radix-ui/react-slider";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ACTIONS } from "@/engine/types";
import type { Compliance, Player, PulseResult } from "@/engine/types";
import { CANDIDATES, CLAN_MAP, PLAYERS, gameName } from "@/engine/world";
import { issueOperatorToken, publishWeights } from "@/lib/pulse/api";
import type { PortalId } from "@/lib/pulse/types";
import { playerById, usePulse } from "@/state/pulse";

export function PipelineView({ result }: { result: PulseResult }) {
  const [open, setOpen] = useState("heavy");
  const setFocus = usePulse((s) => s.setFocus);
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-2xl font-medium tracking-tight">Candidate pipeline</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Original KOBA pipeline. The shape — in-network walk, community retrieval, a cheap cut, a
          multi-action head, then a separate gate — is how production rankers stay fast and enforceable.
          Nothing here is copied from a reference repository. Every stage exists because KOBA has a graph,
          a boost economy, or a staff label that needs it.
        </p>
      </div>
      <ol className="grid gap-2">
        {result.trace.map((stage, index) => {
          const expanded = open === stage.id;
          return (
            <li key={stage.id} className="rounded-3xl border border-border bg-bg-elevated">
              <button
                type="button"
                className="flex w-full items-start gap-3 p-4 text-left"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? "" : stage.id)}
              >
                <span className="font-mono text-xs text-faint">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{stage.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{stage.purpose}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                  {stage.kept}/{stage.entered}
                </span>
              </button>
              {expanded ? (
                <ul className="grid gap-1 border-t border-border px-4 py-3">
                  {stage.rows.length === 0 ? (
                    <li className="text-sm text-muted">Nothing at this stage.</li>
                  ) : (
                    stage.rows.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => setFocus(row.id)}
                          className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-subtle"
                        >
                          <span className="min-w-0">
                            <span className={row.kept ? "text-sm" : "text-sm text-faint"}>{row.title}</span>
                            <span className="mt-0.5 block font-mono text-xs text-faint">{row.note}</span>
                          </span>
                          <span className="font-mono text-xs tabular-nums text-muted">{row.score.toFixed(2)}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ClustersView({ result }: { result: PulseResult }) {
  const roster = usePulse((s) => s.roster);
  const viewer = playerById(roster, result.viewerId);
  if (!viewer) return null;
  const people = roster.length ? roster : PLAYERS;
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-medium tracking-tight">Affinity communities</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Players are grouped by a six-axis playstyle vector: survival, tactical focus, session length,
          clan loyalty, aggression, exploration. Membership is a softmax over cosine to the centroids.
          Out-of-network servers enter through this, not through friends.
        </p>
      </div>
      <EgoGraph viewer={viewer} people={people} />
      <ul className="grid gap-3 md:grid-cols-2">
        {result.membership.map((m) => {
          const cluster = result.clusters.find((c) => c.id === m.id);
          const active = m.id === result.membership[0]?.id;
          return (
            <li
              key={m.id}
              className={`rounded-3xl border p-4 ${active ? "border-fg bg-bg-elevated" : "border-border"}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium">{m.name}</h3>
                <span className="font-mono text-xs tabular-nums text-muted">{Math.round(m.weight * 100)}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-sm bg-bg-subtle">
                <div className="h-1 bg-fg" style={{ width: `${Math.round(m.weight * 100)}%` }} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {(cluster?.memberIds ?? []).map((id) => playerById(people, id)?.name ?? id).join(", ") || "Empty"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EgoGraph({ viewer, people }: { viewer: Player; people: Player[] }) {
  const clanIds = people.filter((p) => viewer.clanId && p.clanId === viewer.clanId && p.id !== viewer.id).map((p) => p.id);
  const ids = [...new Set([...viewer.friends, ...viewer.rivals, ...clanIds])].slice(0, 8);
  const cx = 160;
  const cy = 108;
  const radius = 78;
  return (
    <section className="rounded-3xl border border-border bg-bg-elevated p-4">
      <h3 className="text-sm font-medium">Graph around {viewer.name}</h3>
      <p className="mt-1 text-sm text-muted">Solid lines are friends or clan. Dashed lines are rivals.</p>
      {ids.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No friends, rivals, or clanmates on file. A cold-start player stays on the prior until the graph fills in.
        </p>
      ) : (
      <svg viewBox="0 0 320 230" className="mt-2 w-full" role="img" aria-label={`Graph around ${viewer.name}`}>
        {ids.map((id, i) => {
          const angle = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          const rival = viewer.rivals.includes(id);
          const person = playerById(people, id);
          return (
            <g key={id}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="currentColor"
                className="text-border"
                strokeDasharray={rival && !viewer.friends.includes(id) ? "4 3" : undefined}
              />
              <circle cx={x} cy={y} r="15" className="fill-bg stroke-border" stroke="currentColor" />
              <text x={x} y={y + 28} textAnchor="middle" className="fill-muted" fontSize="10">
                {person?.handle ?? id}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="20" className="fill-fg" />
        <text x={cx} y={cy + 3} textAnchor="middle" className="fill-bg" fontSize="10">
          you
        </text>
      </svg>
      )}
      <p className="text-sm text-muted">
        {viewer.clanId ? CLAN_MAP[viewer.clanId]?.name : "No clan"}. The walk restarts at this player, so
        mass stays with clanmates, friends, and rivals instead of drifting across the whole network.
      </p>
    </section>
  );
}

export function RankerView({ result }: { result: PulseResult }) {
  const weights = usePulse((s) => s.weights);
  const setWeight = usePulse((s) => s.setWeight);
  const resetWeights = usePulse((s) => s.resetWeights);
  const token = usePulse((s) => s.token);
  const portal = usePulse((s) => s.portal);
  const setToken = usePulse((s) => s.setToken);
  const setPortal = usePulse((s) => s.setPortal);
  const setGateNote = usePulse((s) => s.setGateNote);
  const gateNote = usePulse((s) => s.gateNote);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  async function authorize() {
    setBusy(true);
    const response = await issueOperatorToken({
      data: { portal, grant: "pulse-preview", passphrase: passphrase || undefined },
    });
    setBusy(false);
    if (!response.ok) {
      setToken(null);
      setGateNote(`Authorize refused (${response.status}). ${response.error}`);
      return;
    }
    setToken(response.token);
    setGateNote(`Operator token verified for ${portal}. It expires in 10 minutes and stays in this tab.`);
  }

  async function publish(authorization: string) {
    setBusy(true);
    const response = await publishWeights({ data: { authorization, portal, weights } });
    setBusy(false);
    if (!response.ok) {
      setGateNote(`Publish refused (${response.status}). Global weights were not changed.`);
      return;
    }
    setGateNote("Global weights published. This console was already simulating them.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">Multi-action ranker</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Click relevance is the sum of weight × P(action). A paid boost multiplies exposure after that,
            and it does not reorder clicks. P(action) is a cold-start logistic on game fit, region, graph
            proximity, rank gap, and sponsor match. Impossible actions for a content type stay at zero.
          </p>
        </div>
        <p className="rounded-3xl border border-border p-4 font-mono text-xs leading-relaxed text-muted">
          click = Σ wₐ · P(a | player, item)
          <br />
          exposure = click × B, B ∈ {"{1, 3}"}
          <br />
          3× is a distribution opportunity, not a change in click order.
        </p>
        <ul className="grid gap-4">
          {ACTIONS.map((action) => (
            <li key={action.id}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`w-${action.id}`} className="text-sm">
                  {action.label}
                </label>
                <span className="font-mono text-xs tabular-nums text-muted">{weights[action.id].toFixed(2)}</span>
              </div>
              <Slider.Root
                id={`w-${action.id}`}
                className="relative mt-2 flex h-11 touch-none items-center"
                min={0}
                max={2}
                step={0.05}
                value={[weights[action.id]]}
                onValueChange={([value]) => setWeight(action.id, value ?? 0)}
              >
                <Slider.Track className="relative h-1 grow rounded-sm bg-bg-subtle">
                  <Slider.Range className="absolute h-1 rounded-sm bg-fg" />
                </Slider.Track>
                <Slider.Thumb
                  className="block size-6 rounded-full border border-border bg-fg"
                  aria-label={action.label}
                />
              </Slider.Root>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={resetWeights}>Reset weights</Button>
        </div>
        <section className="grid gap-3 rounded-3xl border border-border p-4">
          <h3 className="text-sm font-medium">Operator gate</h3>
          <p className="text-sm leading-relaxed text-muted">
            Writes from koba.games or developers.koba.games need a stateless token before global weights
            or the boost ledger can change. Sliders stay a local simulation until you publish.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["koba.games", "developers.koba.games"] as PortalId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={portal === id}
                onClick={() => setPortal(id)}
                className={`min-h-11 rounded-lg border px-3 text-sm ${
                  portal === id ? "border-fg bg-fg text-bg" : "border-border text-muted"
                }`}
              >
                {id}
              </button>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="font-mono text-xs text-faint">Operator passphrase, if this deployment requires one</span>
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="off"
              className="h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void authorize()} disabled={busy}>
              Authorize this console
            </Button>
            <Button onClick={() => void publish(token ? `Bearer ${token}` : "")} disabled={busy}>
              Publish weights
            </Button>
            <Button variant="quiet" onClick={() => void publish("")} disabled={busy}>
              Call without token
            </Button>
          </div>
          <p role="status" className="text-sm text-muted">
            {token ? `Verified for ${portal}.` : "No operator token."} {gateNote}
          </p>
        </section>
      </div>
      <aside className="rounded-3xl border border-border bg-bg-elevated p-4">
        <h3 className="text-sm font-medium">Feed reacts live</h3>
        <ol className="mt-3 grid gap-2">
          {result.feed.slice(0, 6).map((item) => (
            <li key={item.candidate.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {item.rank}. {item.candidate.title}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">{item.clickScore.toFixed(2)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">
          Raise Sponsor and a labeled flight climbs on click relevance. The exposure multiplier never
          reorders this list.
        </p>
      </aside>
    </div>
  );
}

const CHOICES: Compliance[] = ["allow", "interstitial", "drop"];

export function GateView({ result }: { result: PulseResult }) {
  const overrides = usePulse((s) => s.overrides);
  const setOverride = usePulse((s) => s.setOverride);
  const clearOverride = usePulse((s) => s.clearOverride);
  const setFocus = usePulse((s) => s.setFocus);
  const scored = new Map(result.scored.map((s) => [s.candidate.id, s]));
  const catalog = usePulse((s) => s.catalogCandidates);
  const rows = catalog.length ? catalog : CANDIDATES;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-2xl font-medium tracking-tight">Visibility gate</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Labels are issued on the staff side and only consumed here. Default is deny: an item with a drop
          or a sandbox hold never becomes eligible because it scored well. Overrides on this console are
          local, so you can watch a server disappear without the other scores moving.
        </p>
      </div>
      <ul className="grid gap-2">
        {rows.map((c) => {
          const current = overrides[c.id] ?? c.compliance;
          const row = scored.get(c.id);
          const dirty = overrides[c.id] != null && overrides[c.id] !== c.compliance;
          return (
            <li key={c.id} className="rounded-3xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" onClick={() => setFocus(c.id)} className="min-w-0 text-left">
                  <span className="font-mono text-xs text-faint">
                    {c.kind}
                    {c.gameId ? ` · ${gameName(c.gameId)}` : ""} · fraud {c.fraudRisk.toFixed(2)}
                  </span>
                  <span className="mt-1 block text-sm font-medium">{c.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {row
                      ? `Would rank #${row.counterfactualRank} if the gate were off.`
                      : "Not retrieved for this player."}{" "}
                    {c.kind === "server" && (c.sampleCount ?? 48) < 12
                      ? "Cold start. Heat and fraud shrink toward the prior until samples arrive."
                      : dirty
                        ? "Override is local."
                        : c.complianceNote}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  {CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={current === choice}
                      onClick={() => (choice === c.compliance ? clearOverride(c.id) : setOverride(c.id, choice))}
                      className={`min-h-11 rounded-lg border px-3 text-sm capitalize ${
                        current === choice ? "border-fg bg-fg text-bg" : "border-border text-muted"
                      }`}
                    >
                      {choice === "interstitial" ? "Hold" : choice}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

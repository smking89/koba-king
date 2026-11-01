import { useEffect, useMemo, useRef } from "react";
import { Discover } from "@/components/discover";
import { BehaviorView } from "@/components/behavior";
import { ExplainDialog } from "@/components/explain-dialog";
import { ClustersView, GateView, PipelineView, RankerView } from "@/components/inspect";
import { runPulse } from "@/engine/pipeline";
import { loadPulseCatalog } from "@/lib/pulse/api";
import { creditsLeft, playerById, usePulse, type ViewId } from "@/state/pulse";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "behavior", label: "Behavior" },
  { id: "pipeline", label: "Pipeline" },
  { id: "clusters", label: "Clusters" },
  { id: "ranker", label: "Ranker" },
  { id: "gate", label: "Gate" },
];

export function PulseApp({ embedded = false }: { embedded?: boolean }) {
  const view = usePulse((s) => s.view);
  const viewerId = usePulse((s) => s.viewerId);
  const query = usePulse((s) => s.query);
  const weights = usePulse((s) => s.weights);
  const boosts = usePulse((s) => s.boosts);
  const overrides = usePulse((s) => s.overrides);
  const dismissed = usePulse((s) => s.dismissed);
  const nowMs = usePulse((s) => s.nowMs);
  const spent = usePulse((s) => s.spent);
  const roster = usePulse((s) => s.roster);
  const catalogCandidates = usePulse((s) => s.catalogCandidates);
  const catalogSource = usePulse((s) => s.catalogSource);
  const token = usePulse((s) => s.token);
  const portal = usePulse((s) => s.portal);
  const gateNote = usePulse((s) => s.gateNote);
  const setView = usePulse((s) => s.setView);
  const setViewer = usePulse((s) => s.setViewer);
  const setQuery = usePulse((s) => s.setQuery);
  const setNow = usePulse((s) => s.setNow);
  const setGateNote = usePulse((s) => s.setGateNote);
  const hydrateCatalog = usePulse((s) => s.hydrateCatalog);
  const reset = usePulse((s) => s.reset);
  const searchRef = useRef<HTMLInputElement>(null);
  const people = roster;
  const featured = people.slice(0, 4).map((person) => person.id);

  const result = useMemo(
    () =>
      runPulse({
        viewerId,
        query,
        weights,
        boosts,
        overrides,
        dismissed,
        nowMs,
        corpus: roster.length ? { players: roster, candidates: catalogCandidates } : undefined,
      }),
    [viewerId, query, weights, boosts, overrides, dismissed, nowMs, roster, catalogCandidates],
  );

  useEffect(() => {
    let cancelled = false;
    loadPulseCatalog()
      .then((catalog) => {
        if (!cancelled) hydrateCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setGateNote("The catalog could not be loaded. The database did not answer.");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateCatalog, setGateNote]);

  useEffect(() => {
    const live = () => Object.values(usePulse.getState().boosts).some((t) => t > Date.now());
    if (!live()) return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const now = Date.now();
      setNow(now);
      if (!Object.values(usePulse.getState().boosts).some((t) => t > now)) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [boosts, setNow]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const viewer = playerById(people, viewerId);
  const credits = creditsLeft(!!viewer?.astro, viewerId, spent);

  return (
    <div className={embedded ? "text-fg" : "min-h-dvh bg-bg text-fg"}>
      <header className={embedded ? "" : "border-b border-border"}>
        <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 px-4 py-5">
          {embedded ? null : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-faint">KOBA</p>
              <h1 className="text-3xl font-medium tracking-tight">Pulse</h1>
              <p className="mt-1 max-w-xl text-sm text-muted">
                Discovery for one identity across survival, tactical, and ranked games.
              </p>
              <p className="mt-2 font-mono text-xs text-faint">
                {catalogSource === "database" ? "Catalog: database" : "Catalog: unavailable"}
                {token ? ` · Operator ${portal}` : " · Operator locked"}
              </p>
              {gateNote ? (
                <p role="status" className="mt-2 max-w-xl text-sm text-muted">
                  {gateNote}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <p className="font-mono text-xs text-muted">
                {credits} credit{credits === 1 ? "" : "s"}
              </p>
              <button type="button" onClick={reset} className="min-h-11 text-sm text-muted hover:text-fg">
                Reset
              </button>
            </div>
          </div>
          )}

          <label className="grid gap-1">
            <span className="font-mono text-xs text-faint">Search the catalog</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try palworld, valorant, harbor"
              className="h-11 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg placeholder:text-faint"
            />
          </label>

          <div className="flex min-w-0 gap-2 overflow-x-auto">
            {featured.map((id) => {
              const person = playerById(people, id);
              if (!person) return null;
              const on = viewerId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewer(id)}
                  aria-pressed={on}
                  className={`min-h-11 shrink-0 rounded-lg border px-3 text-left ${
                    on ? "border-fg bg-fg text-bg" : "border-border text-fg"
                  }`}
                >
                  <span className="block text-sm font-medium">{person.name}</span>
                  <span className={`block font-mono text-xs ${on ? "text-bg/70" : "text-faint"}`}>
                    {person.region} · {person.score}
                  </span>
                </button>
              );
            })}
            <label className="min-h-11 shrink-0">
              <select
                aria-label="More players"
                value={featured.includes(viewerId) ? "" : viewerId}
                onChange={(event) => {
                  if (event.target.value) setViewer(event.target.value);
                }}
                className="h-11 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg"
              >
                <option value="">More players</option>
                {people.filter((p) => !featured.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.region}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <nav className="flex min-w-0 gap-1 overflow-x-auto" aria-label="Sections">
            {VIEWS.map((item) => {
              const on = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-current={on ? "page" : undefined}
                  className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${
                    on ? "border-fg text-fg" : "border-transparent text-muted"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6">
        {view === "discover" ? <Discover result={result} /> : null}
        {view === "behavior" ? <BehaviorView people={people} /> : null}
        {view === "pipeline" ? <PipelineView result={result} /> : null}
        {view === "clusters" ? <ClustersView result={result} /> : null}
        {view === "ranker" ? <RankerView result={result} /> : null}
        {view === "gate" ? <GateView result={result} /> : null}
      </main>
      <ExplainDialog result={result} />
    </div>
  );
}

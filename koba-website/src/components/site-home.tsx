import { useState } from "react";
import { Chip, Panel } from "@/components/ui";
import { clanTier, type DisciplineStatus, type Identity } from "@/platform/engine";
import { usePlatform } from "@/platform/store";

type Page = "home" | "rivals" | "challenges" | "clans" | "profile";

const PAGES: { id: Page; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "rivals", label: "Rivals" },
  { id: "challenges", label: "Challenges" },
  { id: "clans", label: "Clans" },
  { id: "profile", label: "Profile" },
];

const STATUS: Record<DisciplineStatus, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  clear: { label: "Clear", tone: "ok" },
  warned: { label: "Warned", tone: "warn" },
  struck: { label: "Struck", tone: "danger" },
  under_review: { label: "Under review", tone: "danger" },
  blacklisted: { label: "Blacklisted", tone: "danger" },
};

export function SiteHome() {
  const identities = usePlatform((s) => s.identities);
  const clans = usePlatform((s) => s.clans);
  const feed = usePlatform((s) => s.feed);
  const audit = usePlatform((s) => s.audit);
  const viewerId = usePlatform((s) => s.viewerId);
  const setViewer = usePlatform((s) => s.setViewer);
  const run = usePlatform((s) => s.run);
  const [page, setPage] = useState<Page>("home");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");

  const viewer = identities.find((identity) => identity.id === viewerId) ?? identities[0];
  if (!viewer) return null;

  const needle = query.trim().toLowerCase();
  const people = identities
    .filter((identity) => {
      if (!needle) return true;
      return identity.name.toLowerCase().includes(needle) || identity.handle.includes(needle) || identity.id.includes(needle);
    })
    .slice()
    .sort((a, b) => b.score - a.score);

  const act = (line: string) => {
    const embed = run(line);
    setNote(`${embed.title}. ${embed.description}`);
    setPage("home");
  };

  const clanName = (id?: string) => clans.find((clan) => clan.id === id)?.name ?? "Unaffiliated";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-faint">koba.games</p>
          <h2 className="text-2xl font-medium tracking-tight">Competitive identity</h2>
        </div>
        <nav className="flex gap-1 overflow-x-auto" aria-label="Site">
          {PAGES.map((item) => {
            const on = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                aria-current={on ? "page" : undefined}
                className={`min-h-11 shrink-0 border-b-2 px-3 text-sm ${on ? "border-fg text-fg" : "border-transparent text-muted"}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {note ? <p className="rounded-lg border border-border bg-bg-elevated px-3 py-3 text-sm text-muted">{note}</p> : null}

      {page === "home" ? (
        <Home
          viewer={viewer}
          feed={feed}
          query={query}
          setQuery={setQuery}
          people={people}
          clanName={clanName}
          onOpen={(id) => {
            setViewer(id);
            setPage("profile");
          }}
        />
      ) : null}

      {page === "rivals" ? <Rivals viewer={viewer} identities={identities} onChallenge={(handle) => act(`/challenge ${handle}`)} /> : null}

      {page === "challenges" ? (
        <Challenges
          viewer={viewer}
          identities={identities}
          clans={clans}
          onWar={(name) => act(`/war declare ${name}`)}
          onStandDown={() => act("/war end")}
          onChallenge={(handle) => act(`/challenge ${handle}`)}
        />
      ) : null}

      {page === "clans" ? (
        <Clans
          clans={clans}
          identities={identities}
          onOpen={(id) => {
            setViewer(id);
            setPage("profile");
          }}
        />
      ) : null}

      {page === "profile" ? <Profile viewer={viewer} clanName={clanName(viewer.clanId)} audit={audit[0]} /> : null}
    </div>
  );
}

function Home({
  viewer,
  feed,
  query,
  setQuery,
  people,
  clanName,
  onOpen,
}: {
  viewer: Identity;
  feed: { id: string; title: string; detail: string; tone: string }[];
  query: string;
  setQuery: (value: string) => void;
  people: Identity[];
  clanName: (id?: string) => string;
  onOpen: (id: string) => void;
}) {
  const status = STATUS[viewer.status];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <Panel title={viewer.name} action={<Chip tone={status.tone}>{status.label}</Chip>}>
            <p className="font-mono text-xs text-cyan">{viewer.id}</p>
            <p className="mt-2 text-4xl font-medium tabular-nums tracking-tight">{viewer.score}</p>
            <p className={`mt-1 font-mono text-xs ${viewer.scoreDelta >= 0 ? "text-ok" : "text-danger"}`}>
              {viewer.scoreDelta >= 0 ? "+" : ""}
              {viewer.scoreDelta} this session · {viewer.form}
            </p>
            <p className="mt-3 text-sm text-muted">{clanName(viewer.clanId)}</p>
            <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted">
              No form history yet. Sessions from a connected server will draw this.
            </p>
          </Panel>
        </div>
        <div className="min-w-0 lg:col-span-3">
          <Panel title="Live mutation feed">
            <ul className="grid">
              {feed.map((row) => (
                <li key={row.id} className="border-b border-border py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm">{row.title}</p>
                    <Chip tone={row.tone === "gold" ? "warn" : row.tone === "cyan" ? "cyan" : row.tone === "ok" ? "ok" : row.tone === "danger" ? "danger" : "neutral"}>
                      {row.tone}
                    </Chip>
                  </div>
                  <p className="mt-1 text-sm text-muted">{row.detail}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <label className="grid gap-1">
        <span className="font-mono text-xs text-faint">Search identities</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, handle, or KOBAid"
          className="h-11 rounded-lg border border-border bg-bg-elevated px-3 text-sm placeholder:text-faint"
        />
      </label>

      <Panel title="Ladder" action={<span className="font-mono text-xs text-faint">{people.length}</span>}>
        <ul className="grid">
          {people.map((identity, index) => (
            <li key={identity.id} className="border-b border-border last:border-b-0">
              <button type="button" onClick={() => onOpen(identity.id)} className="flex min-h-11 w-full items-baseline justify-between gap-3 py-2 text-left">
                <span className="min-w-0">
                  <span className="font-mono text-xs text-faint">{String(index + 1).padStart(2, "0")}</span>
                  <span className="ml-2 text-sm">{identity.name}</span>
                  <span className="mt-0.5 block text-sm text-muted sm:mt-0 sm:ml-8 sm:inline">{clanName(identity.clanId)}</span>
                </span>
                <span className="font-mono text-xs tabular-nums">{identity.score}</span>
              </button>
            </li>
          ))}
          {people.length === 0 ? <li className="py-3 text-sm text-muted">No identity matches that search.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

function Rivals({
  viewer,
  identities,
  onChallenge,
}: {
  viewer: Identity;
  identities: Identity[];
  onChallenge: (handle: string) => void;
}) {
  const rivals = viewer.rivals
    .map((id) => identities.find((identity) => identity.id === id))
    .filter((identity): identity is Identity => Boolean(identity));
  return (
    <Panel title="Rivals">
      {rivals.length === 0 ? <p className="text-sm text-muted">No rivals on this KOBAid.</p> : null}
      <ul className="grid gap-4">
        {rivals.map((rival) => {
          const gap = rival.score - viewer.score;
          const span = Math.max(viewer.score, rival.score, 1);
          return (
            <li key={rival.id} className="border-b border-border pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm">{rival.name}</p>
                <p className="font-mono text-xs tabular-nums text-muted">{gap > 0 ? `ahead ${gap}` : gap < 0 ? `behind ${-gap}` : "even"}</p>
              </div>
              <div className="mt-2 grid gap-1">
                <Bar label="You" value={viewer.score / span} />
                <Bar label={rival.handle} value={rival.score / span} />
              </div>
              <p className="mt-2 text-sm text-muted">
                {gap > 0 ? `${gap} points closes the gap on ${rival.handle}.` : gap < 0 ? `You lead ${rival.handle} by ${-gap}.` : "Scores are level."}
              </p>
              <button type="button" onClick={() => onChallenge(rival.handle)} className="mt-2 min-h-11 text-sm text-fg">
                Challenge {rival.handle}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="font-mono text-xs text-faint">{label}</span>
      <span className="h-1 overflow-hidden rounded-sm bg-bg-subtle">
        <span className="block h-1 bg-fg" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </span>
    </div>
  );
}

function Challenges({
  viewer,
  identities,
  clans,
  onWar,
  onStandDown,
  onChallenge,
}: {
  viewer: Identity;
  identities: Identity[];
  clans: { id: string; name: string; memberIds: string[]; atWarWith?: string }[];
  onWar: (name: string) => void;
  onStandDown: () => void;
  onChallenge: (handle: string) => void;
}) {
  const mine = clans.find((clan) => clan.id === viewer.clanId);
  const foe = mine?.atWarWith ? clans.find((clan) => clan.id === mine.atWarWith) : undefined;
  const others = clans.filter((clan) => clan.id !== mine?.id);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Clan war" action={foe ? <Chip tone="danger">Live</Chip> : <Chip>Quiet</Chip>}>
        {!mine ? <p className="text-sm text-muted">This KOBAid is not on a roster. Wars are clan actions.</p> : null}
        {mine && !foe ? <p className="text-sm text-muted">{mine.name} is not at war.</p> : null}
        {mine && foe ? (
          <div>
            <p className="text-sm">
              {mine.name} against {foe.name}
            </p>
            <button type="button" onClick={onStandDown} className="mt-3 min-h-11 text-sm">
              Stand down
            </button>
          </div>
        ) : null}
        {mine && !foe ? (
          <ul className="mt-3 grid">
            {others.map((clan) => (
              <li key={clan.id}>
                <button type="button" onClick={() => onWar(clan.name)} className="min-h-11 text-sm">
                  Declare on {clan.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
      <Panel title="Player challenges">
        <ul className="grid">
          {identities
            .filter((identity) => identity.id !== viewer.id)
            .map((identity) => (
              <li key={identity.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <span className="min-w-0">
                  <span className="block text-sm">{identity.name}</span>
                  <span className="font-mono text-xs text-faint">{identity.score}</span>
                </span>
                <button type="button" onClick={() => onChallenge(identity.handle)} className="min-h-11 shrink-0 text-sm">
                  Challenge
                </button>
              </li>
            ))}
        </ul>
      </Panel>
    </div>
  );
}

function Clans({
  clans,
  identities,
  onOpen,
}: {
  clans: { id: string; name: string; memberIds: string[]; atWarWith?: string }[];
  identities: Identity[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {clans.map((clan) => {
        const foe = clan.atWarWith ? clans.find((item) => item.id === clan.atWarWith) : undefined;
        return (
          <Panel key={clan.id} title={clan.name} action={<Chip tone="cyan">{clanTier(clan.memberIds.length)}</Chip>}>
            <p className="text-sm text-muted">{foe ? `At war with ${foe.name}` : "No active war"}</p>
            <ul className="mt-3 grid">
              {clan.memberIds.map((id) => {
                const member = identities.find((identity) => identity.id === id);
                if (!member) return null;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onOpen(id)} className="flex min-h-11 w-full items-baseline justify-between gap-3 text-left">
                      <span className="text-sm">{member.name}</span>
                      <span className="font-mono text-xs tabular-nums text-muted">{member.score}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function Profile({
  viewer,
  clanName,
  audit,
}: {
  viewer: Identity;
  clanName: string;
  audit?: { action: string; detail: string };
}) {
  const status = STATUS[viewer.status];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Identity" action={<Chip tone={status.tone}>{status.label}</Chip>}>
        <dl className="grid gap-2 text-sm">
          <Row label="KOBAid" value={viewer.id} />
          <Row label="Handle" value={viewer.handle} />
          <Row label="Steam" value={viewer.steamId ?? "Not linked"} />
          <Row label="Discord" value={viewer.discordId ?? "Not linked"} />
          <Row label="Clan" value={clanName} />
          <Row label="Warnings" value={String(viewer.warnings)} />
          <Row label="Strikes" value={`${viewer.strikes}/3`} />
        </dl>
        <p className="mt-3 text-sm text-muted">{viewer.badges.length ? viewer.badges.join(" · ") : "No roles"}</p>
        {audit ? (
          <p className="mt-3 text-sm text-muted">
            Latest audit: {audit.action} · {audit.detail}
          </p>
        ) : null}
      </Panel>
      <Panel title="Homes" action={<span className="font-mono text-xs text-faint">{viewer.homes.length}/3</span>}>
        {viewer.homes.length === 0 ? <p className="text-sm text-muted">No homes set. The cap is 3.</p> : null}
        <ul className="grid gap-3">
          {viewer.homes.map((home) => (
            <li key={home.name}>
              <p className="text-sm">{home.name}</p>
              <p className="font-mono text-xs text-muted">
                {home.x.toFixed(1)}, {home.y.toFixed(1)}, {home.z.toFixed(1)}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}

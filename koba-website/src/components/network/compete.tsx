import { Button, Chip } from "@/components/ui";
import { clanTier, type Identity } from "@/platform/engine";
import { BOUNTIES } from "@/site/catalog";

export function CompetePage({
  viewer,
  identities,
  clans,
  bounties,
  onChallenge,
  onWar,
  onStandDown,
  onBounty,
  onDiscover,
}: {
  viewer: Identity;
  identities: Identity[];
  clans: { id: string; name: string; memberIds: string[]; atWarWith?: string }[];
  bounties: string[];
  onChallenge: (handle: string) => void;
  onWar: (name: string) => void;
  onStandDown: () => void;
  onBounty: (id: string) => void;
  onDiscover: (tab?: string) => void;
}) {
  const rivals = viewer.rivals
    .map((id) => identities.find((identity) => identity.id === id))
    .filter((identity): identity is Identity => Boolean(identity));
  const mine = clans.find((clan) => clan.id === viewer.clanId);
  const foe = mine?.atWarWith ? clans.find((clan) => clan.id === mine.atWarWith) : undefined;
  const others = clans.filter((clan) => clan.id !== mine?.id);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Beat the people ahead of you</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">Rivals, bounties, clan wars. A confirmed call shows on your activity.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-bg-elevated p-4">
          <h2 className="text-sm font-medium">Rivals</h2>
          {rivals.length === 0 ? (
            <div className="mt-3 flex items-start justify-between gap-3">
              <p className="text-sm text-muted">No rivals on this identity yet.</p>
              <Button className="shrink-0 whitespace-nowrap" onClick={() => onDiscover()}>
                Find players
              </Button>
            </div>
          ) : null}
          <ul className="mt-2 grid gap-4">
            {rivals.map((rival) => {
              const gap = rival.score - viewer.score;
              const span = Math.max(viewer.score, rival.score, 1);
              return (
                <li key={rival.id} className="border-b border-border pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm">{rival.name}</p>
                    <p className="font-mono text-xs tabular-nums text-muted">{gap > 0 ? `ahead ${gap}` : gap < 0 ? `behind ${-gap}` : "even"}</p>
                  </div>
                  <div className="mt-2 grid gap-1">
                    <Bar label="You" value={viewer.score / span} />
                    <Bar label={rival.handle} value={rival.score / span} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {gap > 0 ? `${gap} points closes it.` : gap < 0 ? `You lead by ${-gap}.` : "Scores are level."}
                  </p>
                  <Button className="mt-2" variant="primary" onClick={() => onChallenge(rival.handle)}>
                    Challenge {rival.handle}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-3xl border border-border bg-bg-elevated p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">Clan war</h2>
            {mine ? <Chip tone="cyan">{clanTier(mine.memberIds.length)}</Chip> : null}
          </div>
          {!mine ? (
            <div className="mt-3 flex items-start justify-between gap-3">
              <p className="text-sm text-muted">This identity is not on a roster.</p>
              <Button className="shrink-0 whitespace-nowrap" onClick={() => onDiscover("clans")}>
                Find a clan
              </Button>
            </div>
          ) : null}
          {mine && !foe ? <p className="mt-3 text-sm text-muted">{mine.name} is not at war.</p> : null}
          {mine && foe ? (
            <div className="mt-3">
              <p className="text-sm">
                {mine.name} against {foe.name}
              </p>
              <Button className="mt-3" onClick={onStandDown}>
                Stand down
              </Button>
            </div>
          ) : null}
          {mine && !foe ? (
            <ul className="mt-3 grid gap-2">
              {others.map((clan) => (
                <li key={clan.id}>
                  <Button onClick={() => onWar(clan.name)}>Declare on {clan.name}</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section>
        <h2 className="text-sm font-medium">Bounties</h2>
        {BOUNTIES.length === 0 ? (
          <div className="mt-3 flex items-start justify-between gap-3 border-y border-border py-3">
            <p className="text-sm text-muted">No live bounties yet. Staff-posted bounties will appear here.</p>
            <Button className="shrink-0 whitespace-nowrap" onClick={() => onDiscover()}>
              Find players
            </Button>
          </div>
        ) : null}
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {BOUNTIES.map((bounty) => {
            const on = bounties.includes(bounty.id);
            return (
              <article key={bounty.id} className="rounded-3xl border border-border bg-bg-elevated p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm">{bounty.title}</p>
                  <Chip tone="warn">{bounty.reward} pts</Chip>
                </div>
                <p className="mt-2 text-sm text-muted">{bounty.detail}</p>
                <p className="mt-2 font-mono text-xs text-faint">
                  {bounty.game} · {bounty.window}
                </p>
                <Button className="mt-3" variant={on ? "primary" : "ghost"} onClick={() => onBounty(bounty.id)}>
                  {on ? "Entered" : "Enter bounty"}
                </Button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="font-mono text-xs text-faint">{label}</span>
      <span className="h-1 overflow-hidden rounded-sm bg-bg-subtle">
        <span className="block h-1 bg-ok" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </span>
    </div>
  );
}

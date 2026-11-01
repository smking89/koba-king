import type { Identity } from "@/platform/engine";
import { BadgeRow } from "@/components/network/badges";
import { BadgeStrip } from "@/components/network/achievements";
import { ChipRow } from "@/components/ui";
import { GameSelect } from "@/components/network/game-select";
import { NAME_VERIFIED } from "@/site/badges";
import { useResolvedBadges } from "@/components/network/badge-state";
import { scoreFor, type Region } from "@/site/catalog";
import { gameName } from "@/site/games";
import { PUBLIC_REGIONS, regionLabel } from "@/site/regions";
import type { GameFilter } from "@/site/ui";

export function RankingsPage({
  identities,
  viewerId,
  game,
  region,
  follows,
  clanIds,
  onGame,
  onRegion,
  onOpen,
}: {
  identities: Identity[];
  viewerId: string;
  game: GameFilter;
  region: "all" | Region;
  follows: string[];
  clanIds: string[];
  onGame: (game: GameFilter) => void;
  onRegion: (region: "all" | Region) => void;
  onOpen: (id: string) => void;
}) {
  const boardGame = game === "DAYZ" ? "dayz" : "all";
  const rows = identities
    .filter((identity) => region === "all" || identity.region === region)
    .map((identity) => ({ identity, score: scoreFor(identity.id, identity.score, boardGame) }))
    .sort((a, b) => b.score - a.score);
  const badgeMap = useResolvedBadges(identities);
  const regions = [{ id: "all" as const, label: "Global" }, ...PUBLIC_REGIONS.map((item) => ({ id: item.id, label: item.label }))];

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="grid gap-1">
          <p className="text-xs text-muted">Game</p>
          <GameSelect
            value={game}
            onChange={(id) => onGame(id as GameFilter)}
            label="Game"
            allLabel="All games"
            className="w-full sm:max-w-xs"
          />
        </div>
        <div className="grid gap-1">
          <p className="text-xs text-muted">Region</p>
          <ChipRow label="Region" value={region} options={regions} onChange={onRegion} />
        </div>
      </div>
      {game === "all" ? null : <p className="text-sm text-muted">{gameName(game)}. The number is still the one KOBAid score.</p>}
      <ol>
        {rows.map((row, index) => {
          const you = row.identity.id === viewerId;
          const result = badgeMap[row.identity.id];
          return (
            <li key={row.identity.id} className={you ? "rounded-2xl border border-violet/40 bg-violet/10 px-2" : "border-b border-border"}>
              <div className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 py-3 ${you ? "text-fg" : ""}`}>
                <span className="pt-1 font-mono text-xs text-muted">{index + 1}</span>
                <span className="min-w-0">
                  <button type="button" onClick={() => onOpen(row.identity.id)} className="flex items-center gap-2 text-left">
                    <span className="truncate text-sm">{row.identity.name}</span>
                    {result?.verified ? <BadgeRow pins={[NAME_VERIFIED]} size={18} /> : null}
                  </button>
                  <span className="block text-xs text-muted">
                    @{row.identity.handle} · {regionLabel(row.identity.region)}
                    {follows.includes(row.identity.id) ? " · friend" : ""}
                    {clanIds.includes(row.identity.id) ? " · clan" : ""}
                  </span>
                  <span className="mt-2 block">
                    <BadgeStrip kobaId={row.identity.id} limit={4} />
                  </span>
                </span>
                <span className="pt-1 font-mono text-sm">{row.score.toLocaleString("en-US")}</span>
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="py-3 text-sm text-muted">No scores on that edge yet.</li> : null}
      </ol>
    </div>
  );
}
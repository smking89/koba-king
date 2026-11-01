import { useState } from "react";
import { RankCrest } from "@/components/network/badges";
import { BadgeGrid, BadgeStrip } from "@/components/network/achievements";
import { GameSelect } from "@/components/network/game-select";
import { useResolvedBadges } from "@/components/network/badge-state";
import { CountUp } from "@/components/network/shared";
import { ProfileWear } from "@/components/network/shop";
import type { DisciplineStatus, Identity } from "@/platform/engine";
import { usePlatform } from "@/platform/store";
import { useSite } from "@/site/ui";
import type { AstroAccount } from "@/site/astro";
import { titlesPlayed } from "@/site/meters";
import { gameIcon, gameName } from "@/site/games";
import { LISTINGS, scoreFor } from "@/site/catalog";
import { rankFor } from "@/site/ranks";

const STATUS: Record<DisciplineStatus, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  clear: { label: "Clear", tone: "ok" },
  warned: { label: "Warned", tone: "warn" },
  struck: { label: "Struck", tone: "danger" },
  under_review: { label: "Under review", tone: "danger" },
  blacklisted: { label: "Blacklisted", tone: "danger" },
};

export function ProfilePage({
  viewer,
  account,
  rank,
  clanName,
  followed,
  onFollow,
  self,
  equippedMotion,
}: {
  viewer: Identity;
  account: AstroAccount;
  rank: number;
  clanName: string;
  followed: boolean;
  onFollow: () => void;
  self: boolean;
  equippedMotion?: string | null;
}) {
  const [game, setGame] = useState("RUST_CONSOLE");
  const xp = viewer.xp ?? viewer.score;
  const pointRows = Object.entries(viewer.points ?? {});
  const pointTotal = pointRows.reduce((sum, [, value]) => sum + value, 0);
  const follows = useSite((s) => s.follows);
  const everyone = usePlatform((s) => s.identities);
  const friends = self ? everyone.filter((identity) => follows.includes(identity.id)).slice(0, 3) : [];
  const status = STATUS[viewer.status];
  const shown = game === "DAYZ" ? scoreFor(viewer.id, viewer.score, "dayz") : game === "RUST_CONSOLE" || game === "RUST" ? scoreFor(viewer.id, viewer.score, "rust") : viewer.score;
  const compared = useResolvedBadges([viewer, ...friends]);
  const badges = compared[viewer.id];
  const recent = LISTINGS.find((listing) => listing.region === viewer.region) ?? LISTINGS[0];
  const hours = viewer.hours ?? 0;
  const titles = titlesPlayed(viewer.gameHours);
  const rankTierForScore = rankFor(viewer.score);
  const rankName = rankTierForScore.name;
  const rankNext = rankTierForScore.next;

  return (
    <div className="grid gap-5">
      <ProfileWear
        name={viewer.name}
        handle={`@${viewer.handle}`}
        motion={equippedMotion ?? undefined}
        verified={Boolean(badges?.verified)}
        badges={<BadgeStrip kobaId={viewer.id} limit={5} />}
        avatarUrl={viewer.avatarUrl}
        bannerUrl={viewer.bannerUrl}
      />
      {self ? null : (
        <div className="flex items-center justify-end gap-4">
          <button type="button" onClick={onFollow} className="min-h-11 text-sm">
            {followed ? "Following" : "Follow"}
          </button>
        </div>
      )}

      <section aria-label="Account details" className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 text-xs font-medium">
          {viewer.accountType === "business" ? "Business" : "Player"} account
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 text-xs font-medium">
          {viewer.platform === "console" ? "Console" : viewer.platform === "pc" ? "PC" : "PC + Console"}
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 text-xs text-muted">
          {viewer.region}
        </span>
        {(viewer.interests ?? []).length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {(viewer.interests ?? []).map((tag) => (
              <span key={tag} className="inline-flex h-8 items-center rounded-full bg-bg-subtle px-3 text-xs text-muted">
                #{tag}
              </span>
            ))}
          </span>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border bg-bg-elevated p-4">
        <h2 className="font-mono text-xs tracking-widest text-faint uppercase">Trust</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Standing</dt>
            <dd className="mt-1">{account.verified ? "Verified" : "Unverified"} · {status.label}</dd>
          </div>
          <div>
            <dt className="text-muted">Strikes</dt>
            <dd className="mt-1 font-mono text-xs">{viewer.strikes}</dd>
          </div>
          <div>
            <dt className="text-muted">Hours</dt>
            <dd className="mt-1 font-mono text-xs">{Math.floor(hours)}</dd>
          </div>
          <div>
            <dt className="text-muted">Clan</dt>
            <dd className="mt-1">{clanName}</dd>
          </div>
          <div>
            <dt className="text-muted">Recent server</dt>
            <dd className="mt-1">{recent?.name ?? "No server yet"}</dd>
          </div>
          <div>
            <dt className="text-muted">Seller rating</dt>
            <dd className="mt-1 font-mono text-xs text-muted">No sales yet</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-3xl border border-border bg-bg-elevated p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-xs text-faint">XP · rank #{rank}</p>
          </div>
          <div className="mt-3 flex items-center gap-3">
            {/* Rank crests use the same art as the player badge grid. Unlike a
                locked badge, the current tier is already held, so it shows in
                full colour. */}
            <span className="shrink-0">
              <RankCrest score={viewer.score} size={76} />
            </span>
            <div className="min-w-0">
              <p className="text-4xl font-medium tabular-nums tracking-tight">
                <CountUp key={viewer.id} value={shown} from={shown - Math.max(0, viewer.scoreDelta)} />
              </p>
              <p className="mt-1 text-xs text-muted">
                {rankName}
                {rankNext ? ` · ${rankNext.name} at ${rankNext.at.toLocaleString("en-US")}` : " · top rank"}
              </p>
            </div>
          </div>
          <p className={`mt-1 font-mono text-xs text-ok ${viewer.scoreDelta > 0 ? "xp-gain" : ""}`}>
            {viewer.scoreDelta > 0 ? `+${viewer.scoreDelta} XP this session` : "XP does not drop"} · {viewer.form}
          </p>
          <GameSelect value={game} onChange={setGame} className="mt-4 max-w-xs" />
          <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted">
            No form history yet. Sessions from a connected server will draw this.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-bg-elevated p-4 lg:col-span-3">
          <h2 className="text-sm font-medium">Badges</h2>
          <p className="mt-1 text-sm text-muted">Locked badges stay greyed out until earned.</p>
          <div className="mt-3">
            <BadgeGrid kobaId={viewer.id} />
          </div>
        </section>
      </div>

      <section className="grid gap-4 rounded-3xl border border-border bg-bg-elevated p-4 sm:grid-cols-3">
        <div>
          <p className="text-sm">XP</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{xp.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted">Global. Stays on the KOBAid. It is not spent and a server wipe does not touch it.</p>
        </div>
        <div>
          <p className="text-sm">Points</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{pointTotal.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted">
            {pointRows.length > 0 ? pointRows.map(([server, value]) => `${server} ${value}`).join(" · ") : "None on a server yet."} Spent in that server's shop. A map wipe can clear them.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-bg-elevated p-4">
        <p className="text-sm">Verified hours</p>
        <p className="mt-1 text-xs text-muted">
          {Math.floor(hours)} on record. A packet counts only when the server sends the minutes, and only up to 3 hours at a time.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-bg-elevated p-4">
        <p className="text-sm">Games tried</p>
        <p className="mt-1 text-xs text-muted">
          {titles} with at least 5 hours. A title counts only after the hours are on that game.
        </p>
        {Object.keys(viewer.gameHours ?? {}).length === 0 ? (
          <p className="mt-1 text-xs text-muted">No title has hours yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {Object.entries(viewer.gameHours ?? {}).map(([id, value]) => (
              <span key={id} className="flex items-center gap-1.5 text-xs text-muted">
                {gameIcon(id) ? <img src={gameIcon(id)} alt="" className="h-5 w-5 rounded-[5px] object-contain" /> : null}
                {gameName(id)} {Math.floor(value)}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-bg-elevated p-4">
          <h2 className="text-sm font-medium">Linked</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <Row label="Discord" value={viewer.discordId ?? "Not linked"} />
            <Row label="Strikes" value={`${viewer.strikes}/3`} />
          </dl>
        </section>
      </div>
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

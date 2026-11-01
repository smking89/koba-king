import { useEffect, useState } from "react";
import { loadProfileBadges } from "@/lib/badges/api";
import type { BadgeView } from "@/lib/badges/badges.server";
import { badgeArt } from "@/site/badge-art";
import { useBadgeVersion } from "@/components/network/badge-events";

function useProfileBadges(kobaId: string) {
  const [badges, setBadges] = useState<BadgeView[] | null>(null);
  const version = useBadgeVersion();
  useEffect(() => {
    let cancelled = false;
    setBadges(null);
    loadProfileBadges({ data: { kobaId } }).then((result) => {
      if (!cancelled) setBadges(result);
    });
    return () => {
      cancelled = true;
    };
  }, [kobaId, version]);
  return badges;
}

export function useUnlockedBadgeCount(kobaId: string): number {
  const badges = useProfileBadges(kobaId);
  return badges?.filter((badge) => badge.unlocked).length ?? 0;
}

function BadgeMedal({ badge, size = 64 }: { badge: BadgeView; size?: number }) {
  const art = badgeArt(badge.badgeId);
  return (
    <span className="badge-medal grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <img
        src={art}
        alt=""
        className={`badge-art ${badge.unlocked ? "" : "is-locked"}`}
        draggable={false}
      />
    </span>
  );
}

/** Compact unlocked-only row for dashboard/ranking spots - not the full locked/unlocked collection. */
export function BadgeStrip({ kobaId, limit = 6 }: { kobaId: string; limit?: number }) {
  const badges = useProfileBadges(kobaId);
  if (!badges) return null;
  const unlocked = badges.filter((badge) => badge.unlocked).slice(0, limit);
  if (unlocked.length === 0) return <p className="text-xs text-muted">No badges yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {unlocked.map((badge) => (
        <div key={badge.badgeId} className="flex items-center gap-1.5" title={badge.displayName}>
          <BadgeMedal badge={badge} size={24} />
          <span className="text-xs text-muted">{badge.displayName}</span>
        </div>
      ))}
    </div>
  );
}

/** Medal artwork size inside a collection tile. The tile itself is bare - no
 * card, border or panel around the art. */
const MEDAL = 84;

/** Track copy stays next to the grid so a player account reads the competitive tracks and a business the trade ones. */
const TRACKS: Record<string, { label: string; blurb: string }> = {
  rivalry: { label: "Rivalry", blurb: "Close the gap with the players ahead of you." },
  competition: { label: "Competition", blurb: "Events, brackets and finishes." },
  legend: { label: "Legend", blurb: "Confirmed play on the record." },
  merchant: { label: "Merchant", blurb: "Selling through the KOBA shop." },
  operator: { label: "Operator", blurb: "The servers you keep online." },
  patron: { label: "Patron", blurb: "What you put back into the community." },
};

export function BadgeGrid({ kobaId }: { kobaId: string }) {
  const badges = useProfileBadges(kobaId);
  const [popped, setPopped] = useState<string | null>(null);
  if (!badges) return <p className="text-sm text-muted">Loading badges…</p>;

  const unlockedCount = badges.filter((badge) => badge.unlocked).length;
  const tracks = badges.reduce<{ id: string; items: BadgeView[] }[]>((groups, badge) => {
    const id = badge.track ?? "other";
    const found = groups.find((group) => group.id === id);
    if (found) found.items.push(badge);
    else groups.push({ id, items: [badge] });
    return groups;
  }, []);

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted">
        {unlockedCount} / {badges.length} unlocked.
      </p>
      {tracks.map((track) => {
        const meta = TRACKS[track.id] ?? { label: track.id, blurb: "" };
        const earned = track.items.filter((badge) => badge.unlocked).length;
        return (
          <section key={track.id} className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-medium">{meta.label}</h3>
              <p className="font-mono text-xs tabular-nums text-muted">
                {earned} / {track.items.length}
              </p>
            </div>
            {meta.blurb ? <p className="text-xs text-muted">{meta.blurb}</p> : null}
            <ul className="mt-1 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {track.items.map((badge) => (
                <li key={badge.badgeId}>
                  <button
                    type="button"
                    onClick={() => setPopped(badge.badgeId)}
                    aria-label={`${badge.displayName}: ${badge.unlocked ? "earned" : "locked"}`}
                    className="badge-tile grid w-full justify-items-center gap-1.5 text-center"
                  >
                    <span
                      className={popped === badge.badgeId ? "badge-medal badge-rubberband" : "badge-medal"}
                      style={{ width: MEDAL, height: MEDAL }}
                      onAnimationEnd={() => setPopped((current) => (current === badge.badgeId ? null : current))}
                    >
                      <img
                        src={badgeArt(badge.badgeId)}
                        alt=""
                        className={`badge-art ${badge.unlocked ? "" : "is-locked"}`}
                        draggable={false}
                      />
                    </span>
                    <span className={`text-xs leading-tight ${badge.unlocked ? "font-semibold text-fg" : "font-medium text-muted"}`}>
                      {badge.displayName}
                    </span>
                    <span
                      className="line-clamp-3 text-[11px] leading-snug text-muted"
                      title={badge.unlocked ? undefined : badge.description}
                    >
                      {badge.unlocked ? "Earned" : badge.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

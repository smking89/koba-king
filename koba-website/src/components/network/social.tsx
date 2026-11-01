import { Fragment, useState } from "react";
import { Star, X } from "lucide-react";
import { Button, Chip } from "@/components/ui";
import { PlayerFace } from "@/components/network/shared";
import { clanTier, type Identity } from "@/platform/engine";
import type { TagView } from "@/lib/social/social.server";

type Presence = "online" | "away" | "invisible" | "offline";

const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  away: "Away",
  invisible: "Offline",
  offline: "Offline",
};

const PRESENCE_DOT: Record<Presence, string> = {
  online: "bg-ok",
  away: "bg-gold",
  invisible: "bg-faint",
  offline: "bg-faint",
};

function PresenceBadge({ status }: { status: Presence | undefined }) {
  const value = status ?? "offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${PRESENCE_DOT[value]}`} aria-hidden />
      {PRESENCE_LABEL[value]}
    </span>
  );
}

function PlatformBadges({ identity }: { identity: Identity }) {
  if (!identity.xboxId && !identity.discordId) return null;
  return (
    <span className="flex items-center gap-1" aria-label="Linked platforms">
      {identity.xboxId ? <img src="/brand/logo-xbox.svg" alt="Xbox" className="h-3.5 w-3.5 opacity-70" /> : null}
    </span>
  );
}

export function SocialPage({
  viewer,
  identities,
  clans,
  follows,
  favorites,
  aliases,
  tags,
  presence,
  onFollow,
  onFavorite,
  onAlias,
  onAddTag,
  onRemoveTag,
  onToggleTagMember,
  onOpen,
  onWhisper,
}: {
  viewer: Identity;
  identities: Identity[];
  clans: { id: string; name: string; memberIds: string[]; atWarWith?: string }[];
  follows: string[];
  favorites: string[];
  aliases: Record<string, string>;
  tags: TagView[];
  presence: Record<string, Presence>;
  onFollow: (id: string) => void;
  onFavorite: (id: string, favorite: boolean) => void;
  onAlias: (id: string, alias: string) => void;
  onAddTag: (label: string) => void;
  onRemoveTag: (tagId: string) => void;
  onToggleTagMember: (tagId: string, playerId: string, on: boolean) => void;
  onOpen: (id: string) => void;
  onWhisper: (id: string) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  const mine = clans.find((clan) => clan.id === viewer.clanId);
  const followed = identities.filter((identity) => follows.includes(identity.id));
  const favoriteFriends = followed.filter((identity) => favorites.includes(identity.id));
  const regularFriends = followed.filter((identity) => !favorites.includes(identity.id));
  const taggedIds = new Set(tags.flatMap((tag) => tag.memberIds));
  const untagged = regularFriends.filter((identity) => !taggedIds.has(identity.id));
  const suggestions = identities.filter((identity) => identity.id !== viewer.id && !follows.includes(identity.id));
  const nameFor = (identity: Identity) => aliases[identity.id] ?? identity.name;

  const FriendRow = ({ identity }: { identity: Identity }) => (
    <li className="relative border-b border-border py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <PlayerFace name={identity.name} id={identity.id} avatarUrl={identity.avatarUrl} size="sm" />
        <button type="button" onClick={() => onOpen(identity.id)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm">{nameFor(identity)}</span>
            <PlatformBadges identity={identity} />
          </span>
          <PresenceBadge status={presence[identity.id]} />
        </button>
        <button
          type="button"
          aria-label={favorites.includes(identity.id) ? "Unpin favorite" : "Pin favorite"}
          onClick={() => onFavorite(identity.id, !favorites.includes(identity.id))}
          className={favorites.includes(identity.id) ? "text-gold" : "text-faint"}
        >
          <Star size={16} fill={favorites.includes(identity.id) ? "currentColor" : "none"} />
        </button>
        <Button onClick={() => setMenuId(menuId === identity.id ? null : identity.id)}>Options</Button>
      </div>
      {menuId === identity.id ? (
        <div className="mt-2 grid gap-1 rounded-2xl border border-border bg-bg p-2">
          <button type="button" onClick={() => onWhisper(identity.id)} className="flex min-h-10 items-center rounded-xl px-2 text-left text-sm hover:bg-bg-subtle">
            Whisper
          </button>
          <button type="button" onClick={() => setCompareId(identity.id)} className="flex min-h-10 items-center rounded-xl px-2 text-left text-sm hover:bg-bg-subtle">
            Compare profiles
          </button>
          <label className="grid gap-1 px-2 py-1.5 text-sm">
            Private nickname
            <input
              defaultValue={aliases[identity.id] ?? ""}
              onBlur={(event) => onAlias(identity.id, event.target.value)}
              placeholder={identity.name}
              className="h-10 rounded-lg border border-border bg-bg-subtle px-2 text-base outline-none sm:text-sm"
            />
          </label>
          <div className="px-2 py-1.5">
            <p className="text-xs text-muted">Tags</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => {
                const on = tag.memberIds.includes(identity.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggleTagMember(tag.id, identity.id, !on)}
                    className={`h-7 rounded-full px-2.5 text-xs ${on ? "bg-fg text-bg" : "bg-bg-subtle text-muted"}`}
                  >
                    {tag.label}
                  </button>
                );
              })}
              {tags.length === 0 ? <span className="text-xs text-muted">No tags yet - add one below.</span> : null}
            </div>
          </div>
          <button type="button" onClick={() => onFollow(identity.id)} className="flex min-h-10 items-center rounded-xl px-2 text-left text-sm text-danger hover:bg-bg-subtle">
            Unfollow
          </button>
        </div>
      ) : null}
    </li>
  );

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Who you actually play with</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">People you follow, and the clan on this identity.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-bg-elevated p-4">
          {favoriteFriends.length > 0 ? (
            <>
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-gold">
                <Star size={14} fill="currentColor" /> Favorites
              </h2>
              <ul className="mt-2 grid">
                {favoriteFriends.map((identity) => (
                  <FriendRow key={identity.id} identity={identity} />
                ))}
              </ul>
            </>
          ) : null}

          {tags.map((tag) => {
            const members = followed.filter((identity) => tag.memberIds.includes(identity.id) && !favorites.includes(identity.id));
            return (
              <div key={tag.id} className="mt-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">{tag.label}</h2>
                  <button type="button" onClick={() => onRemoveTag(tag.id)} aria-label={`Delete ${tag.label}`} className="text-faint hover:text-danger">
                    <X size={14} />
                  </button>
                </div>
                {members.length === 0 ? <p className="mt-2 text-xs text-muted">No one tagged yet.</p> : null}
                <ul className="mt-1 grid">
                  {members.map((identity) => (
                    <FriendRow key={identity.id} identity={identity} />
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="mt-5">
            <h2 className="text-sm font-medium">Following</h2>
            {untagged.length === 0 && favoriteFriends.length === 0 && tags.length === 0 ? (
              <p className="mt-3 text-sm text-muted">You are not following anyone yet.</p>
            ) : null}
            <ul className="mt-2 grid">
              {untagged.map((identity) => (
                <FriendRow key={identity.id} identity={identity} />
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newTag.trim()) return;
                onAddTag(newTag);
                setNewTag("");
              }}
            >
              <input
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder="New tag, e.g. Tournament Team"
                className="h-10 min-w-0 flex-1 rounded-full border border-border bg-bg px-3 text-base outline-none sm:text-xs"
              />
              <button type="submit" className="h-9 rounded-full border border-border px-3 text-xs font-medium">
                Add tag
              </button>
            </form>
          </div>

          <h3 className="mt-5 text-sm font-medium">Suggested</h3>
          <ul className="mt-2 grid">
            {suggestions.map((identity) => (
              <li key={identity.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <button type="button" onClick={() => onOpen(identity.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                  <PlayerFace name={identity.name} id={identity.id} avatarUrl={identity.avatarUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-sm">{identity.name}</span>
                      <PlatformBadges identity={identity} />
                    </span>
                    <span className="block font-mono text-xs text-faint">{identity.handle}</span>
                  </span>
                </button>
                <Button variant="primary" onClick={() => onFollow(identity.id)}>
                  Follow
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl border border-border bg-bg-elevated p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">{mine ? mine.name : "No clan"}</h2>
            {mine ? <Chip tone="cyan">{clanTier(mine.memberIds.length)}</Chip> : null}
          </div>
          {!mine ? <p className="mt-3 text-sm text-muted">Join a roster from a clan page once recruitment is open. This identity is unaffiliated.</p> : null}
          <ul className="mt-2 grid">
            {mine?.memberIds.map((id) => {
              const member = identities.find((identity) => identity.id === id);
              if (!member) return null;
              return (
                <li key={id}>
                  <button type="button" onClick={() => onOpen(id)} className="flex min-h-11 w-full items-baseline justify-between text-left">
                    <span className="text-sm">{member.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted">{member.score}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {compareId ? <CompareModal viewer={viewer} other={identities.find((identity) => identity.id === compareId)!} onClose={() => setCompareId(null)} /> : null}
    </div>
  );
}

function CompareModal({ viewer, other, onClose }: { viewer: Identity; other: Identity; onClose: () => void }) {
  const rows: { label: string; mine: string | number; theirs: string | number }[] = [
    { label: "KOBA score", mine: viewer.score, theirs: other.score },
    { label: "Region", mine: viewer.region, theirs: other.region },
    { label: "Badges unlocked", mine: viewer.badges.length, theirs: other.badges.length },
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border border-border bg-bg-elevated p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Compare profiles</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-y-3 text-sm">
          <span className="text-muted">You</span>
          <span />
          <span className="text-right text-muted">{other.name}</span>
          {rows.map((row) => (
            <Fragment key={row.label}>
              <span className="font-mono font-semibold">{row.mine}</span>
              <span className="px-2 text-center text-xs text-muted">{row.label}</span>
              <span className="text-right font-mono font-semibold">{row.theirs}</span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

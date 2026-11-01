import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Crown,
  Crosshair,
  Flag,
  Hammer,
  Link2,
  Lock,
  Plus,
  Send,
  Settings,
  Shield,
  Skull,
  Star,
  Swords,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Identity } from "@/platform/engine";
import { PlayerFace } from "@/components/network/shared";
import { ImagePicker } from "@/components/network/image-picker";
import { celebrateBadges } from "@/components/network/badge-events";
import { syncEarnedBadges } from "@/lib/badges/api";
import {
  assignRank,
  createGroup as createGroupReal,
  createRank,
  deleteGroup,
  deleteRank,
  joinGroup as joinGroupReal,
  loadGroups,
  postRoom as postRoomReal,
  regenerateInvite,
  removeMember as removeMemberReal,
  setGroupVisibility,
  updateGroupIdentity,
  updateRank,
} from "@/lib/groups/api";
import {
  GROUP_PERMISSIONS,
  MAX_RANK_POSITION,
  OWNER_POSITION,
  RANK_ICONS,
  permissionLabel,
  type GroupPermission,
  type RankIcon,
} from "@/site/clan-ranks";

interface GroupView {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  visibility: "public" | "private";
  inviteCode: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}
interface RankView {
  id: string;
  groupId: string;
  name: string;
  description: string;
  icon: string;
  position: number;
  permissions: GroupPermission[];
}
interface MemberView {
  groupId: string;
  playerId: string;
  role: "owner" | "member";
  rankId: string | null;
}
interface MessageView {
  id: string;
  groupId: string;
  authorId: string;
  text: string;
  at: number;
}
interface Snapshot {
  groups: GroupView[];
  ranks: RankView[];
  members: MemberView[];
  messages: MessageView[];
}

const RANK_ICON: Record<RankIcon, LucideIcon> = {
  shield: Shield,
  crown: Crown,
  sword: Swords,
  crosshair: Crosshair,
  star: Star,
  hammer: Hammer,
  flag: Flag,
  skull: Skull,
};

function badgeFor(icon: string): LucideIcon {
  return RANK_ICON[(RANK_ICONS as readonly string[]).includes(icon) ? (icon as RankIcon) : "shield"];
}

const clock = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const memberCount = (count: number) => `${count} member${count === 1 ? "" : "s"}`;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
function dayLabel(at: number) {
  const date = new Date(at);
  const now = new Date();
  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The badge a rank wears, next to a member's name. */
function RankBadge({ icon, size = 12 }: { icon: string; size?: number }) {
  const Icon = badgeFor(icon);
  return <Icon size={size} aria-hidden className="shrink-0" />;
}

function RankChip({ rank }: { rank: RankView | null }) {
  if (!rank) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] leading-4 text-muted">
      <RankBadge icon={rank.icon} size={10} />
      {rank.name}
    </span>
  );
}

function OwnerChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-fg px-1.5 py-px text-[10px] leading-4 text-fg">
      <Crown size={10} aria-hidden />
      Owner
    </span>
  );
}

function Sheet({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0" onClick={onClose} />
      <div
        className={`relative flex max-h-[88dvh] w-full ${width} flex-col overflow-hidden rounded-t-3xl border border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] sm:rounded-3xl sm:pb-0`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="grid h-11 w-11 place-items-center rounded-full text-muted hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

type RankDraft = {
  id: string | null;
  name: string;
  description: string;
  icon: RankIcon;
  position: string;
  permissions: GroupPermission[];
};

export function GroupsPage({ viewer, identities }: { viewer: Identity; identities: Identity[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ groups: [], ranks: [], members: [], messages: [] });
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [focus, setFocus] = useState(false);
  const [sheet, setSheet] = useState<"create" | "members" | "clan" | null>(null);
  const [memberTab, setMemberTab] = useState<"roster" | "ranks">("roster");
  const [createName, setCreateName] = useState("");
  const [createTag, setCreateTag] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rankDraft, setRankDraft] = useState<RankDraft | null>(null);
  const [clanDraft, setClanDraft] = useState<{ name: string; tag: string; avatarUrl: string | null; bannerUrl: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const { groups, ranks, members, messages } = snapshot;

  const refresh = async () => {
    const next = await loadGroups();
    setSnapshot(next);
  };

  const apply = async (action: () => Promise<unknown>, message = "") => {
    setBusy(true);
    try {
      const result = (await action()) as { ok?: boolean; error?: string } | undefined;
      if (result && result.ok === false) {
        setNote(result.error ?? "That didn't work.");
        return false;
      }
      setNote(message);
      await refresh();
      return true;
    } catch {
      setNote("That didn't work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Creating or joining a clan is the moment Trailblazer is earned. Claim it
  // here; a failed sync must never block the clan action itself.
  const claimBadges = () => {
    void syncEarnedBadges()
      .then((awarded) => celebrateBadges(awarded))
      .catch(() => {
        // Award sync is a bonus; the clan action already succeeded.
      });
  };

  useEffect(() => {
    void refresh();
  }, []);

  const nameFor = (id: string) => identities.find((identity) => identity.id === id)?.name ?? id;
  const handleFor = (id: string) => identities.find((identity) => identity.id === id)?.handle ?? id;
  const avatarFor = (id: string) => identities.find((identity) => identity.id === id)?.avatarUrl;
  const group = groups.find((item) => item.id === activeGroupId) ?? groups[0] ?? null;
  const groupMembers = members.filter((item) => item.groupId === group?.id);
  const groupRanks = useMemo(
    () => ranks.filter((rank) => rank.groupId === group?.id).sort((a, b) => b.position - a.position),
    [ranks, group?.id],
  );
  const myMembership = groupMembers.find((item) => item.playerId === viewer.id);
  const isOwner = myMembership?.role === "owner";
  const myRank = groupRanks.find((rank) => rank.id === myMembership?.rankId) ?? null;
  const myPosition = isOwner ? OWNER_POSITION : myRank?.position ?? 0;
  const can = (permission: GroupPermission) => isOwner || Boolean(myRank?.permissions.includes(permission));
  const rankOf = (playerId: string) => {
    const membership = groupMembers.find((item) => item.playerId === playerId);
    if (membership?.role === "owner") return "owner";
    return groupRanks.find((rank) => rank.id === membership?.rankId) ?? null;
  };
  const authorityOf = (membership: MemberView) => {
    if (membership.role === "owner") return OWNER_POSITION;
    return groupRanks.find((rank) => rank.id === membership.rankId)?.position ?? 0;
  };
  const lines = useMemo(
    () => (group ? messages.filter((item) => item.groupId === group.id) : []),
    [group, messages],
  );
  const sortedMembers = [...groupMembers].sort((a, b) => authorityOf(b) - authorityOf(a));
  const assignable = groupRanks.filter((rank) => rank.position < myPosition);
  const editableRanks = groupRanks.filter((rank) => rank.position < myPosition);
  const owner = groupMembers.find((member) => member.role === "owner") ?? null;

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines.length, group?.id]);

  const openGroup = (id: string) => {
    setActiveGroupId(id);
    setFocus(true);
    setNote("");
  };

  const openClanSettings = () => {
    if (!group) return;
    setClanDraft({ name: group.name, tag: group.tag, avatarUrl: group.avatarUrl, bannerUrl: group.bannerUrl });
    setConfirmDelete(false);
    setNote("");
    setSheet("clan");
  };

  const createClan = async () => {
    const name = createName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const id = await createGroupReal({
        data: { name, visibility: createPrivate ? "private" : "public", tag: createTag.trim() || undefined },
      });
      setSheet(null);
      setCreateName("");
      setCreateTag("");
      setCreatePrivate(false);
      setActiveGroupId(id);
      setFocus(true);
      await refresh();
      claimBadges();
    } catch {
      setNote("Couldn't create that clan. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = () => {
    if (!group) return;
    void regenerateInvite({ data: { groupId: group.id } }).then((result) => {
      if (result.ok) {
        void navigator.clipboard.writeText(`${window.location.origin}/?invite=${result.inviteCode}`);
        setNote("Invite link copied.");
      } else {
        setNote(result.error);
      }
      void refresh();
    });
  };

  const saveClan = async () => {
    if (!group || !clanDraft) return;
    const saved = await apply(
      () =>
        updateGroupIdentity({
          data: {
            groupId: group.id,
            name: clanDraft.name,
            tag: clanDraft.tag,
            avatarUrl: clanDraft.avatarUrl,
            bannerUrl: clanDraft.bannerUrl,
          },
        }),
      "Clan saved.",
    );
    if (saved) setSheet(null);
  };

  const saveRank = async () => {
    if (!group || !rankDraft) return;
    const payload = {
      groupId: group.id,
      name: rankDraft.name,
      description: rankDraft.description,
      icon: rankDraft.icon,
      position: Number(rankDraft.position),
      permissions: rankDraft.permissions,
    };
    const saved = rankDraft.id
      ? await apply(() => updateRank({ data: { ...payload, rankId: rankDraft.id! } }), "Rank saved.")
      : await apply(() => createRank({ data: payload }), "Rank created.");
    if (saved) setRankDraft(null);
  };

  return (
    <div className="flex h-[calc(100dvh-13.5rem)] min-h-[26rem] overflow-hidden rounded-3xl border border-border bg-bg-elevated lg:h-[calc(100dvh-10.5rem)]">
      {/* Clan rail: every clan you belong to, plus create. */}
      <nav
        className={`${focus ? "hidden lg:flex" : "flex"} w-[3.75rem] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-border bg-bg py-3`}
        aria-label="Clans"
      >
        {groups.map((item) => {
          const on = item.id === group?.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openGroup(item.id)}
              aria-label={item.name}
              aria-current={on ? "page" : undefined}
              className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl text-[10px] font-semibold transition-colors ${
                on ? "bg-fg text-bg" : "bg-bg-subtle text-fg hover:bg-border"
              }`}
            >
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                item.tag.slice(0, 2)
              )}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Create clan"
          onClick={() => setSheet("create")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-fg hover:bg-bg-subtle"
        >
          <Plus size={18} />
        </button>
      </nav>

      {/* Clan list */}
      <section className={`${focus ? "hidden" : "flex"} w-full min-w-0 flex-col border-r border-border lg:flex lg:w-72 xl:w-80`}>
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h1 className="text-lg font-semibold tracking-tight">Clans</h1>
          <button
            type="button"
            onClick={() => setSheet("create")}
            aria-label="Create clan"
            className="grid h-9 w-9 place-items-center rounded-full border border-border text-fg hover:bg-bg-subtle"
          >
            <Plus size={16} />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((item) => {
            const roster = members.filter((member) => member.groupId === item.id).length;
            const last = [...messages].reverse().find((message) => message.groupId === item.id);
            const on = item.id === group?.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openGroup(item.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left ${on ? "bg-bg-subtle" : "hover:bg-bg-subtle/60"}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-subtle text-[11px] font-semibold text-fg">
                    {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" /> : item.tag.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-faint">[{item.tag}]</span>
                      {item.visibility === "private" ? <Lock size={11} className="shrink-0 text-faint" aria-label="Private" /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {last ? `${nameFor(last.authorId).split(" ")[0]}: ${last.text}` : `${memberCount(roster)} · no messages yet`}
                    </span>
                  </span>
                  {last ? <span className="shrink-0 self-start pt-0.5 text-[11px] text-faint">{clock(last.at)}</span> : null}
                </button>
              </li>
            );
          })}
          {groups.length === 0 ? (
            <li className="px-2 py-6 text-sm text-muted">No clans yet. Create one to start a roster.</li>
          ) : null}
        </ul>
      </section>

      {/* Chat */}
      <section className={`${focus ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-bg lg:flex`}>
        {group ? (
          <>
            <header className="flex items-center gap-2 border-b border-border px-2 py-2.5 sm:px-4">
              <button
                type="button"
                aria-label="Back to clans"
                onClick={() => setFocus(false)}
                className="grid h-11 w-11 shrink-0 place-items-center text-muted lg:hidden"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-subtle text-[11px] font-semibold">
                {group.avatarUrl ? <img src={group.avatarUrl} alt="" className="h-full w-full object-cover" /> : group.tag.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{group.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-faint">[{group.tag}]</span>
                  {group.visibility === "private" ? <Lock size={11} className="shrink-0 text-faint" aria-label="Private" /> : null}
                  {isOwner ? (
                    <span className="hidden sm:inline-flex"><OwnerChip /></span>
                  ) : (
                    <span className="hidden sm:inline-flex"><RankChip rank={myRank} /></span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted">
                  {memberCount(groupMembers.length)}
                  {isOwner ? " · Owner" : myRank ? ` · ${myRank.name}` : ""}
                  {myMembership ? "" : " · not on the roster"}
                </span>
              </span>
              {can("manage_clan") && group.visibility === "private" ? (
                <button
                  type="button"
                  onClick={copyInvite}
                  aria-label="Copy invite link"
                  className="grid h-11 w-11 place-items-center rounded-full text-muted hover:text-fg"
                >
                  <Link2 size={18} />
                </button>
              ) : null}
              {can("manage_clan") ? (
                <button
                  type="button"
                  onClick={openClanSettings}
                  aria-label="Clan settings"
                  className="grid h-11 w-11 place-items-center rounded-full text-muted hover:text-fg"
                >
                  <Settings size={18} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setMemberTab("roster");
                  setRankDraft(null);
                  setManagingId(null);
                  setSheet("members");
                }}
                aria-label="Members and ranks"
                className="grid h-11 w-11 place-items-center rounded-full text-muted hover:text-fg"
              >
                <Users size={18} />
              </button>
            </header>

            {group.bannerUrl ? <img src={group.bannerUrl} alt="" className="h-24 w-full object-cover sm:h-32" /> : null}

            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" data-noswipe>
              {lines.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div>
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-bg-subtle text-fg" aria-hidden>
                      <Shield size={22} />
                    </span>
                    <p className="mt-3 text-sm font-medium">No messages yet</p>
                    <p className="mt-1 text-sm text-muted">
                      {myMembership ? "Say hello to the roster." : `Join ${group.name} to take part in the chat.`}
                    </p>
                  </div>
                </div>
              ) : null}

              {lines.map((line, index) => {
                const mine = line.authorId === viewer.id;
                const prev = lines[index - 1];
                const next = lines[index + 1];
                const newDay = !prev || !sameDay(new Date(prev.at), new Date(line.at));
                const headOfRun =
                  newDay || !prev || prev.authorId !== line.authorId || line.at - prev.at > 5 * 60 * 1000;
                const tailOfRun =
                  !next ||
                  next.authorId !== line.authorId ||
                  !sameDay(new Date(next.at), new Date(line.at)) ||
                  next.at - line.at > 5 * 60 * 1000;
                const authorRank = rankOf(line.authorId);
                return (
                  <div key={line.id}>
                    {newDay ? (
                      <div className="my-4 flex items-center gap-3 px-2">
                        <span className="h-px flex-1 bg-border/70" />
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted">
                          {dayLabel(line.at)}
                        </span>
                        <span className="h-px flex-1 bg-border/70" />
                      </div>
                    ) : null}
                    <div className={`flex items-end gap-2 ${headOfRun ? "mt-3" : "mt-0.5"} ${mine ? "flex-row-reverse" : ""}`}>
                      {mine ? null : headOfRun ? (
                        <PlayerFace name={nameFor(line.authorId)} id={line.authorId} size="sm" avatarUrl={avatarFor(line.authorId)} />
                      ) : (
                        <span className="w-9 shrink-0" aria-hidden />
                      )}
                      <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        {headOfRun && !mine ? (
                          <span className="mb-1 flex items-center gap-1.5 px-1">
                            <span className="text-xs font-medium text-fg">{nameFor(line.authorId)}</span>
                            {authorRank === "owner" ? <OwnerChip /> : <RankChip rank={authorRank} />}
                          </span>
                        ) : null}
                        <div
                          className={`whitespace-pre-wrap break-words px-3.5 py-2 text-sm ${
                            mine
                              ? `rounded-2xl bg-fg text-bg ${tailOfRun ? "rounded-br-md" : ""}`
                              : `rounded-2xl bg-bg-subtle text-fg ${tailOfRun ? "rounded-bl-md" : ""}`
                          }`}
                        >
                          {line.text}
                        </div>
                        {tailOfRun ? (
                          <span className="mt-1 px-1 text-[11px] text-faint">
                            {clock(line.at)}
                            {mine ? " · You" : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {note ? <p className="px-4 pb-2 text-xs text-muted">{note}</p> : null}

            {myMembership ? (
              <form
                className="flex items-center gap-2 border-t border-border px-3 py-2.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draft.trim();
                  if (!text) return;
                  void postRoomReal({ data: { groupId: group.id, text } }).then(() => refresh());
                  setDraft("");
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMemberTab("roster");
                    setRankDraft(null);
                    setManagingId(null);
                    setSheet("members");
                  }}
                  aria-label="Members and ranks"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted hover:text-fg"
                >
                  <Plus size={18} />
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${group.name}`}
                  aria-label={`Message ${group.name}`}
                  className="h-11 min-w-0 flex-1 rounded-full bg-bg-subtle px-4 text-base outline-none placeholder:text-faint sm:text-sm"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!draft.trim()}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fg text-bg disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </form>
            ) : (
              <div className="border-t border-border px-3 py-2.5">
                <button
                  type="button"
                  className="h-11 w-full rounded-full bg-fg text-sm font-semibold text-bg"
                  onClick={() => {
                    const code = group.visibility === "private" ? window.prompt("Invite code") ?? undefined : undefined;
                    void joinGroupReal({ data: { groupId: group.id, inviteCode: code } }).then((result) => {
                      if (!result.ok) setNote(result.error);
                      else claimBadges();
                      void refresh();
                    });
                  }}
                >
                  Join {group.name} to chat
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-bg-subtle text-fg" aria-hidden>
                <Shield size={22} />
              </span>
              <h2 className="mt-3 text-base font-semibold">No clans yet</h2>
              <p className="mt-1 text-sm text-muted">A clan gives you a tag, a roster and a war to fight. Start one, or join with an invite code.</p>
              <button
                type="button"
                onClick={() => setSheet("create")}
                className="mt-4 h-11 rounded-full bg-fg px-5 text-sm font-semibold text-bg"
              >
                Create a clan
              </button>
            </div>
          </div>
        )}
      </section>

      {sheet === "create" ? (
        <Sheet title="Create a clan" onClose={() => setSheet(null)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createClan();
            }}
          >
            <label className="grid gap-2">
              <span className="text-xs text-muted">Clan name</span>
              <input
                autoFocus
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                maxLength={24}
                placeholder="Night Shift"
                className="h-11 rounded-xl border border-border bg-bg px-3 text-base outline-none placeholder:text-faint sm:text-sm"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs text-muted">Clan tag</span>
              <input
                value={createTag}
                onChange={(event) => setCreateTag(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                placeholder="NITE"
                className="h-11 rounded-xl border border-border bg-bg px-3 font-mono text-base tracking-[0.2em] uppercase outline-none placeholder:text-faint sm:text-sm"
              />
              <span className="text-[11px] text-faint">2–5 letters or numbers, shown next to every member's name.</span>
            </label>

            <div className="grid gap-2">
              <span className="text-xs text-muted">Who can join</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { on: !createPrivate, label: "Public", detail: "Listed in Discover", pick: () => setCreatePrivate(false) },
                  { on: createPrivate, label: "Private", detail: "Invite link only", pick: () => setCreatePrivate(true) },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={option.pick}
                    aria-pressed={option.on}
                    className={`rounded-2xl border px-3 py-2.5 text-left ${option.on ? "border-fg bg-bg-subtle" : "border-border"}`}
                  >
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{option.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-xs text-muted">Clan owner</span>
              <div className="flex items-center gap-3 rounded-2xl border border-border px-3 py-2.5">
                <PlayerFace name={viewer.name} id={viewer.id} size="sm" avatarUrl={viewer.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{viewer.name}</span>
                  <span className="block truncate text-xs text-muted">@{viewer.handle}</span>
                </span>
                <OwnerChip />
              </div>
            </div>

            <p className="text-xs text-muted">
              Every new clan starts with Officer and Member ranks. Add your own ranks, badges and permissions from Members → Ranks.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSheet(null)}
                className="h-11 flex-1 rounded-full border border-border text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!createName.trim() || busy}
                className="h-11 flex-[2] rounded-full bg-fg text-sm font-semibold text-bg disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create clan"}
              </button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {sheet === "members" && group ? (
        <Sheet title="Members and ranks" onClose={() => setSheet(null)} width="max-w-lg">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg-subtle p-1">
              {(
                [
                  { id: "roster" as const, label: "Members" },
                  { id: "ranks" as const, label: "Ranks" },
                ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={memberTab === tab.id}
                  onClick={() => {
                    setMemberTab(tab.id);
                    setRankDraft(null);
                    setManagingId(null);
                  }}
                  className={`h-9 rounded-lg text-xs font-semibold ${
                    memberTab === tab.id ? "bg-fg text-bg" : "text-muted hover:text-fg"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {note ? <p className="text-xs text-danger">{note}</p> : null}

            {memberTab === "roster" ? (
              <ul className="grid gap-4">
                {owner ? (
                  <li className="grid gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs tracking-wide text-muted uppercase">Owner</p>
                      <span className="text-xs text-faint">1</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <PlayerFace name={nameFor(owner.playerId)} id={owner.playerId} size="sm" avatarUrl={avatarFor(owner.playerId)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{nameFor(owner.playerId)}</span>
                        <span className="block truncate text-xs text-muted">@{handleFor(owner.playerId)}</span>
                      </span>
                      <OwnerChip />
                    </div>
                  </li>
                ) : null}

                {groupRanks.map((rank) => {
                  const roster = sortedMembers.filter((member) => member.rankId === rank.id);
                  return (
                    <li key={rank.id} className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="flex items-center gap-1.5 text-xs tracking-wide text-muted uppercase">
                          <RankBadge icon={rank.icon} size={12} />
                          {rank.name}
                        </p>
                        <span className="text-xs text-faint">{roster.length}</span>
                      </div>
                      {rank.description ? <p className="-mt-1 text-xs text-faint">{rank.description}</p> : null}
                      {roster.length === 0 ? <p className="text-xs text-faint">Nobody yet.</p> : null}
                      <ul className="grid gap-3">
                        {roster.map((member) => {
                          const manageable =
                            member.playerId !== viewer.id && member.role !== "owner" && authorityOf(member) < myPosition;
                          const open = managingId === member.playerId;
                          return (
                            <li key={member.playerId} className="grid gap-2">
                              <div className="flex items-center gap-3">
                                <PlayerFace name={nameFor(member.playerId)} id={member.playerId} size="sm" avatarUrl={avatarFor(member.playerId)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">{nameFor(member.playerId)}</span>
                                  <span className="block truncate text-xs text-muted">@{handleFor(member.playerId)}</span>
                                </span>
                                {manageable && can("manage_members") ? (
                                  <button
                                    type="button"
                                    onClick={() => setManagingId(open ? null : member.playerId)}
                                    aria-expanded={open}
                                    className="h-8 shrink-0 rounded-full border border-border px-2.5 text-xs text-muted hover:text-fg"
                                  >
                                    {open ? "Close" : "Manage"}
                                  </button>
                                ) : null}
                              </div>
                              {open && manageable ? (
                                <div className="grid gap-2 rounded-2xl border border-border bg-bg p-2">
                                  <p className="px-1 text-[11px] tracking-wide text-faint uppercase">Move to rank</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {assignable.map((candidate) => (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void apply(
                                            () =>
                                              assignRank({
                                                data: { groupId: group.id, targetId: member.playerId, rankId: candidate.id },
                                              }),
                                            `${nameFor(member.playerId)} is now ${candidate.name}.`,
                                          )
                                        }
                                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs ${
                                          member.rankId === candidate.id ? "bg-fg text-bg" : "bg-bg-subtle text-fg hover:bg-border"
                                        }`}
                                      >
                                        <RankBadge icon={candidate.icon} size={11} />
                                        {candidate.name}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void apply(
                                          () =>
                                            assignRank({
                                              data: { groupId: group.id, targetId: member.playerId, rankId: null },
                                            }),
                                          `${nameFor(member.playerId)} has no rank.`,
                                        )
                                      }
                                      className="h-8 rounded-full border border-border px-2.5 text-xs text-muted hover:text-fg"
                                    >
                                      No rank
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void apply(
                                        () => removeMemberReal({ data: { groupId: group.id, targetId: member.playerId } }),
                                        `${nameFor(member.playerId)} removed.`,
                                      )
                                    }
                                    className="h-8 w-fit rounded-full px-1 text-xs text-danger"
                                  >
                                    Remove from clan
                                  </button>
                                </div>
                              ) : null}
                              {member.playerId === viewer.id ? (
                                <p className="pl-12 text-[11px] text-faint">That's you.</p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}

                {(() => {
                  const unranked = sortedMembers.filter(
                    (member) => member.role !== "owner" && !groupRanks.some((rank) => rank.id === member.rankId),
                  );
                  if (unranked.length === 0) return null;
                  return (
                    <li className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-xs tracking-wide text-muted uppercase">No rank</p>
                        <span className="text-xs text-faint">{unranked.length}</span>
                      </div>
                      <ul className="grid gap-3">
                        {unranked.map((member) => {
                          const manageable = member.playerId !== viewer.id && member.role !== "owner" && authorityOf(member) < myPosition;
                          const open = managingId === member.playerId;
                          return (
                            <li key={member.playerId} className="grid gap-2">
                              <div className="flex items-center gap-3">
                                <PlayerFace name={nameFor(member.playerId)} id={member.playerId} size="sm" avatarUrl={avatarFor(member.playerId)} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">{nameFor(member.playerId)}</span>
                                  <span className="block truncate text-xs text-muted">@{handleFor(member.playerId)}</span>
                                </span>
                                {manageable && can("manage_members") ? (
                                  <button
                                    type="button"
                                    onClick={() => setManagingId(open ? null : member.playerId)}
                                    aria-expanded={open}
                                    className="h-8 shrink-0 rounded-full border border-border px-2.5 text-xs text-muted hover:text-fg"
                                  >
                                    {open ? "Close" : "Manage"}
                                  </button>
                                ) : null}
                              </div>
                              {open && manageable ? (
                                <div className="grid gap-2 rounded-2xl border border-border bg-bg p-2">
                                  <p className="px-1 text-[11px] tracking-wide text-faint uppercase">Give a rank</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {assignable.map((candidate) => (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void apply(
                                            () =>
                                              assignRank({
                                                data: { groupId: group.id, targetId: member.playerId, rankId: candidate.id },
                                              }),
                                            `${nameFor(member.playerId)} is now ${candidate.name}.`,
                                          )
                                        }
                                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-bg-subtle px-2.5 text-xs text-fg hover:bg-border"
                                      >
                                        <RankBadge icon={candidate.icon} size={11} />
                                        {candidate.name}
                                      </button>
                                    ))}
                                    {assignable.length === 0 ? (
                                      <span className="text-xs text-faint">You have no ranks below you to hand out.</span>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void apply(
                                        () => removeMemberReal({ data: { groupId: group.id, targetId: member.playerId } }),
                                        `${nameFor(member.playerId)} removed.`,
                                      )
                                    }
                                    className="h-8 w-fit rounded-full px-1 text-xs text-danger"
                                  >
                                    Remove from clan
                                  </button>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })()}

                {groupMembers.length === 0 ? <li className="text-sm text-muted">No members yet.</li> : null}
              </ul>
            ) : rankDraft ? (
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveRank();
                }}
              >
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted">Rank name</span>
                  <input
                    autoFocus
                    value={rankDraft.name}
                    onChange={(event) => setRankDraft({ ...rankDraft, name: event.target.value })}
                    maxLength={24}
                    placeholder="Raid leader"
                    className="h-11 rounded-xl border border-border bg-bg px-3 text-base outline-none placeholder:text-faint sm:text-sm"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted">Description</span>
                  <textarea
                    value={rankDraft.description}
                    onChange={(event) => setRankDraft({ ...rankDraft, description: event.target.value })}
                    maxLength={140}
                    rows={2}
                    placeholder="What this rank is for."
                    className="rounded-xl border border-border bg-bg px-3 py-2 text-base outline-none placeholder:text-faint sm:text-sm"
                  />
                </label>
                <div className="grid gap-1.5">
                  <span className="text-xs text-muted">Badge</span>
                  <div className="flex flex-wrap gap-1.5">
                    {RANK_ICONS.map((icon) => {
                      const Icon = RANK_ICON[icon];
                      const on = rankDraft.icon === icon;
                      return (
                        <button
                          key={icon}
                          type="button"
                          aria-label={icon}
                          aria-pressed={on}
                          onClick={() => setRankDraft({ ...rankDraft, icon })}
                          className={`grid h-10 w-10 place-items-center rounded-xl border ${
                            on ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg"
                          }`}
                        >
                          <Icon size={17} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted">Authority</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_RANK_POSITION}
                    value={rankDraft.position}
                    onChange={(event) => setRankDraft({ ...rankDraft, position: event.target.value })}
                    className="h-11 w-24 rounded-xl border border-border bg-bg px-3 font-mono text-base outline-none sm:text-sm"
                  />
                  <span className="text-[11px] text-faint">
                    Higher outranks lower, up to {MAX_RANK_POSITION}. The owner is always above every rank, and you can only
                    create ranks below your own authority.
                  </span>
                </label>
                <div className="grid gap-1.5">
                  <span className="text-xs text-muted">Permissions</span>
                  <div className="grid gap-1.5">
                    {GROUP_PERMISSIONS.map((permission) => {
                      const on = rankDraft.permissions.includes(permission.id);
                      return (
                        <button
                          key={permission.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setRankDraft({
                              ...rankDraft,
                              permissions: on
                                ? rankDraft.permissions.filter((item) => item !== permission.id)
                                : [...rankDraft.permissions, permission.id],
                            })
                          }
                          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs ${
                            on ? "border-fg bg-bg-subtle" : "border-border"
                          }`}
                        >
                          <span
                            className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border ${
                              on ? "border-fg bg-fg text-bg" : "border-border"
                            }`}
                            aria-hidden
                          >
                            {on ? <Check size={11} /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium">{permission.short}</span>
                            <span className="block text-muted">{permission.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRankDraft(null)}
                    className="h-11 flex-1 rounded-full border border-border text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || rankDraft.name.trim().length < 2}
                    className="h-11 flex-[2] rounded-full bg-fg text-sm font-semibold text-bg disabled:opacity-40"
                  >
                    {busy ? "Saving…" : rankDraft.id ? "Save rank" : "Create rank"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid gap-3">
                {groupRanks.length === 0 ? (
                  <p className="text-sm text-muted">This clan has no ranks yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {groupRanks.map((rank) => {
                      const editable = can("manage_ranks") && editableRanks.some((item) => item.id === rank.id);
                      return (
                        <li key={rank.id} className="grid gap-2 rounded-2xl border border-border bg-bg p-3">
                          <div className="flex items-start gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg-subtle text-fg">
                              <RankBadge icon={rank.icon} size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="truncate text-sm font-medium">{rank.name}</span>
                                <span className="shrink-0 font-mono text-[10px] text-faint">A{rank.position}</span>
                              </span>
                              <span className="mt-0.5 block text-xs text-muted">
                                {rank.description || "No description yet."}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1">
                                {rank.permissions.length === 0 ? (
                                  <span className="text-[11px] text-faint">No permissions</span>
                                ) : (
                                  rank.permissions.map((permission) => (
                                    <span key={permission} className="rounded-full bg-bg-subtle px-2 py-0.5 text-[10px] text-muted">
                                      {permissionLabel(permission)}
                                    </span>
                                  ))
                                )}
                              </span>
                            </span>
                          </div>
                          {editable ? (
                            <div className="flex gap-1.5 pl-12">
                              <button
                                type="button"
                                onClick={() =>
                                  setRankDraft({
                                    id: rank.id,
                                    name: rank.name,
                                    description: rank.description,
                                    icon: (RANK_ICONS as readonly string[]).includes(rank.icon) ? (rank.icon as RankIcon) : "shield",
                                    position: String(rank.position),
                                    permissions: rank.permissions,
                                  })
                                }
                                className="h-8 rounded-full bg-bg-subtle px-2.5 text-xs text-fg hover:bg-border"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void apply(() => deleteRank({ data: { groupId: group.id, rankId: rank.id } }), `${rank.name} deleted.`)}
                                className="h-8 rounded-full px-2.5 text-xs text-danger"
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {can("manage_ranks") ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRankDraft({
                        id: null,
                        name: "",
                        description: "",
                        icon: "shield",
                        position: String(Math.max(1, Math.min(MAX_RANK_POSITION, myPosition - 1))),
                        permissions: [],
                      })
                    }
                    className="h-10 w-fit rounded-full border border-border px-3 text-xs font-medium hover:bg-bg-subtle"
                  >
                    + New rank
                  </button>
                ) : (
                  <p className="text-xs text-faint">
                    Only the owner, or a rank with the Ranks permission, can add or edit ranks.
                  </p>
                )}
                <p className="text-xs text-faint">
                  Members → Manage on a player moves them up or down this list. Ranks only carry the permissions ticked above.
                </p>
              </div>
            )}
          </div>
        </Sheet>
      ) : null}

      {sheet === "clan" && group && clanDraft ? (
        <Sheet title="Clan settings" onClose={() => setSheet(null)} width="max-w-lg">
          <div className="grid gap-5">
            {note ? <p className="text-xs text-danger">{note}</p> : null}

            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs text-muted">Clan name</span>
                <input
                  value={clanDraft.name}
                  onChange={(event) => setClanDraft({ ...clanDraft, name: event.target.value })}
                  maxLength={24}
                  className="h-11 rounded-xl border border-border bg-bg px-3 text-base outline-none sm:text-sm"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs text-muted">Clan tag</span>
                <input
                  value={clanDraft.tag}
                  onChange={(event) =>
                    setClanDraft({ ...clanDraft, tag: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) })
                  }
                  className="h-11 w-32 rounded-xl border border-border bg-bg px-3 font-mono text-base tracking-[0.2em] uppercase outline-none sm:text-sm"
                />
                <span className="text-[11px] text-faint">2–5 letters or numbers. Unique across KOBA.</span>
              </label>
            </div>

            <div className="grid gap-4">
              <ImagePicker
                label="Clan avatar"
                shape="circle"
                value={clanDraft.avatarUrl}
                onChange={(avatarUrl) => setClanDraft({ ...clanDraft, avatarUrl })}
                hint="Square looks best · PNG, JPEG or GIF"
              />
              <ImagePicker
                label="Clan banner"
                shape="wide"
                value={clanDraft.bannerUrl}
                onChange={(bannerUrl) => setClanDraft({ ...clanDraft, bannerUrl })}
                hint="Wide looks best · PNG, JPEG or GIF, animated GIF allowed"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveClan()}
                disabled={busy || !clanDraft.name.trim() || clanDraft.tag.length < 2}
                className="h-11 flex-1 rounded-full bg-fg px-4 text-sm font-semibold text-bg disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save clan"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void setGroupVisibility({
                    data: { groupId: group.id, visibility: group.visibility === "private" ? "public" : "private" },
                  }).then((result) => {
                    if (!result.ok) setNote(result.error);
                    else void refresh();
                  });
                }}
                className="h-11 rounded-full border border-border px-4 text-sm"
              >
                Make {group.visibility === "private" ? "public" : "private"}
              </button>
              {group.visibility === "private" ? (
                <button type="button" onClick={copyInvite} className="h-11 rounded-full border border-border px-4 text-sm">
                  Copy invite link
                </button>
              ) : null}
            </div>

            {isOwner ? (
              <div className="grid gap-2 border-t border-border pt-4">
                <p className="text-xs tracking-wide text-danger uppercase">Delete clan</p>
                {confirmDelete ? (
                  <>
                    <p className="text-xs text-muted">
                      This removes {group.name}, its roster, ranks and chat for everyone. It can't be undone.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!group) return;
                          void deleteGroup({ data: { groupId: group.id } }).then((result) => {
                            if (!result.ok) {
                              setNote(result.error);
                              return;
                            }
                            setConfirmDelete(false);
                            setSheet(null);
                            setActiveGroupId(null);
                            setNote("Clan deleted.");
                            void refresh();
                          });
                        }}
                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-danger px-4 text-xs font-semibold text-white"
                      >
                        <Trash2 size={13} aria-hidden /> Delete for good
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="h-10 rounded-full border border-border px-4 text-xs"
                      >
                        Keep clan
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full border border-danger/50 px-4 text-xs text-danger"
                  >
                    <Trash2 size={13} aria-hidden /> Delete clan
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

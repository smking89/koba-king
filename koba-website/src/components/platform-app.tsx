import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown, Compass, Home, MessageCircle, Trophy, UserRound } from "lucide-react";
import { Glyph, type GlyphName } from "@/components/network/icons";
import { CompetePage } from "@/components/network/compete";
import { DiscoverPage } from "@/components/network/discover";
import { DeskPage } from "@/components/network/desks";
import { GroupsPage } from "@/components/network/groups";
import { HomePage } from "@/components/network/home";
import { MessagesPage } from "@/components/network/messages";
import { ProfilePage } from "@/components/network/profile";
import { RankingsPage } from "@/components/network/rankings";
import { ShopPage } from "@/components/network/shop";
import { SocialPage } from "@/components/network/social";
import { PlayerFace } from "@/components/network/shared";
import { GlobalSearch } from "@/components/global-search";
import { BadgeRow } from "@/components/network/badges";
import { BadgeCelebration } from "@/components/network/badge-celebration";
import { celebrateBadges, resetBadgeCelebrations } from "@/components/network/badge-events";
import { NAME_VERIFIED } from "@/site/badges";
import { useResolvedBadges } from "@/components/network/badge-state";
import { usePlatform } from "@/platform/store";
import type { Identity } from "@/platform/engine";
import { accountFor, quote } from "@/site/astro";
import { useCommunity } from "@/site/community";
import { useSite, type Desk } from "@/site/ui";
import {
  APP_SECTIONS,
  SECTION_TABS,
  defaultTab,
  resolveSectionTab,
  sectionFromPath,
  visibleSectionTabs,
  type AppSection,
} from "@/site/sections";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsPage, type SessionView } from "@/components/network/settings";
import { OnboardingGate } from "@/components/network/onboarding";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { loadMyProfile, updateProfile } from "@/lib/profile/api";
import {
  blockPlayer as blockPlayerApi,
  createFriendTag,
  deleteFriendTag,
  loadPresence as loadPresenceApi,
  loadSocial,
  pingPresence,
  setAlias as setAliasApi,
  setFavorite as setFavoriteApi,
  setPrivacyPolicies,
  setTagMember,
  toggleFollow as toggleFollowApi,
  unblockPlayer as unblockPlayerApi,
} from "@/lib/social/api";
import { exportMyData, deleteMyAccount } from "@/lib/account/api";
import { loadRealIdentities } from "@/lib/pulse/api";

const SECTION_ICON: Record<AppSection, typeof Home> = {
  home: Home,
  discover: Compass,
  compete: Trophy,
  messages: MessageCircle,
  you: UserRound,
};

const SECTION_GLYPH: Record<AppSection, GlyphName> = {
  home: "home",
  discover: "search",
  compete: "trophy",
  messages: "chat",
  you: "profile",
};

function KobaMark({ size = 38 }: { size?: number }) {
  return <img src="/brand/koba-mark-tight.png" alt="" width={Math.round(size * 0.9)} height={size} style={{ height: size, width: "auto" }} className="shrink-0 object-contain" />;
}

function KobaWordmark() {
  return <img src="/brand/koba-wordmark-tight.png" alt="KOBA" className="h-8 w-auto object-contain" />;
}

export function PlatformApp() {
  const identities = usePlatform((s) => s.identities);
  const clans = usePlatform((s) => s.clans);
  const feed = usePlatform((s) => s.feed);
  const audit = usePlatform((s) => s.audit);
  const servers = usePlatform((s) => s.servers);
  const viewerId = usePlatform((s) => s.viewerId);
  const setViewer = usePlatform((s) => s.setViewer);
  const upsertIdentity = usePlatform((s) => s.upsertIdentity);
  const setIdentities = usePlatform((s) => s.setIdentities);
  const grants = usePlatform((s) => s.grants);
  const setRole = usePlatform((s) => s.setRole);
  const setHq = usePlatform((s) => s.setHq);
  const run = usePlatform((s) => s.run);
  const resetPlatform = usePlatform((s) => s.reset);
  const setLink = usePlatform((s) => s.setLink);

  const query = useSite((s) => s.query);
  const game = useSite((s) => s.game);
  const platform = useSite((s) => s.platform);
  const region = useSite((s) => s.region);
  const saved = useSite((s) => s.saved);
  const follows = useSite((s) => s.follows);
  const blocked = useSite((s) => s.blocked);
  const favorites = useSite((s) => s.favorites);
  const aliases = useSite((s) => s.aliases);
  const tags = useSite((s) => s.tags);
  const friendRequestPolicy = useSite((s) => s.friendRequestPolicy);
  const groupInvitePolicy = useSite((s) => s.groupInvitePolicy);
  const dmPolicy = useSite((s) => s.dmPolicy);
  const presence = useSite((s) => s.presence);
  const bounties = useSite((s) => s.bounties);
  const products = useSite((s) => s.products);
  const opened = useSite((s) => s.opened);
  const notice = useSite((s) => s.notice);
  const accountOpen = useSite((s) => s.accountOpen);
  const setQuery = useSite((s) => s.setQuery);
  const setGame = useSite((s) => s.setGame);
  const setPlatform = useSite((s) => s.setPlatform);
  const setRegion = useSite((s) => s.setRegion);
  const toggleSaved = useSite((s) => s.toggleSaved);
  const toggleFollowLocal = useSite((s) => s.toggleFollowLocal);
  const blockPlayerLocal = useSite((s) => s.blockPlayerLocal);
  const unblockPlayerLocal = useSite((s) => s.unblockPlayerLocal);
  const setFavoriteLocal = useSite((s) => s.setFavoriteLocal);
  const setAliasLocal = useSite((s) => s.setAliasLocal);
  const setTagsLocal = useSite((s) => s.setTagsLocal);
  const hydrateSocial = useSite((s) => s.hydrateSocial);
  const setPresence = useSite((s) => s.setPresence);
  const setPolicyLocal = useSite((s) => s.setPolicyLocal);
  const toggleBounty = useSite((s) => s.toggleBounty);
  const openBusiness = useSite((s) => s.openBusiness);
  const addProduct = useSite((s) => s.addProduct);
  const ping = useSite((s) => s.ping);
  const setAccountOpen = useSite((s) => s.setAccountOpen);
  const resetSite = useSite((s) => s.reset);
  const desk = useSite((s) => s.desk);
  const setDesk = useSite((s) => s.setDesk);
  const groups = useCommunity((s) => s.groups);

  const astroPass = useCommunity((s) => s.astroPass);
  const owned = useCommunity((s) => s.owned);
  const equipped = useCommunity((s) => s.equipped);
  const subscribe = useCommunity((s) => s.subscribe);
  const endPass = useCommunity((s) => s.endPass);
  const equip = useCommunity((s) => s.equip);
  const resetCommunity = useCommunity((s) => s.reset);
  const directs = useCommunity((s) => s.directs);
  const { user, isPending } = useCurrentUserState();
  const [profileReady, setProfileReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [kobaTag, setKobaTag] = useState<string | null>(null);
  const [seenDirects, setSeenDirects] = useState<Record<string, number>>({});

  const searchRef = useRef<HTMLInputElement | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { tab?: string; player?: string };
  const routeSection = sectionFromPath(pathname);
  const section: AppSection = routeSection ?? "home";
  // Tabs live in ?tab=, but a path segment (/you/settings) is accepted too so
  // typed or shared links land on the tab they name instead of the default.
  const subSegment = pathname.split("/").filter(Boolean)[1]?.toLowerCase() ?? null;
  const pathTab = SECTION_TABS[section]?.some((item) => item.id === subSegment) ? subSegment : null;
  const requestedTab = pathTab ?? search.tab ?? defaultTab(section);

  const viewer = identities.find((identity) => identity.id === viewerId) ?? identities[0];
  const viewerAccount = viewer ? accountFor(viewer.id, opened) : null;
  const ranked = identities.slice().sort((a, b) => b.score - a.score);
  const rank = viewer ? ranked.findIndex((identity) => identity.id === viewer.id) + 1 : 1;
  const unreadMessages = viewer
    ? directs.reduce((count, thread) => {
        if (thread.a !== viewer.id && thread.b !== viewer.id) return count;
        const last = thread.messages[thread.messages.length - 1];
        if (!last || last.authorId === viewer.id) return count;
        return (last.at ?? 0) > (seenDirects[thread.id] ?? 0) ? count + 1 : count;
      }, 0)
    : 0;
  const profileId = search.player && identities.some((identity) => identity.id === search.player) ? search.player : viewerId;
  const profile = identities.find((identity) => identity.id === profileId) ?? viewer;

  // Settings edits the signed-in account, so it only belongs on your own
  // profile - someone else's page offers the profile alone, and a hand-typed or
  // shared `?player=…&tab=settings` link falls back to the profile tab instead
  // of rendering your account controls under their name.
  const viewingOtherPlayer = Boolean(viewer) && profile.id !== viewer.id;
  const sectionTabs = visibleSectionTabs(section, viewingOtherPlayer);
  const tab = resolveSectionTab(section, requestedTab, viewingOtherPlayer);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key === "Escape") {
        searchRef.current?.blur();
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAccountOpen]);

  useEffect(() => installTouchBridge(), []);

  // Switching the active KOBA identity starts a new badge book. Without this,
  // a badge celebrated for the previous account would stay suppressed here.
  useEffect(() => {
    resetBadgeCelebrations();
  }, [viewerId]);

  useEffect(() => {
    let cancelled = false;
    loadRealIdentities()
      .then((identities) => {
        if (!cancelled) setIdentities(identities);
      })
      .finally(() => {
        if (!cancelled) setDirectoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setIdentities]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadMyProfile({ data: { email: user.primaryEmail, displayName: user.displayName } }).then((profile) => {
      if (cancelled) return;
      upsertIdentity({
        id: profile.id,
        name: profile.displayName,
        handle: profile.handle,
        region: profile.region as Identity["region"],
        avatarUrl: profile.avatarUrl ?? undefined,
        bannerUrl: profile.bannerUrl ?? undefined,
        kobaTag: profile.kobaTag ?? undefined,
        accountType: profile.accountType,
        platform: profile.platform,
        interests: profile.interests,
        score: profile.score,
        form: "steady",
        scoreDelta: 0,
        badges: [],
        coins: 0,
        claimed: true,
        warnings: 0,
        strikes: 0,
        status: "clear",
        clanId: profile.clanId ?? undefined,
        homes: [],
        rivals: [],
      });
      setViewer(profile.id);
      setKobaTag(profile.kobaTag);
      setNeedsOnboarding(!profile.onboarded);
      setProfileReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user, upsertIdentity, setViewer]);

  useEffect(() => {
    if (!user || !viewerId) return;
    let cancelled = false;
    loadSocial().then((graph) => {
      if (!cancelled) hydrateSocial(graph);
    });
    return () => {
      cancelled = true;
    };
  }, [user, viewerId, hydrateSocial]);

  useEffect(() => {
    if (!user) return;
    void pingPresence({ data: { status: "online" } });
    const interval = window.setInterval(() => {
      void pingPresence({ data: { status: "online" } });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user || follows.length === 0) {
      setPresence({});
      return;
    }
    let cancelled = false;
    loadPresenceApi({ data: { ids: follows } }).then((rows) => {
      if (cancelled) return;
      setPresence(Object.fromEntries(rows.map((row) => [row.id, row.status])));
    });
    return () => {
      cancelled = true;
    };
  }, [user, follows, setPresence]);

  // Unknown paths (an old bookmark, a typo) land on Home rather than a dead
  // screen. Only after the session is known, so the sign-in redirect wins.
  useEffect(() => {
    if (isPending || !user || !profileReady || routeSection) return;
    void navigate({ to: "/$", params: { _splat: "home" }, replace: true });
  }, [isPending, user, profileReady, routeSection, navigate]);

  // Opening Messages clears the unread marker for every thread that exists at
  // that moment. New incoming messages raise it again.
  useEffect(() => {
    if (section !== "messages" || !viewer) return;
    setSeenDirects((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const thread of directs) {
        if (thread.a !== viewer.id && thread.b !== viewer.id) continue;
        const last = thread.messages[thread.messages.length - 1];
        const at = last?.at ?? 0;
        if (at > (next[thread.id] ?? 0)) {
          next[thread.id] = at;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [section, directs, viewer]);

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;
  if (!profileReady) return null;
  if (needsOnboarding) {
    return (
      <OnboardingGate
        kobaTag={kobaTag}
        onDone={(profile, awarded) => {
          const current = identities.find((identity) => identity.id === viewerId);
          if (current) {
            upsertIdentity({
              ...current,
              handle: profile.handle,
              region: profile.region as Identity["region"],
              accountType: profile.accountType,
              platform: profile.platform,
              interests: profile.interests,
            });
          }
          celebrateBadges(awarded);
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  const session: SessionView = { name: user.displayName ?? user.primaryEmail ?? "Player", email: user.primaryEmail, provider: "your sign-in provider" };

  if (!viewer || !profile || !viewerAccount) return null;

  const saveHandle = async (handle: string) => {
    const result = await updateProfile({ data: { handle } });
    if ("error" in result) return { ok: false as const, reason: result.error };
    upsertIdentity({ ...viewer, handle: result.handle });
    return { ok: true as const };
  };
  const saveRegion = async (region: Identity["region"]) => {
    const result = await updateProfile({ data: { region } });
    if ("error" in result) return { ok: false as const, reason: result.error };
    upsertIdentity({ ...viewer, region: result.region as Identity["region"] });
    return { ok: true as const };
  };

  const toggleFollow = (followeeId: string) => {
    const wasFollowing = follows.includes(followeeId);
    toggleFollowLocal(followeeId);
    void toggleFollowApi({ data: { followeeId } }).then((result) => {
      if (!result.ok) {
        toggleFollowLocal(followeeId); // revert the optimistic flip
        ping("Follow failed", result.reason);
      } else if (result.following !== !wasFollowing) {
        toggleFollowLocal(followeeId); // server disagreed with the optimistic guess - resync
      }
    });
  };
  const blockPlayer = (id: string) => {
    blockPlayerLocal(id);
    void blockPlayerApi({ data: { blockedId: id } });
  };
  const unblockPlayer = (id: string) => {
    unblockPlayerLocal(id);
    void unblockPlayerApi({ data: { blockedId: id } });
  };
  const setFavorite = (id: string, favorite: boolean) => {
    setFavoriteLocal(id, favorite);
    void setFavoriteApi({ data: { followeeId: id, favorite } });
  };
  const setFriendAlias = (id: string, alias: string) => {
    setAliasLocal(id, alias);
    void setAliasApi({ data: { followeeId: id, alias } });
  };
  const addTag = async (label: string) => {
    const result = await createFriendTag({ data: { label } });
    if ("error" in result) {
      ping("Couldn't add tag", result.error);
      return;
    }
    setTagsLocal([...tags, result]);
  };
  const removeTag = async (tagId: string) => {
    await deleteFriendTag({ data: { tagId } });
    setTagsLocal(tags.filter((tag) => tag.id !== tagId));
  };
  const toggleTagMember = async (tagId: string, playerId: string, on: boolean) => {
    await setTagMember({ data: { tagId, playerId, on } });
    setTagsLocal(
      tags.map((tag) =>
        tag.id === tagId
          ? { ...tag, memberIds: on ? [...tag.memberIds, playerId] : tag.memberIds.filter((id) => id !== playerId) }
          : tag,
      ),
    );
  };
  const savePolicies = async (policy: { friendRequestPolicy?: typeof friendRequestPolicy; groupInvitePolicy?: typeof groupInvitePolicy; dmPolicy?: typeof dmPolicy }) => {
    setPolicyLocal(policy);
    await setPrivacyPolicies({ data: policy });
  };

  const roleGrant = grants[viewer.id] ?? "player";
  const engineOpen = desk !== "play";
  const engineDesk: Desk = desk === "play" ? "super" : desk;
  const clanName = (id?: string) => clans.find((clan) => clan.id === id)?.name ?? "Unaffiliated";
  const applySeat = (next: Desk) => {
    if (next === "super") {
      setRole("developer");
      setHq(true);
    } else if (next === "mod") {
      setRole("moderator");
      setHq(false);
    } else if (next === "admin") {
      setRole("admin");
      setHq(false);
    } else {
      setRole("player");
      setHq(false);
    }
  };
  const enter = (next: Desk) => {
    setDesk(next);
    applySeat(next);
  };
  const goSection = (next: AppSection, options?: { tab?: string; player?: string; replace?: boolean }) => {
    applySeat("play");
    const nextSearch: { tab?: string; player?: string } = {};
    if (options?.tab && options.tab !== defaultTab(next)) nextSearch.tab = options.tab;
    if (options?.player && options.player !== viewer.id) nextSearch.player = options.player;
    void navigate({ to: "/$", params: { _splat: next }, search: nextSearch, replace: options?.replace });
    setAccountOpen(false);
  };

  const openProfile = (id: string) => {
    applySeat("play");
    void navigate({
      to: "/$",
      params: { _splat: "you" },
      search: id === viewer.id ? {} : { player: id },
    });
    setAccountOpen(false);
  };

  const goTab = (id: string) => {
    void navigate({
      to: "/$",
      params: { _splat: section },
      search: id === defaultTab(section) ? {} : { tab: id },
    });
    setAccountOpen(false);
  };

  const challenge = (handle: string) => {
    const embed = run(`/challenge ${handle}`);
    ping(embed.title, embed.description);
  };

  const declareWar = (name: string) => {
    const embed = run(`/war declare ${name}`);
    ping(embed.title, embed.description);
  };

  const standDown = () => {
    const embed = run("/war end");
    ping(embed.title, embed.description);
  };

  const reset = () => {
    resetPlatform();
    resetSite();
    resetCommunity();
  };

  return (
    <div className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-bg-elevated lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start lg:overflow-y-auto">
        <button
          type="button"
          onClick={() => goSection("home")}
          aria-label="KOBA home"
          className="flex flex-col items-center gap-1 px-3 pt-5 text-left xl:items-start xl:px-4"
        >
          <span className="hidden xl:block"><KobaWordmark /></span>
          <span className="grid h-11 w-11 place-items-center xl:hidden"><KobaMark size={32} /></span>
          <span className="hidden text-[10px] tracking-[0.16em] text-violet xl:block">PLAY · COMPETE · CONNECT</span>
        </button>
        <nav className="mt-6 grid gap-1 px-2 xl:px-3" aria-label="Primary">
          {APP_SECTIONS.map((item) => {
            const on = desk === "play" && section === item.id;
            const Icon = SECTION_ICON[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goSection(item.id)}
                aria-current={on ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
                className={`relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors lg:justify-center xl:justify-start ${on ? "bg-bg-subtle text-fg" : "text-fg/70 hover:bg-bg-subtle/70 hover:text-fg"}`}
              >
                {on ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-fg" aria-hidden /> : null}
                <Icon size={18} aria-hidden />
                <span className="hidden xl:inline">{item.label}</span>
              </button>
            );
          })}
          {/* Developer portal entry point removed: the page exists (ComingSoon
              gated) but is not publicly discoverable yet. */}
        </nav>
        {roleGrant === "mod" || roleGrant === "admin" || roleGrant === "super" || roleGrant === "support" || roleGrant === "trainee" ? (
          <button
            type="button"
            onClick={() => enter(desk === roleGrant ? "play" : roleGrant)}
            className="mx-2 mt-4 h-11 rounded-xl border border-border px-2 text-left text-sm font-semibold xl:mx-3 xl:px-3"
          >
            <span className="brand-gradient-text">
              <span className="xl:hidden">Staff</span>
              <span className="hidden xl:inline">{desk === roleGrant ? "Back to play" : "Staff desk"}</span>
            </span>
          </button>
        ) : null}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-border/80 bg-bg">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 lg:px-6">
            <button type="button" onClick={() => goSection("home")} aria-label="KOBA home" className="grid h-11 w-11 shrink-0 place-items-center lg:hidden">
              <KobaMark />
            </button>
            <GlobalSearch
              ref={searchRef}
              value={query}
              onChange={setQuery}
              onSubmit={() => goSection("discover")}
            />
            {viewerAccount.business || roleGrant === "business" ? (
              <button type="button" onClick={() => enter(desk === "business" ? "play" : "business")} className="h-11 shrink-0 rounded-full border border-violet/30 bg-bg-subtle px-3 text-sm font-semibold brand-gradient-text">
                {desk === "business" ? "Play" : "Business"}
              </button>
            ) : null}
            <ThemeToggle className="hidden sm:grid" />
            <button type="button" onClick={() => goSection("messages")} className="relative grid h-11 w-11 shrink-0 place-items-center text-muted" aria-label="Messages">
              <Glyph name="bell" size={18} />
              {notice ? <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-ok" /> : null}
            </button>
            <AccountMenu
              viewer={viewer}
              identities={identities}
              open={accountOpen}
              onToggle={setAccountOpen}
              onPick={(id) => {
                setViewer(id);
                if (section === "you") openProfile(id);
                setAccountOpen(false);
              }}
              session={session}
              onSignOut={() => {
                setAccountOpen(false);
                void signOut();
              }}
            />
          </div>
          {notice ? (
            <p className="mx-auto w-full max-w-7xl px-4 pb-3 text-sm text-muted lg:px-6">
              <span className="text-fg">{notice.title}.</span> {notice.detail}
            </p>
          ) : null}
        </header>

        <main className="relative mx-auto w-full min-w-0 max-w-7xl px-3 py-4 pb-24 sm:px-4 lg:px-6 xl:pb-10">
          {engineOpen ? (
            <DeskPage
              desk={engineDesk}
              viewer={viewer}
              identities={identities}
              groups={groups}
              servers={servers}
              feed={feed}
              audit={audit}
              products={products}
              opened={opened}
              account={viewerAccount}
              onAct={(line) => {
                const embed = run(line);
                ping(embed.title, embed.description);
                return embed;
              }}
              onOpenBusiness={(name) => {
                openBusiness(viewer.id, name);
                ping("Business opened", `${name} can list on the Official shop. Verification did not change.`);
              }}
              onOpenPlayer={(id) => {
                applySeat("play");
                openProfile(id);
              }}
              onShop={() => ping("Shop coming soon", "The Official shop is disabled while it's rebuilt.")}
              onReset={() => {
                reset();
              }}
              seller={
                <ShopPage
                  panel="desk"
                  viewer={viewer}
                  identities={identities}
                  products={products}
                  opened={opened}
                  subscribed={astroPass.includes(viewer.id)}
                  owned={owned[viewer.id] ?? []}
                  equipped={equipped[viewer.id] ?? null}
                  onSubscribe={() => {
                    subscribe(viewer.id);
                    ping("Astro started", "150 coins land on the next renewal. One clan can wear the animated banner.");
                  }}
                  onEndPass={() => {
                    endPass(viewer.id);
                    ping("Astro ended", "Applied cosmetics were cleared.");
                  }}
                  onEquip={(productId) => equip(viewer.id, productId)}
                  onOpenBusiness={(name) => {
                    openBusiness(viewer.id, name);
                    ping("Business opened", `${name} can list on the Official shop. Verification did not change.`);
                  }}
                  onCreate={(draft) => {
                    addProduct({ ...draft, sellerId: viewer.id, game: "Network" });
                    const sale = quote(draft.price, viewerAccount.verified);
                    ping("Product listed", `${draft.title} is on the Official shop at ${sale.label}.`);
                  }}
                  onBuy={() => null}
                  onOpenPlayer={openProfile}
                />
              }
            />
          ) : null}
          <div className={engineOpen ? "hidden" : ""}>
            {sectionTabs?.length ? <SectionTabs tabs={sectionTabs} section={section} tab={tab} onTab={goTab} /> : null}
            {section === "home" ? (
              <HomePage
                viewer={viewer}
                identities={identities}
                clans={clans}
                rank={rank}
                feed={feed}
                onNavigate={(next, nextTab) => goSection(next, nextTab ? { tab: nextTab } : undefined)}
                onOpenPlayer={openProfile}
              />
            ) : null}
            {section === "discover" ? (
              tab === "clans" ? (
                <GroupsPage viewer={viewer} identities={identities} />
              ) : (
                <DiscoverPage
                  identities={identities}
                  query={query}
                  game={game}
                  platform={platform}
                  region={region}
                  saved={saved}
                  onQuery={setQuery}
                  onGame={setGame}
                  onPlatform={setPlatform}
                  onRegion={setRegion}
                  onSave={toggleSaved}
                  onOpenPlayer={openProfile}
                  onClans={() => goSection("discover", { tab: "clans" })}
                  loading={directoryLoading}
                />
              )
            ) : null}
            {section === "compete" ? (
              tab === "rankings" ? (
                <RankingsPage
                  identities={identities}
                  viewerId={viewer.id}
                  game={game}
                  region={region}
                  follows={follows}
                  clanIds={clans.find((clan) => clan.id === viewer.clanId)?.memberIds ?? []}
                  onGame={setGame}
                  onRegion={setRegion}
                  onOpen={openProfile}
                />
              ) : (
                <CompetePage
                  viewer={viewer}
                  identities={identities}
                  clans={clans}
                  bounties={bounties}
                  onChallenge={challenge}
                  onWar={declareWar}
                  onStandDown={standDown}
                  onDiscover={(nextTab) => goSection("discover", nextTab ? { tab: nextTab } : undefined)}
                  onBounty={(id) => {
                    const bounty = bounties.includes(id);
                    toggleBounty(id);
                    ping(bounty ? "Left bounty" : "Bounty entered", bounty ? "You stepped out." : "The entry is on this identity.");
                  }}
                />
              )
            ) : null}
            {section === "messages" ? <MessagesPage viewer={viewer} identities={identities} /> : null}
            {section === "you" ? (
              tab === "settings" ? (
                <SettingsPage
                  viewer={viewer}
                  identities={identities}
                  session={session}
                  follows={follows}
                  blocked={blocked}
                  friendRequestPolicy={friendRequestPolicy}
                  groupInvitePolicy={groupInvitePolicy}
                  dmPolicy={dmPolicy}
                  onSave={saveHandle}
                  onRegion={saveRegion}
                  onFollow={toggleFollow}
                  onBlock={blockPlayer}
                  onUnblock={unblockPlayer}
                  onPolicy={savePolicies}
                  onLink={setLink}
                  onExportData={async () => {
                    const text = await exportMyData();
                    const blob = new Blob([text], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `koba-data-${viewer.handle}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  onDeleteAccount={async () => {
                    await deleteMyAccount();
                    await signOut();
                    window.location.href = "/";
                  }}
                />
              ) : tab === "clans" ? (
                <GroupsPage viewer={viewer} identities={identities} />
              ) : tab === "friends" ? (
                <SocialPage
                  viewer={viewer}
                  identities={identities}
                  clans={clans}
                  follows={follows}
                  favorites={favorites}
                  aliases={aliases}
                  tags={tags}
                  presence={presence}
                  onFollow={toggleFollow}
                  onFavorite={setFavorite}
                  onAlias={setFriendAlias}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  onToggleTagMember={toggleTagMember}
                  onOpen={openProfile}
                  onWhisper={() => goSection("messages")}
                />
              ) : (
                <ProfilePage
                  viewer={profile}
                  account={accountFor(profile.id, opened)}
                  rank={ranked.findIndex((identity) => identity.id === profile.id) + 1}
                  clanName={clanName(profile.clanId)}
                  followed={follows.includes(profile.id)}
                  self={profile.id === viewer.id}
                  equippedMotion={(() => {
                    const id = equipped[profile.id];
                    return products.find((item) => item.id === id)?.motion ?? null;
                  })()}
                  onFollow={() => toggleFollow(profile.id)}
                />
              )
            ) : null}
          </div>
          <SiteFooter className="hidden lg:block" />
        </main>
      </div>

      <nav className="dock fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
        {APP_SECTIONS.map((item) => {
          const on = desk === "play" && section === item.id;
          const count = item.id === "messages" ? unreadMessages : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => goSection(item.id)}
              aria-current={on ? "page" : undefined}
              aria-label={item.label}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[12px] ${on ? "text-fg" : "text-muted"}`}
            >
              <span className="relative">
                <Glyph name={SECTION_GLYPH[item.id]} on={on} size={22} />
                {count > 0 ? (
                  <span className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 font-mono text-[10px] leading-none font-semibold text-bg">
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <BadgeCelebration onView={() => goSection("you")} />
    </div>
  );
}

function AccountMenu({
  viewer,
  identities,
  open,
  onToggle,
  onPick,
  session,
  onSignOut,
}: {
  viewer: Identity;
  identities: Identity[];
  open: boolean;
  onToggle: (open: boolean) => void;
  onPick: (id: string) => void;
  session: SessionView;
  onSignOut: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const badgeMap = useResolvedBadges(identities);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) onToggle(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, onToggle]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={() => onToggle(!open)}
        className="flex h-11 items-center gap-2 rounded-full py-1 pr-2 pl-1 sm:pr-3"
      >
        <PlayerFace name={viewer.name} id={viewer.id} size="sm" avatarUrl={viewer.avatarUrl} />
        <span className="hidden max-w-28 truncate text-sm sm:inline">{viewer.name.split(" ")[0]}</span>
        <ChevronDown size={14} aria-hidden className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <button type="button" aria-label="Close account menu" className="fixed inset-0 z-30 bg-scrim/60 sm:hidden" onClick={() => onToggle(false)} /> : null}
      {open ? (
        <div role="menu" className="menu-pop fixed inset-x-0 bottom-0 z-40 max-h-[80dvh] overflow-y-auto rounded-t-3xl pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:bottom-auto sm:mt-1 sm:w-72 sm:rounded-2xl sm:pb-0">
          <p className="px-4 pt-3 font-mono text-xs tracking-widest text-faint uppercase">Play as</p>
          <p className="px-4 pb-1 text-xs text-muted">
            {session.name} · {session.provider}
            {session.email ? ` · ${session.email}` : ""}
          </p>
          <ul className="grid max-h-80 overflow-y-auto p-2">
            {identities.map((identity) => {
              const on = identity.id === viewer.id;
              return (
                <li key={identity.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => onPick(identity.id)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left ${on ? "bg-accent text-bg" : "text-fg hover:bg-bg-subtle"}`}
                  >
                    <PlayerFace name={identity.name} id={identity.id} size="sm" avatarUrl={identity.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{identity.name}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted">
                        @{identity.handle}
                        <BadgeRow pins={badgeMap[identity.id]?.verified ? [NAME_VERIFIED] : []} size={14} />
                      </span>
                    </span>
                    <span className="font-mono text-xs text-cyan">{identity.score.toLocaleString("en-US")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="grid border-t border-border p-2">
            {/* Settings lives under You as a tab - not here too. "Official
                shop" was also removed: Shop/Astro are disabled from public nav. */}
            <div className="flex items-center justify-between gap-2 px-3 py-1 sm:hidden">
              <span className="text-sm text-fg">Appearance</span>
              <ThemeToggle />
            </div>
            <button type="button" role="menuitem" onClick={onSignOut} className="min-h-11 rounded-xl px-3 text-left text-sm text-fg hover:bg-bg-subtle">
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * In-flow sub-tabs for a destination (Compete > Rankings, You > Settings...).
 * They intentionally live inside the page rather than in a second sticky bar,
 * so mobile keeps only the header and bottom dock fixed.
 */
function SectionTabs({
  tabs,
  section,
  tab,
  onTab,
}: {
  tabs: { id: string; label: string }[];
  section: AppSection;
  tab: string | null;
  onTab: (tab: string) => void;
}) {
  const items = tabs;
  if (items.length === 0) return null;
  return (
    <div role="tablist" aria-label={`${section} sections`} className="mb-4 flex gap-5 overflow-x-auto" data-noswipe>
      {items.map((item) => {
        const on = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(item.id)}
            className={`relative min-h-11 shrink-0 text-sm whitespace-nowrap transition-colors ${on ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {item.label}
            {on ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fg" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

function installTouchBridge(): () => void {
  let origin: EventTarget | null = null;
  let startX = 0;
  let startY = 0;
  let armed = false;
  const controlOf = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    if (target.closest("[data-badge]")) return null;
    const node = target.closest("button, a");
    if (!(node instanceof HTMLElement)) return null;
    if (node instanceof HTMLButtonElement && node.disabled) return null;
    return node;
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      origin = null;
      return;
    }
    origin = event.target;
    startX = event.clientX;
    startY = event.clientY;
  };
  const onUp = (event: PointerEvent) => {
    if ((event.pointerType !== "touch" && event.pointerType !== "pen") || !origin) return;
    const from = controlOf(origin);
    origin = null;
    if (!from) return;
    if (Math.abs(event.clientX - startX) > 12 || Math.abs(event.clientY - startY) > 12) return;
    if (controlOf(event.target) !== from) return;
    armed = true;
    window.setTimeout(() => {
      armed = false;
    }, 500);
    from.click();
  };
  const onClick = (event: MouseEvent) => {
    if (!armed || !event.isTrusted) return;
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("click", onClick, true);
  };
}


import { useEffect, useMemo, useRef, useState } from 'react';
import { ArenaLobby } from './components/ArenaLobby';
import { BrandLockup } from './components/Brand';
import { BusinessPortal } from './components/BusinessPortal';
import { FiltersSheet } from './components/FiltersSheet';
import { CampaignPreview } from './components/CampaignPreview';
import { AppFrame, LandingPage } from './components/LandingPage';
import { MatchOverlay } from './components/MatchOverlay';
import { PostsView } from './components/PostsView';
import { ProfileView } from './components/ProfileView';
import { RivalsView } from './components/RivalsView';
import { SwipeDeck } from './components/SwipeDeck';
import { BoardIcon, CardsIcon, SlidersIcon, SwordsIcon, UserIcon } from './components/ui';
import { PLAYERS } from './data/players';
import { currentAccount, signOut } from './lib/accounts';
import type { Account } from './lib/accounts';
import { adCreative, bumpCampaign, decodePreview, deliveringCampaigns } from './lib/ads';
import { loadSeenThreads, saveSeenThreads } from './lib/board';
import { useAds } from './lib/useAds';
import { stakeFor } from './lib/challenge';
import {
  completeSignIn,
  fetchKobaMe,
  fetchKobaPlayers,
  isKobaConfigured,
  isKobaSignedIn,
  kobaSignInUrl,
  kobaSignOut,
  reportSwipe,
} from './lib/kobaApi';
import { acceptChance, buildDeck, compatibility, primaryGame } from './lib/matchmaking';
import { buildPost } from './lib/posts';
import type { PostDraft } from './lib/posts';
import { loadState, saveState } from './lib/storage';
import type { Direction, Filters, KillTier, Match, PersistedState, Player, Post } from './types';

type View = 'deck' | 'posts' | 'rivals' | 'profile' | 'lobby';
type Shell = 'player' | 'business';

interface Toast {
  id: number;
  text: string;
}

/** Desktop is the marketing site; the product renders at phone width. */
function useWide(minWidth: number) {
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(`(min-width: ${minWidth}px)`).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [minWidth]);

  return wide;
}

export default function App() {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [ads, setAds] = useAds();
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [shell, setShell] = useState<Shell>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('business')
      ? 'business'
      : 'player',
  );
  const [view, setView] = useState<View>('deck');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<Match | null>(null);
  const [lobbyMatchId, setLobbyMatchId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [storageWarning, setStorageWarning] = useState(false);
  const [adHiddenAt, setAdHiddenAt] = useState<number | null>(null);
  const [seenThreads, setSeenThreads] = useState<Record<string, number>>(() => loadSeenThreads());
  const toastId = useRef(0);
  const adImpression = useRef<string | null>(null);

  const [kobaSignedIn, setKobaSignedIn] = useState(() => isKobaSignedIn());
  const [kobaGamertag, setKobaGamertag] = useState<string | null>(null);
  const [kobaPlayers, setKobaPlayers] = useState<Player[]>([]);
  const kobaAvailable = isKobaConfigured();

  const profile = state.profile;
  const allPlayers = useMemo(() => [...PLAYERS, ...kobaPlayers], [kobaPlayers]);
  const findPlayer = (id: string) => allPlayers.find((entry) => entry.id === id);

  const refreshKoba = () => {
    void fetchKobaMe().then((me) => setKobaGamertag(me?.gamertag ?? null));
    void fetchKobaPlayers().then(setKobaPlayers);
  };

  useEffect(() => {
    void completeSignIn().then((justSignedIn) => {
      if (justSignedIn) setKobaSignedIn(true);
      if (justSignedIn || isKobaSignedIn()) refreshKoba();
    });
  }, []);

  const connectKoba = () => {
    const url = kobaSignInUrl();
    if (!url) {
      pushToast('KOBA connection is not configured for this build.');
      return;
    }
    window.location.href = url;
  };

  const disconnectKoba = () => {
    kobaSignOut();
    setKobaSignedIn(false);
    setKobaGamertag(null);
    setKobaPlayers([]);
    pushToast('Disconnected from KOBA.');
  };

  useEffect(() => {
    setStorageWarning(!saveState(state));
  }, [state]);

  useEffect(() => {
    saveSeenThreads(seenThreads);
  }, [seenThreads]);

  const pushToast = (text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-1), { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2600);
  };

  const pool = useMemo(() => buildDeck(profile, allPlayers, state.filters), [profile, allPlayers, state.filters]);

  const deck = useMemo(() => {
    const remaining = pool.filter((player) => !state.decisions[player.id]);
    if (!pinnedId) return remaining;
    const pinned = remaining.find((player) => player.id === pinnedId);
    if (!pinned) return remaining;
    return [pinned, ...remaining.filter((player) => player.id !== pinnedId)];
  }, [pool, state.decisions, pinnedId]);

  const swipes = Object.keys(state.decisions).length;

  /** Paid placements run one card after every third swipe, never inside the pool. */
  const sponsored = useMemo(() => {
    if (swipes % 3 !== 1 || adHiddenAt === swipes) return null;
    const pool = deliveringCampaigns(ads, profile.games.map((game) => game.gameId));
    if (pool.length === 0) return null;
    return pool[Math.floor(swipes / 3) % pool.length];
  }, [ads, swipes, adHiddenAt, profile.games]);

  const sponsoredId = sponsored?.id;

  useEffect(() => {
    if (!sponsoredId) return;
    const key = `${sponsoredId}:${swipes}`;
    if (adImpression.current === key) return;
    adImpression.current = key;
    setAds(bumpCampaign(ads, sponsoredId, 'impressions'));
  }, [sponsoredId, swipes, ads, setAds]);

  const decide = (player: Player, direction: Direction) => {
    setPinnedId(null);
    if (kobaSignedIn) {
      void reportSwipe().then((result) => {
        if (result.limitReached) pushToast("Daily swipe limit reached - upgrade to Pro for unlimited swipes.");
      });
    }
    const fit = compatibility(profile, player, state.filters);
    const accepted = direction === 'right' && Math.random() < acceptChance(fit.score);
    const match: Match | null = accepted
      ? {
          id: `${player.id}-${Date.now()}`,
          playerId: player.id,
          gameId: primaryGame(player, state.filters).gameId,
          fit: fit.score,
          createdAt: Date.now(),
          challenged: false,
        }
      : null;

    setState((prev) => ({
      ...prev,
      decisions: { ...prev.decisions, [player.id]: direction },
      matches: match ? [match, ...prev.matches] : prev.matches,
    }));

    if (match) setPendingMatch(match);
    else if (direction === 'right') pushToast(`Rival request sent to @${player.username}`);
  };

  const undo = () => {
    const last = Object.entries(state.decisions).pop();
    if (!last) return;
    const [playerId] = last;
    setState((prev) => {
      const decisions = { ...prev.decisions };
      delete decisions[playerId];
      return { ...prev, decisions, matches: prev.matches.filter((m) => m.playerId !== playerId) };
    });
    setPinnedId(playerId);
    setView('deck');
  };

  const updateFilters = (filters: Filters) => {
    setPinnedId(null);
    setState((prev) => ({ ...prev, filters }));
  };

  const resetDeck = () => {
    setPinnedId(null);
    setPendingMatch(null);
    setLobbyMatchId(null);
    setState((prev) => ({ ...prev, decisions: {} }));
    pushToast('Deck reset — everyone is back in play');
    setView('deck');
  };

  const patchProfile = (patch: Partial<Player>) => {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
  };

  const openLobby = (matchId: string) => {
    setLobbyMatchId(matchId);
    setView('lobby');
  };

  const lockChallenge = (matchId: string, kills: KillTier, serverId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.map((match) =>
        match.id === matchId
          ? { ...match, challenged: true, kills, serverId, stake: stakeFor(kills) }
          : match,
      ),
    }));
    pushToast(`${kills}-kill challenge locked`);
    setView('rivals');
  };

  const postCallout = (draft: PostDraft) => {
    setState((prev) => ({ ...prev, posts: [buildPost(prev.profile, draft), ...prev.posts] }));
    pushToast('Callout posted to the board');
  };

  const removePost = (id: string) => {
    setState((prev) => ({
      ...prev,
      posts: prev.posts.filter((post) => post.id !== id),
      replies: prev.replies.filter((reply) => reply.postId !== id),
    }));
    pushToast('Callout removed');
  };

  const replyToPost = (postId: string, body: string) => {
    const trimmed = body.trim().slice(0, 180);
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      replies: [
        ...prev.replies,
        {
          id: `reply-${Date.now()}`,
          postId,
          playerId: 'me',
          body: trimmed,
          createdAt: Date.now(),
        },
      ],
    }));
    pushToast('Reply posted to the thread');
  };

  const markThreadSeen = (postId: string) => {
    setSeenThreads((prev) => ({ ...prev, [postId]: Date.now() }));
  };

  /** Taking a callout skips the deck and drops both players into the lobby. */
  const challengePost = (post: Post) => {
    const player = findPlayer(post.playerId);
    if (!player) return;
    const match: Match = {
      id: `${player.id}-${Date.now()}`,
      playerId: player.id,
      gameId: post.gameId,
      fit: compatibility(profile, player, state.filters).score,
      createdAt: Date.now(),
      challenged: false,
    };
    setState((prev) => ({ ...prev, matches: [match, ...prev.matches] }));
    setLobbyMatchId(match.id);
    setView('lobby');
    pushToast(`Challenge opened with @${player.username}`);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${text} copied`);
    } catch {
      pushToast(text);
    }
  };

  const openSponsored = () => {
    if (!sponsored) return;
    const creative = adCreative(sponsored);
    setAds(bumpCampaign(ads, sponsored.id, 'clicks'));
    if (creative.serverIp) void copyText(creative.serverIp);
    else pushToast(`${creative.sponsor}: landing page is not wired in this prototype`);
  };

  const hideSponsored = () => {
    setAdHiddenAt(swipes);
    pushToast('Sponsored card hidden');
  };

  const handleSignOut = () => {
    signOut();
    setAccount(null);
    pushToast('Signed out of the business console');
  };

  const lobbyMatch = lobbyMatchId
    ? state.matches.find((match) => match.id === lobbyMatchId)
    : undefined;
  const lobbyPlayer = lobbyMatch ? findPlayer(lobbyMatch.playerId) : undefined;
  const pendingPlayer = pendingMatch ? findPlayer(pendingMatch.playerId) : undefined;

  const myPostIds = useMemo(
    () => new Set(state.posts.filter((post) => post.playerId === 'me').map((post) => post.id)),
    [state.posts],
  );

  /** Replies to your own callouts whose thread you have not opened yet. */
  const unreadCount = useMemo(
    () =>
      state.replies.filter(
        (reply) =>
          myPostIds.has(reply.postId) &&
          reply.playerId !== 'me' &&
          reply.createdAt > (seenThreads[reply.postId] ?? 0),
      ).length,
    [state.replies, myPostIds, seenThreads],
  );

  const activeFilterCount = state.filters.gameIds.length + state.filters.platforms.length;
  const canUndo = Object.keys(state.decisions).length > 0;
  const tabView: View = view === 'lobby' ? 'rivals' : view;

  // Desktop gets the landing page; the app is presented as a mobile screen.
  const wide = useWide(900);
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
  const embedded = Boolean(params?.has('embed'));
  const desktopApp = Boolean(params?.has('app'));
  const businessEntry = Boolean(params?.has('business'));

  // A shareable preview carries the creative in the URL, so it needs no account.
  const previewParam = params?.get('preview');
  if (previewParam) {
    const payload = decodePreview(previewParam);
    if (payload) return <CampaignPreview payload={payload} />;
  }

  if (!embedded && !businessEntry && wide) {
    return desktopApp ? <AppFrame /> : <LandingPage />;
  }

  const toastLayer = (
    <div className="toasts" aria-live="polite">
      {storageWarning && (
        <div className="toast is-warn">
          <span className="toast-dot" aria-hidden="true" />
          Local storage is full — uploads may not survive a reload
        </div>
      )}
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <span className="toast-dot" aria-hidden="true" />
          {toast.text}
        </div>
      ))}
    </div>
  );

  if (shell === 'business') {
    return (
      <>
        <BusinessPortal
          account={account}
          onAuthenticated={(next) => {
            setAccount(next);
            pushToast(`Signed in as ${next.company}`);
          }}
          onSignOut={handleSignOut}
          onExit={() => setShell('player')}
          onCopy={copyText}
          onNotify={pushToast}
        />
        {toastLayer}
      </>
    );
  }

  return (
    <div className="app">
      <aside className="rail">
        <BrandLockup subtitle="Swipe. Spar. Repeat." />

        <nav className="rail-nav" aria-label="Primary">
          <button
            type="button"
            className={tabView === 'deck' ? 'is-active' : ''}
            onClick={() => setView('deck')}
          >
            <CardsIcon size={20} /> Discover
            <span className="nav-count">{deck.length}</span>
          </button>
          <button
            type="button"
            className={tabView === 'posts' ? 'is-active' : ''}
            onClick={() => setView('posts')}
          >
            <BoardIcon size={20} /> Board
            {unreadCount > 0 ? (
              <span className="nav-count is-unread">{unreadCount}</span>
            ) : (
              <span className="nav-count">{state.posts.length}</span>
            )}
          </button>
          <button
            type="button"
            className={tabView === 'rivals' ? 'is-active' : ''}
            onClick={() => setView('rivals')}
          >
            <SwordsIcon size={20} /> Rivals
            <span className="nav-count">{state.matches.length}</span>
          </button>
          <button
            type="button"
            className={tabView === 'profile' ? 'is-active' : ''}
            onClick={() => setView('profile')}
          >
            <UserIcon size={20} /> Your card
          </button>
          <button type="button" onClick={() => setFiltersOpen(true)}>
            <SlidersIcon size={19} /> Matchmaking
            {activeFilterCount > 0 && <span className="nav-count">{activeFilterCount}</span>}
          </button>
        </nav>

        <div className="rail-foot">
          <p className="rail-label">Signed in as</p>
          <p className="rail-handle">@{profile.username}</p>
          <p className="rail-sub">
            {profile.score.toLocaleString('en-US')} RP · {profile.region}
          </p>
          <button type="button" className="rail-business" onClick={() => setShell('business')}>
            {account ? `${account.company} console →` : 'Business portal →'}
          </button>
        </div>
      </aside>

      <main className="stage">
        <header className="topbar">
          <div className="mobile-brand">
            <BrandLockup />
          </div>
          <button
            type="button"
            className="filter-btn"
            onClick={() => setFiltersOpen(true)}
            aria-label="Open matchmaking filters"
          >
            <SlidersIcon size={15} />
            {activeFilterCount > 0 ? `${activeFilterCount} filters` : 'Filters'}
          </button>
        </header>

        <div className="content">
          {view === 'deck' && (
            <SwipeDeck
              me={profile}
              players={deck}
              filters={state.filters}
              canUndo={canUndo}
              paused={filtersOpen || pendingMatch !== null}
              sponsored={sponsored}
              onSponsoredOpen={openSponsored}
              onSponsoredHide={hideSponsored}
              onDecide={decide}
              onUndo={undo}
              onOpenFilters={() => setFiltersOpen(true)}
              onReset={resetDeck}
            />
          )}

          {view === 'posts' && (
            <PostsView
              me={profile}
              posts={state.posts}
              replies={state.replies}
              seenThreads={seenThreads}
              onThreadSeen={markThreadSeen}
              onCreate={postCallout}
              onRemove={removePost}
              onChallenge={challengePost}
              onReply={replyToPost}
              onOpenDeck={() => setView('deck')}
            />
          )}

          {view === 'rivals' && (
            <RivalsView
              matches={state.matches}
              onOpenLobby={openLobby}
              onFindRivals={() => setView('deck')}
            />
          )}

          {view === 'profile' && (
            <ProfileView
              profile={profile}
              matches={state.matches}
              swipes={swipes}
              account={account}
              kobaGamertag={kobaGamertag}
              kobaSignedIn={kobaSignedIn}
              kobaAvailable={kobaAvailable}
              onConnectKoba={connectKoba}
              onDisconnectKoba={disconnectKoba}
              onPatch={patchProfile}
              onResetDeck={resetDeck}
              onOpenFilters={() => setFiltersOpen(true)}
              onOpenBusiness={() => setShell('business')}
              onSignOut={handleSignOut}
              onNotify={pushToast}
            />
          )}

          {view === 'lobby' && lobbyMatch && lobbyPlayer && (
            <ArenaLobby
              me={profile}
              player={lobbyPlayer}
              match={lobbyMatch}
              onBack={() => setView('rivals')}
              onLock={(kills, serverId) => lockChallenge(lobbyMatch.id, kills, serverId)}
              onCopy={copyText}
            />
          )}
        </div>

        <nav className="tabbar" aria-label="Primary">
          <button
            type="button"
            className={tabView === 'deck' ? 'is-active' : ''}
            onClick={() => setView('deck')}
          >
            <CardsIcon size={20} />
            <span>Discover</span>
          </button>
          <button
            type="button"
            className={tabView === 'posts' ? 'is-active' : ''}
            onClick={() => setView('posts')}
          >
            <BoardIcon size={20} />
            <span>Board</span>
            {unreadCount > 0 ? (
              <i className="tab-badge is-unread">{unreadCount}</i>
            ) : (
              state.posts.length > 0 && <i className="tab-badge">{state.posts.length}</i>
            )}
          </button>
          <button
            type="button"
            className={tabView === 'rivals' ? 'is-active' : ''}
            onClick={() => setView('rivals')}
          >
            <SwordsIcon size={20} />
            <span>Rivals</span>
            {state.matches.length > 0 && <i className="tab-badge">{state.matches.length}</i>}
          </button>
          <button
            type="button"
            className={tabView === 'profile' ? 'is-active' : ''}
            onClick={() => setView('profile')}
          >
            <UserIcon size={20} />
            <span>You</span>
          </button>
        </nav>
      </main>

      {filtersOpen && (
        <FiltersSheet
          filters={state.filters}
          available={pool.length}
          onChange={updateFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {pendingMatch && pendingPlayer && (
        <MatchOverlay
          me={profile}
          player={pendingPlayer}
          match={pendingMatch}
          onClose={() => setPendingMatch(null)}
          onEnterLobby={() => {
            openLobby(pendingMatch.id);
            setPendingMatch(null);
          }}
        />
      )}

      {toastLayer}
    </div>
  );
}

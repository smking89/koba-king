import type { FormEvent } from 'react';
import { useState } from 'react';
import { getGame } from '../data/games';
import { playerById } from '../data/players';
import { rankHint, roleHint } from '../lib/glossary';
import type { SeenThreads } from '../lib/board';
import { TIER_COPY, TIER_NAME, TIME_WINDOWS, timeAgo } from '../lib/posts';
import type { PostDraft } from '../lib/posts';
import type { KillTier, Player, Post, PostReply } from '../types';
import { Select } from './Select';
import { Avatar, CheckIcon, GameLogo, ScorePill, SendIcon, SwordsIcon } from './ui';

const KILLS: KillTier[] = [3, 5, 10];

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`thread-caret${open ? ' is-open' : ''}`}
    >
      <path d="m6 9.5 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PostsViewProps {
  me: Player;
  posts: Post[];
  replies: PostReply[];
  seenThreads: SeenThreads;
  onThreadSeen: (postId: string) => void;
  onCreate: (draft: PostDraft) => void;
  onRemove: (id: string) => void;
  onChallenge: (post: Post) => void;
  onReply: (postId: string, body: string) => void;
  onOpenDeck: () => void;
}

export function PostsView({
  me,
  posts,
  replies,
  seenThreads,
  onThreadSeen,
  onCreate,
  onRemove,
  onChallenge,
  onReply,
  onOpenDeck,
}: PostsViewProps) {
  const [gameId, setGameId] = useState(me.games[0]?.gameId ?? 'valorant');
  const [killTier, setKillTier] = useState<KillTier>(5);
  const [slot, setSlot] = useState(TIME_WINDOWS[1]);
  const [note, setNote] = useState('');
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const ordered = [...posts].sort(
    (a, b) =>
      Number(b.playerId === 'me') - Number(a.playerId === 'me') || b.createdAt - a.createdAt,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({ gameId, killTier, window: slot, note });
    setNote('');
  };

  const unreadOn = (postId: string) =>
    replies.filter(
      (reply) =>
        reply.postId === postId &&
        reply.playerId !== 'me' &&
        reply.createdAt > (seenThreads[postId] ?? 0),
    ).length;

  const toggleThread = (postId: string) => {
    const next = !openThreads[postId];
    if (next) onThreadSeen(postId);
    setOpenThreads((prev) => ({ ...prev, [postId]: next }));
  };

  const sendReply = (event: FormEvent, postId: string) => {
    event.preventDefault();
    const body = (drafts[postId] ?? '').trim();
    if (!body) return;
    onReply(postId, body);
    setDrafts((prev) => ({ ...prev, [postId]: '' }));
    setOpenThreads((prev) => ({ ...prev, [postId]: true }));
  };

  return (
    <div className="scroll-view">
      <header className="view-head">
        <h1>Callout board</h1>
        <p>
          Post what you want to play and when. Reply in the thread to settle the time, then take it
          into a lobby — no swipe required.
        </p>
      </header>

      <form className="panel composer" onSubmit={submit}>
        <div className="composer-head">
          <h2>Post a callout</h2>
          <span className="composer-hint">Goes out as @{me.username}</span>
        </div>

        <div className="composer-row">
          <span className="composer-label">Your game &amp; rank</span>
          <div className="chip-grid">
            {me.games.map((entry) => (
              <button
                type="button"
                key={entry.gameId}
                className={`chip-select chip-with-logo${gameId === entry.gameId ? ' is-active' : ''}`}
                onClick={() => setGameId(entry.gameId)}
                aria-pressed={gameId === entry.gameId}
                title={rankHint(entry.rank, getGame(entry.gameId).name)}
              >
                <GameLogo game={getGame(entry.gameId)} className="chip-select-logo" />
                {getGame(entry.gameId).short} · {entry.rank}
              </button>
            ))}
          </div>
        </div>

        <div className="composer-row">
          <span className="composer-label">
            Kill tier <em>{TIER_COPY[killTier]}</em>
          </span>
          <div className="chip-grid">
            {KILLS.map((tier) => (
              <button
                type="button"
                key={tier}
                className={`chip-select${killTier === tier ? ' is-active' : ''}`}
                onClick={() => setKillTier(tier)}
                aria-pressed={killTier === tier}
              >
                {tier} · {TIER_NAME[tier]}
              </button>
            ))}
          </div>
        </div>

        <div className="composer-row">
          <span className="composer-label">When</span>
          <Select
            label="Challenge window"
            value={slot}
            onChange={setSlot}
            options={TIME_WINDOWS.map((option) => ({ value: option, label: option }))}
          />
        </div>

        <label className="composer-row">
          <span className="composer-label">Say something</span>
          <textarea
            rows={3}
            maxLength={140}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Mic on until 1am. Looking for someone who calls rotations and reviews the loss."
          />
          <em className="composer-count">{note.length}/140</em>
        </label>

        <div className="composer-foot">
          <button type="submit" className="btn btn-gradient">
            <SendIcon size={14} /> Post callout
          </button>
          <button type="button" className="btn btn-text" onClick={onOpenDeck}>
            Keep swiping instead
          </button>
        </div>
      </form>

      <div className="board-head">
        <h2>Open callouts</h2>
        <span>{ordered.length} live</span>
      </div>

      {ordered.length === 0 ? (
        <div className="empty-state">
          <h2>Nothing on the board</h2>
          <p>Be the first to post what you're looking for tonight.</p>
        </div>
      ) : (
        <ul className="post-list">
          {ordered.map((post) => {
            const author = post.playerId === 'me' ? me : playerById(post.playerId) ?? me;
            const game = getGame(post.gameId);
            const mine = post.playerId === 'me';
            const thread = replies
              .filter((reply) => reply.postId === post.id)
              .sort((a, b) => a.createdAt - b.createdAt);
            const isOpen = Boolean(openThreads[post.id]);
            const draft = drafts[post.id] ?? '';
            const unread = post.playerId === 'me' ? unreadOn(post.id) : 0;

            return (
              <li className="post-card" key={post.id}>
                <div className="post-head">
                  <Avatar player={author} size={38} />
                  <div className="post-who">
                    <strong>
                      {author.displayName}
                      {author.verified && (
                        <span className="verified" title="Verified platform account">
                          <CheckIcon size={9} />
                        </span>
                      )}
                    </strong>
                    <span>
                      @{author.username} · {timeAgo(post.createdAt)}
                    </span>
                  </div>
                  {mine ? (
                    <span className="post-yours">Yours</span>
                  ) : (
                    <ScorePill value={author.score} small />
                  )}
                </div>

                <div className="post-tags">
                  <span className="post-tag post-tag-game">
                    <GameLogo game={game} className="post-tag-logo" />
                    {game.short}
                  </span>
                  <span className="post-tag" title={rankHint(post.rank, game.name)}>
                    {post.rank}
                  </span>
                  <span className="post-tag" title={roleHint(post.role)}>
                    {post.role}
                  </span>
                  <span className="post-tag">
                    {post.killTier} kills · {TIER_NAME[post.killTier]}
                  </span>
                </div>

                <p className="post-note">
                  <strong>{post.window}</strong> — {post.note || 'Open to whatever the squad needs.'}
                </p>

                <div className="post-foot">
                  <span className="post-server">
                    {post.platform} · {post.region}
                  </span>
                  <div className="post-foot-actions">
                    {unread > 0 && <span className="post-new">{`${unread} new`}</span>}
                    <button
                      type="button"
                      className={`thread-toggle${thread.length > 0 ? ' has-replies' : ''}`}
                      aria-expanded={isOpen}
                      onClick={() => toggleThread(post.id)}
                    >
                      {thread.length === 0
                        ? 'Reply'
                        : `${thread.length} ${thread.length === 1 ? 'reply' : 'replies'}`}
                      <Caret open={isOpen} />
                    </button>
                    {mine ? (
                      <button type="button" className="btn btn-text" onClick={() => onRemove(post.id)}>
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-gradient post-cta"
                        onClick={() => onChallenge(post)}
                      >
                        <SwordsIcon size={14} /> Challenge
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="post-thread">
                    {thread.length > 0 && (
                      <ul className="thread-list">
                        {thread.map((reply) => {
                          const replyAuthor =
                            reply.playerId === 'me' ? me : playerById(reply.playerId) ?? me;
                          return (
                            <li className="thread-reply" key={reply.id}>
                              <Avatar player={replyAuthor} size={26} />
                              <div className="thread-reply-body">
                                <span className="thread-meta">
                                  <strong>{replyAuthor.displayName}</strong> · {timeAgo(reply.createdAt)}
                                </span>
                                <p className="thread-text">{reply.body}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form className="thread-compose" onSubmit={(event) => sendReply(event, post.id)}>
                      <input
                        value={draft}
                        maxLength={180}
                        onChange={(event) =>
                          setDrafts((prev) => ({ ...prev, [post.id]: event.target.value }))
                        }
                        placeholder="Suggest a time, ask about rank…"
                        aria-label={`Reply to ${author.displayName}'s callout`}
                      />
                      <button
                        type="submit"
                        className="thread-send"
                        disabled={!draft.trim()}
                        aria-label="Send reply"
                      >
                        <SendIcon size={13} />
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="view-foot">
        A callout skips the deck: taking one opens the Arena Lobby with that player, where you pick the
        kill tier and lock a server. Swiping is still how you discover players who have not posted.
      </p>
    </div>
  );
}

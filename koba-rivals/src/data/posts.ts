import { primaryGame } from '../lib/matchmaking';
import type { KillTier, Post, PostReply } from '../types';
import { ME, PLAYERS } from './players';

const NOTES = [
  'Two-stack looking for a squad that calls rotations. We will run your strat, just talk.',
  'Fresh back from a break, rusty but still climbing. Want someone who reviews the loss with me.',
  'No mic required. Ping everything and I will do the same. Playing until the caffeine runs out.',
  'Grinding back to my old rank. Bring your main, no smurfs, no excuses.',
  'I only play one agent and I am not sorry about it. Looking for a duo with better aim than mine.',
  'Late-night queue. Chasing a 10-kill grudge match before the season rolls over.',
  'Learning a new character and need someone patient who will not rage in the first round.',
  'One win away from the next tier. Someone hold the line while I overextend.',
];

const WINDOWS = [
  'Tonight · 20:00–23:00',
  'Right now · next 2 hours',
  'Tomorrow · 18:00–21:00',
  'Weekend · 14:00–18:00',
  'Flexible this week',
];

const KILLS: KillTier[] = [5, 3, 10, 5, 3, 10, 3, 5];

const ROSTER_POSTS: Post[] = PLAYERS.slice(0, 8).map((player, index) => {
  const primary = primaryGame(player);
  return {
    id: `post-${player.id}`,
    playerId: player.id,
    gameId: primary.gameId,
    rank: primary.rank,
    role: primary.role,
    killTier: KILLS[index % KILLS.length],
    window: WINDOWS[index % WINDOWS.length],
    note: NOTES[index % NOTES.length],
    region: player.region,
    platform: player.platform,
    createdAt: Date.now() - (index + 1) * 47 * 60 * 1000,
    status: 'open',
  };
});

/** A callout of your own, so the unread badge has something real to point at. */
const MY_POST: Post = {
  id: 'post-me-seed',
  playerId: 'me',
  gameId: 'valorant',
  rank: 'Immortal 2',
  role: 'Duelist',
  killTier: 5,
  window: 'Tonight · 20:00–23:00',
  note: 'Running a 5-kill Vendetta at 21:00. I want someone who reviews the loss, not just the scoreboard.',
  region: ME.region,
  platform: ME.platform,
  createdAt: Date.now() - 118 * 60 * 1000,
  status: 'open',
};

/** Seeded callouts from the same roster the deck uses, so posts always match real profiles. */
export const SEED_POSTS: Post[] = [MY_POST, ...ROSTER_POSTS];

const REPLY_SEED: Array<{ postId: string; playerId: string; body: string; minutes: number }> = [
  {
    postId: 'post-p1',
    playerId: 'p4',
    body: '20:00 works for me. I can call rotations if you take the 5-kill.',
    minutes: 34,
  },
  {
    postId: 'post-p1',
    playerId: 'p7',
    body: 'Room for one more? I main the same agent, so I can flex instead.',
    minutes: 21,
  },
  {
    postId: 'post-p2',
    playerId: 'p3',
    body: 'Same, just back from a break. Happy to start with a Skirmish and see how it goes.',
    minutes: 63,
  },
  {
    postId: 'post-p3',
    playerId: 'p6',
    body: "No mic is fine — I'll ping everything. What region are you in?",
    minutes: 41,
  },
  {
    postId: 'post-p4',
    playerId: 'p9',
    body: 'Send your main and I will fill around it. I am free after 19:00.',
    minutes: 18,
  },
  {
    postId: 'post-me-seed',
    playerId: 'p2',
    body: '21:00 works for me. Happy to review the vod after — I will bring notes.',
    minutes: 26,
  },
  {
    postId: 'post-me-seed',
    playerId: 'p6',
    body: 'Still need one? Same rank, same region, and I do not tilt.',
    minutes: 9,
  },
  {
    postId: 'post-p6',
    playerId: 'p2',
    body: 'Count me in for the 10-kill. I have until 2am, then I am done for the season.',
    minutes: 12,
  },
  {
    postId: 'post-p6',
    playerId: 'p5',
    body: 'Only if you actually review the vod after. Last grudge match nobody said a word.',
    minutes: 8,
  },
];

export const SEED_REPLIES: PostReply[] = REPLY_SEED.map((reply, index) => ({
  id: `reply-seed-${index}`,
  postId: reply.postId,
  playerId: reply.playerId,
  body: reply.body,
  createdAt: Date.now() - reply.minutes * 60 * 1000,
}));

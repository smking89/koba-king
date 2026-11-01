"use strict";

/**
 * KOBA Server Achievements - a NEW badge-shaped concept, but for a
 * directory-listed Rust server itself (database/schema.sql's
 * directory_servers), not a player. Mirrors the player-facing tier systems
 * (config/progressionRanks.js, config/kobaScoreTiers.js, config/subBadges.js)
 * in shape, but is its own independent track - earning this says nothing
 * about any individual player's KOBA Rank/Score/tenure, and vice versa.
 *
 * A server's score is a single composite number built from three real,
 * already-tracked signals (no new fabricated metric):
 *   - events hosted   -> directory_servers.events_hosted_count
 *                        (utils/sessionManager.js's createSession, see its
 *                        header - counts the act of scheduling a Session)
 *   - events completed -> directory_servers.events_completed_count
 *                        (createSession's active->ended transition)
 *   - followers        -> db.getDirectoryFollowerCount(guildId)
 *                        (COUNT of the existing directory_follows table)
 *
 * Icon set: purchased "2D Icons - 150 Space Rank" pack, style_3 (a distinct
 * chevron/wings design from style_6, which config/progressionRanks.js
 * already uses for the PLAYER KOBA Rank track - deliberately different
 * artwork so the two tracks are never visually confused on a card/embed
 * that shows both).
 */

const BADGE_BASE_URL = "https://kobabot.store/game-icons/server-achievements";

const EVENT_HOSTED_WEIGHT = 5; // scheduling an event at all - initiative signal
const EVENT_COMPLETED_WEIGHT = 15; // seeing an event through - the stronger signal
const FOLLOWER_WEIGHT = 1; // cheap, but scales with real audience size

const SERVER_ACHIEVEMENT_TIERS = [
  { threshold: 0, name: "Outpost", file: "tier-1-outpost.png" },
  { threshold: 50, name: "Fortified Camp", file: "tier-2-fortified-camp.png" },
  { threshold: 150, name: "Established Base", file: "tier-3-established-base.png" },
  { threshold: 350, name: "Garrison", file: "tier-4-garrison.png" },
  { threshold: 700, name: "Stronghold", file: "tier-5-stronghold.png" },
  { threshold: 1200, name: "Command Post", file: "tier-6-command-post.png" },
  { threshold: 2000, name: "Regional HQ", file: "tier-7-regional-hq.png" },
  { threshold: 3200, name: "Elite Base", file: "tier-8-elite-base.png" },
  { threshold: 5000, name: "Apex Command", file: "tier-9-apex-command.png" },
  { threshold: 8000, name: "KOBA Flagship", file: "tier-10-flagship.png" },
];

/** Pure function - callers pass in the three raw counts (no db access here), same convention as config/kobaScoreTiers.js's scoreTierFor. */
function computeServerAchievementScore({ eventsHosted = 0, eventsCompleted = 0, followers = 0 }) {
  return eventsHosted * EVENT_HOSTED_WEIGHT + eventsCompleted * EVENT_COMPLETED_WEIGHT + followers * FOLLOWER_WEIGHT;
}

function serverAchievementTierForScore(score) {
  let best = SERVER_ACHIEVEMENT_TIERS[0];
  for (const tier of SERVER_ACHIEVEMENT_TIERS) {
    if (score >= tier.threshold) best = tier;
  }
  return { ...best, badgeUrl: `${BADGE_BASE_URL}/${best.file}` };
}

/** Next tier + points remaining, for a progress display - null nextTier at max tier (nothing further to show, same "atMaxLevel" convention as utils/progression.js's getLevelInfo). */
function nextServerAchievementTier(score) {
  const currentIndex = SERVER_ACHIEVEMENT_TIERS.findIndex((t) => t.threshold > score);
  if (currentIndex === -1) return { nextTier: null, pointsToNext: 0 };
  const next = SERVER_ACHIEVEMENT_TIERS[currentIndex];
  return { nextTier: { ...next, badgeUrl: `${BADGE_BASE_URL}/${next.file}` }, pointsToNext: next.threshold - score };
}

module.exports = {
  SERVER_ACHIEVEMENT_TIERS,
  computeServerAchievementScore,
  serverAchievementTierForScore,
  nextServerAchievementTier,
};

"use strict";

const db = require("../database/db");
const { runPlayerCountTick, runOfficialStatsTick } = require("./globalStatus");
const { runAutoMessagesTick } = require("./autoMessages");
const { runTempRoleExpiryTick } = require("./referralRewards");
const { runCategoryLeaderboardTick, runCategoryLeaderboardImageTick } = require("./categoryLeaderboards");
const { runPendingRoleGrantsTick } = require("./linkPanel");
const { runTicketArchiveExpiryTick } = require("./tickets");
const { refreshDiscordInviteTick } = require("./discordInvite");
const { runRconWarmupTick } = require("./rconWarmup");
const { runSessionSchedulerTick } = require("./sessionManager");
const { getRcon } = require("../rcon/manager");
const { formatStyledMessage } = require("./messageStyle");
const { syncGuildOwnerPlanRole } = require("./systemRoles");
const { getGuildPlan } = require("./premium");
const { postHeartbeat } = require("./botHealthAlerts");
const { runBountyExpiryTick } = require("./killfeedEngine");
const { runDuelExpiryTick } = require("./duelTracker");
const { runPositionPollTick, POLL_INTERVAL_MS: COMBAT_POSITION_POLL_INTERVAL_MS } = require("./combatPositionTracker");

const HEARTBEAT_MS = 5000; // scheduler resolution
const GLOBAL_STATUS_INTERVAL_MS = 5 * 60 * 1000; // player count/queue + official stats refresh every 5 min - also lines up with Discord's own ~2-renames-per-10min channel rate limit, so this isn't wastefully polling RCON faster than a rename could actually land anyway
const LEADERBOARD_ROLLOVER_INTERVAL_MS = 5 * 60 * 1000; // period boundaries only change at most once a day - no need to check every heartbeat
const LEADERBOARD_IMAGE_REFRESH_MS = 10 * 60 * 1000; // matches the reference implementation's "refresh every 10 min"
const TEMP_ROLE_EXPIRY_INTERVAL_MS = 60 * 1000; // cheap DB scan, but no need to check every 5s
const ROLE_GRANT_INTERVAL_MS = 15 * 1000; // a player waiting to see their link land in Discord should see it within moments, not up to a full minute
const AD_BROADCAST_INTERVAL_MS = 15 * 60 * 1000; // "POWERED BY KOBA Bot" - green by default (see utils/messageStyle.js 'ad' category)
// Added 2026-09-07: self-healing safety net for the basic/pro/max guild-owner
// tier role (utils/systemRoles.js's syncGuildOwnerPlanRole) - a plan change
// can come from /manage-licenses, a claimed license, or a Tip4Serv webhook,
// none of which have a live Discord client of their own to push the role
// update immediately, so this just re-checks every guild's real plan
// periodically instead of hooking into every possible change path.
const PLAN_ROLE_SYNC_INTERVAL_MS = 10 * 60 * 1000;

const lastPlayerCountPollAt = new Map();
const lastAdBroadcastAt = new Map();
const lastPlanRoleSyncAt = new Map();
let lastOfficialStatsPollAt = 0;
let lastLeaderboardImageAt = 0;
let lastTempRoleExpiryAt = 0;
let lastSessionSchedulerAt = 0;
const SESSION_SCHEDULER_INTERVAL_MS = 60 * 1000; // Sessions are typically wipe-cycle-length (weeks) - a minute of slop starting/ending one late is fine
let lastRoleGrantAt = 0;
let lastCategoryLeaderboardAt = 0;
let lastTicketArchiveExpiryAt = 0;
const TICKET_ARCHIVE_EXPIRY_INTERVAL_MS = 5 * 60 * 1000; // default grace period is 60 min - checking every 5 min is plenty of precision
let lastDiscordInviteCheckAt = 0;
const DISCORD_INVITE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // invite is permanent (max_age: 0) once minted - this is just a self-healing re-check, no need to hammer it
let lastHealthHeartbeatAt = 0;
const HEALTH_HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000; // hourly "still alive" post to #bot-status-logs - frequent enough to notice a silent crash/restart loop, not so frequent it's noise
let lastBountyExpiryCheckAt = 0;
const BOUNTY_EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;
let lastDuelExpiryCheckAt = 0;
const DUEL_EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;
let lastCombatPositionPollAt = 0;
let lastRconWarmupAt = 0;
// Keeps every linked RCON connection alive/reconnected for broadcast-driven
// features - see utils/rconWarmup.js's header for why this used to live
// inside the now-removed killfeed feature.
const RCON_WARMUP_INTERVAL_MS = 15 * 1000;

/**
 * Single scheduler heartbeat driving the background systems: global status
 * renaming (player count/queue per guild, plus official-server-only
 * product-wide stats), the PvP/PvE category leaderboards, ticket/role/
 * invite self-healing, and the RCON warmup/combat-position pollers.
 */
function startBackgroundLoops(client) {
  setInterval(async () => {
    await runAutoMessagesTick(client).catch((err) => console.error("[KOBA Bot] Auto-messages tick failed:", err));

    if (Date.now() - lastOfficialStatsPollAt >= GLOBAL_STATUS_INTERVAL_MS) {
      lastOfficialStatsPollAt = Date.now();
      await runOfficialStatsTick(client).catch((err) => console.error("[KOBA Bot] Official stats tick failed:", err));
    }

    if (Date.now() - lastHealthHeartbeatAt >= HEALTH_HEARTBEAT_INTERVAL_MS) {
      lastHealthHeartbeatAt = Date.now();
      await postHeartbeat().catch((err) => console.error("[KOBA Bot] Health heartbeat failed:", err));
    }

    if (Date.now() - lastTempRoleExpiryAt >= TEMP_ROLE_EXPIRY_INTERVAL_MS) {
      lastTempRoleExpiryAt = Date.now();
      await runTempRoleExpiryTick(client).catch((err) => console.error("[KOBA Bot] Temp role expiry tick failed:", err));
    }

    if (Date.now() - lastSessionSchedulerAt >= SESSION_SCHEDULER_INTERVAL_MS) {
      lastSessionSchedulerAt = Date.now();
      try {
        runSessionSchedulerTick();
      } catch (err) {
        console.error("[KOBA Bot] Session scheduler tick failed:", err);
      }
    }

    if (Date.now() - lastRoleGrantAt >= ROLE_GRANT_INTERVAL_MS) {
      lastRoleGrantAt = Date.now();
      await runPendingRoleGrantsTick(client).catch((err) => console.error("[KOBA Bot] Pending role grants tick failed:", err));
    }

    if (Date.now() - lastLeaderboardImageAt >= LEADERBOARD_IMAGE_REFRESH_MS) {
      lastLeaderboardImageAt = Date.now();
      await runCategoryLeaderboardImageTick(client).catch((err) => console.error("[KOBA Bot] Category leaderboard image refresh tick failed:", err));
    }

    if (Date.now() - lastCategoryLeaderboardAt >= LEADERBOARD_ROLLOVER_INTERVAL_MS) {
      lastCategoryLeaderboardAt = Date.now();
      await runCategoryLeaderboardTick(client).catch((err) => console.error("[KOBA Bot] Category leaderboard tick failed:", err));
    }

    if (Date.now() - lastTicketArchiveExpiryAt >= TICKET_ARCHIVE_EXPIRY_INTERVAL_MS) {
      lastTicketArchiveExpiryAt = Date.now();
      await runTicketArchiveExpiryTick(client).catch((err) => console.error("[KOBA Bot] Ticket archive expiry tick failed:", err));
    }

    // Runs immediately on the very first heartbeat after boot (lastDiscordInviteCheckAt
    // starts at 0), then every DISCORD_INVITE_CHECK_INTERVAL_MS after that.
    if (Date.now() - lastDiscordInviteCheckAt >= DISCORD_INVITE_CHECK_INTERVAL_MS) {
      lastDiscordInviteCheckAt = Date.now();
      await refreshDiscordInviteTick(client).catch((err) => console.error("[KOBA Bot] Discord invite refresh tick failed:", err));
    }

    if (Date.now() - lastBountyExpiryCheckAt >= BOUNTY_EXPIRY_CHECK_INTERVAL_MS) {
      lastBountyExpiryCheckAt = Date.now();
      await runBountyExpiryTick().catch((err) => console.error("[KOBA Bot] Bounty expiry tick failed:", err));
    }

    if (Date.now() - lastDuelExpiryCheckAt >= DUEL_EXPIRY_CHECK_INTERVAL_MS) {
      lastDuelExpiryCheckAt = Date.now();
      await runDuelExpiryTick().catch((err) => console.error("[KOBA Bot] Duel expiry tick failed:", err));
    }

    if (Date.now() - lastCombatPositionPollAt >= COMBAT_POSITION_POLL_INTERVAL_MS) {
      lastCombatPositionPollAt = Date.now();
      await runPositionPollTick(client).catch((err) => console.error("[KOBA Bot] Combat position poll tick failed:", err));
    }

    if (Date.now() - lastRconWarmupAt >= RCON_WARMUP_INTERVAL_MS) {
      lastRconWarmupAt = Date.now();
      await runRconWarmupTick(client).catch((err) => console.error("[KOBA Bot] RCON warmup tick failed:", err));
    }

    for (const guild of client.guilds.cache.values()) {
      const meta = db.getGuildMeta(guild.id);
      if (!meta?.provisioned_at) continue;

      const lastPlayerCountRun = lastPlayerCountPollAt.get(guild.id) || 0;
      if (Date.now() - lastPlayerCountRun >= GLOBAL_STATUS_INTERVAL_MS) {
        lastPlayerCountPollAt.set(guild.id, Date.now());
        await runPlayerCountTick(guild).catch((err) =>
          console.error(`[KOBA Bot] Player count tick failed for guild ${guild.id}:`, err)
        );
      }

      const lastAdRun = lastAdBroadcastAt.get(guild.id) || 0;
      if (Date.now() - lastAdRun >= AD_BROADCAST_INTERVAL_MS) {
        lastAdBroadcastAt.set(guild.id, Date.now());
        try {
          const rcon = await getRcon(guild.id);
          await rcon.say(formatStyledMessage(guild.id, "ad", {}));
        } catch (err) {
          console.warn(`[KOBA Bot] Ad broadcast failed for guild ${guild.id}:`, err.message);
        }
      }

      const lastPlanRoleRun = lastPlanRoleSyncAt.get(guild.id) || 0;
      if (Date.now() - lastPlanRoleRun >= PLAN_ROLE_SYNC_INTERVAL_MS) {
        lastPlanRoleSyncAt.set(guild.id, Date.now());
        try {
          const plan = await getGuildPlan(guild);
          await syncGuildOwnerPlanRole(guild, plan);
        } catch (err) {
          console.warn(`[KOBA Bot] Plan role sync failed for guild ${guild.id}:`, err.message);
        }
      }
    }
  }, HEARTBEAT_MS);
}

module.exports = { startBackgroundLoops, HEARTBEAT_MS };

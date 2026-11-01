"use strict";

const { Events, REST, Routes } = require("discord.js");
const { startBackgroundLoops } = require("../utils/backgroundLoops");
const spawnFeed = require("../utils/spawnFeed");
require("../utils/combatEvents"); // registers its onGuildBroadcast listener at require-time, same pattern as spawnFeed above - no setClient needed, this pipeline never posts to Discord
const killfeedEngine = require("../utils/killfeedEngine"); // registers its onCombatEvent listener at require-time (2026-10-12, rebuilt 2026-10-18 with combo/rivalry/bounty/Elo/rewards) - DOES need setClient, it posts the actual kill embed; utils/killfeedDisplay.js is just the pure embed builder this calls into now
const duelTracker = require("../utils/duelTracker"); // registers its own onCombatEvent listener at require-time (real Challenge win/loss detection, replacing challengeEngine.js's old coin-flip) - DOES need setClient, same reason as killfeedEngine above
require("../utils/kobaScore"); // registers its own onChallengeSettled listener at require-time, same pattern as combatEvents above - no setClient needed, this never posts to Discord, only updates koba_scores
const { runRconWarmupTick } = require("../utils/rconWarmup");
const { officialGuildIds } = require("../utils/premium");

/**
 * Auto-deploys slash commands on every boot, so a newly-added command shows
 * up without anyone needing shell/terminal access to whatever host is
 * actually running the bot (Discloud has no built-in terminal) - just
 * restart the bot. Registration is idempotent (re-running with the same
 * command set is a no-op).
 *
 * Split into two sets based on each command module's `devOnly` flag:
 *  - Everything else deploys GLOBALLY (Routes.applicationCommands) - visible
 *    on every server KOBA Bot is installed in, up to ~1h to propagate.
 *  - `devOnly: true` commands (e.g. /activate-user) deploy ONLY to every
 *    guild in OFFICIAL_GUILD_IDS (Routes.applicationGuildCommands, one PUT
 *    per guild - 2026-10-11, there are 3: koba, koba.games, KOBAbot) -
 *    never registered globally at all, so they're invisible in the "/"
 *    picker on every other server, not just permission-gated at runtime.
 *    The command's own execute() still double-checks bot-owner +
 *    official-guild too (defense in depth - a stale Discord client cache
 *    showing the command somewhere it shouldn't shouldn't be the only
 *    thing stopping it from running).
 */
async function autoDeployCommands(client) {
  if (!process.env.DISCORD_CLIENT_ID) {
    console.warn("[KOBA Bot] Skipping command auto-deploy - DISCORD_CLIENT_ID not set in .env.");
    return;
  }
  try {
    const allCommands = [...client.commands.values()];
    const globalCommands = allCommands.filter((c) => !c.devOnly).map((c) => c.data.toJSON());
    const devOnlyCommands = allCommands.filter((c) => c.devOnly).map((c) => c.data.toJSON());

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: globalCommands });
    console.log(`[KOBA Bot] Auto-deployed ${globalCommands.length} slash command(s) globally.`);

    if (devOnlyCommands.length) {
      const guildIds = officialGuildIds();
      if (!guildIds.length) {
        console.warn(`[KOBA Bot] Skipping ${devOnlyCommands.length} dev-only command deploy - OFFICIAL_GUILD_IDS not set in .env.`);
      } else {
        // One guild failing (e.g. the bot was removed from it, or a stale
        // ID lingering in OFFICIAL_GUILD_IDS) used to throw and abort this
        // whole block - silently skipping dev-only command deploy to every
        // OTHER official guild too, including ones the bot genuinely has
        // access to. Each guild now gets its own try/catch so one bad ID
        // can't take the rest down with it.
        let succeeded = 0;
        for (const guildId of guildIds) {
          try {
            await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId), { body: devOnlyCommands });
            succeeded++;
          } catch (err) {
            console.error(`[KOBA Bot] Dev-only command deploy failed for guild ${guildId} (skipped, others still attempted):`, err.message);
          }
        }
        console.log(`[KOBA Bot] Auto-deployed ${devOnlyCommands.length} dev-only command(s) to ${succeeded}/${guildIds.length} official server(s).`);
      }
    }
  } catch (err) {
    console.error("[KOBA Bot] Command auto-deploy failed:", err);
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[KOBA Bot] Logged in as ${client.user.tag} (${client.guilds.cache.size} guild(s))`);
    await autoDeployCommands(client);
    startBackgroundLoops(client);
    spawnFeed.setClient(client);
    killfeedEngine.setClient(client);
    duelTracker.setClient(client);

    // FIXED (2026-09-10): every linked server's RCON connection used to only
    // ever connect lazily, whenever some feature first happened to call
    // getRcon() for it - in practice that meant a delay of up to one
    // heartbeat before broadcast-driven features even started listening
    // after a fresh boot. Proactively connecting every one here means every
    // linked server starts listening immediately on login instead of
    // waiting on the first tick - see rcon/manager.js's own header comment
    // for the matching drop/reconnect-on-close fix.
    runRconWarmupTick(client).catch((err) => console.error("[KOBA Bot] Initial RCON connect sweep failed:", err));
  },
};

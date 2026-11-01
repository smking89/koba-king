"use strict";

/**
 * One-time cleanup: makes the bot leave every guild it's in EXCEPT the
 * ones listed in OFFICIAL_GUILD_IDS. Run once with
 * `node scripts/leave-other-guilds.js`, then delete this file - it's not
 * meant to run on every boot.
 *
 * Updated 2026-10-11 from a single OFFICIAL_GUILD_ID to a list - there are
 * 3 real official servers (koba, koba.games, KOBAbot). Running the old
 * single-ID version today would have had the bot leave 2 of its 3
 * legitimate servers.
 */

require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { officialGuildIds } = require("../utils/premium");

const officialIds = officialGuildIds();
if (!officialIds.length) {
  console.error("[KOBA Bot] OFFICIAL_GUILD_IDS is not set in .env - refusing to run (would leave every guild with no exception).");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`[KOBA Bot] Logged in as ${client.user.tag}. Official guild(s): ${officialIds.join(", ")}. Currently in ${client.guilds.cache.size} guild(s).`);

  const toLeave = client.guilds.cache.filter((g) => !officialIds.includes(g.id));
  console.log(`[KOBA Bot] Leaving ${toLeave.size} guild(s)...`);

  for (const guild of toLeave.values()) {
    try {
      await guild.leave();
      console.log(`[KOBA Bot] Left "${guild.name}" (${guild.id})`);
    } catch (err) {
      console.error(`[KOBA Bot] Failed to leave "${guild.name}" (${guild.id}):`, err.message);
    }
  }

  console.log("[KOBA Bot] Done.");
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);

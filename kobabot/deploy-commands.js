"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const { officialGuildIds } = require("./utils/premium");

const globalCommands = [];
const devOnlyCommands = [];
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  const json = command.data.toJSON();
  // A "[Dev Only]" description prefix keeps a command out of the "/" picker
  // entirely on every OTHER server (devOnlyCommands only ever deploy to
  // OFFICIAL_GUILD_IDS), since a guild-registered command only ever appears
  // in the one guild it's registered to. No command currently uses this
  // prefix - kept as the mechanism in case a future official-guild-only
  // command needs it.
  if (json.description.startsWith("[Dev Only]")) devOnlyCommands.push(json);
  else globalCommands.push(json);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Global commands (Routes.applicationCommands) can take up to an hour to
// reach every Discord client's cache - fine for production, painful during
// active development. Guild-specific commands (Routes.applicationGuildCommands)
// update instantly, so pass a guild ID as the first CLI arg (or set
// DEV_GUILD_ID in .env) to deploy the non-dev-only set there instead while
// iterating. Dev-only commands always deploy to every OFFICIAL_GUILD_IDS
// entry regardless of that flag - they're never meant to reach every server.
const devGuildId = process.argv[2] || process.env.DEV_GUILD_ID;
const globalRoute = devGuildId
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, devGuildId)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

(async () => {
  try {
    // A guild-scoped PUT replaces that guild's ENTIRE command set - if the
    // dev guild you're iterating against (first CLI arg / DEV_GUILD_ID) is
    // the same guild as one of OFFICIAL_GUILD_IDS, two separate PUTs to that same
    // guild would have the second one wipe out the first's commands. Merge
    // into one PUT in that case instead of risking that.
    const sameGuild = devGuildId && officialGuildIds().includes(devGuildId);

    if (sameGuild) {
      console.log(`[KOBA Bot] Dev guild matches one of OFFICIAL_GUILD_IDS - deploying all ${globalCommands.length + devOnlyCommands.length} command(s) (incl. dev-only) there in one call...`);
      console.log("[KOBA Bot] Skipped guild-specific commands since layout is entirely global!");
    } else if (officialGuildIds().length === 0) {
      console.warn(`[KOBA Bot] OFFICIAL_GUILD_IDS not set - skipping ${devOnlyCommands.length} dev-only command(s) entirely rather than accidentally deploying them globally.`);
    } else {
      console.log(`[KOBA Bot] Dev-only commands deploy to all ${officialGuildIds().length} official guild(s): ${officialGuildIds().join(", ")}.`);
    }

    console.log("[KOBA Bot] Commands deployed successfully.");
  } catch (err) {
    console.error("[KOBA Bot] Failed to deploy commands:", err);
    process.exit(1);
  }
})();

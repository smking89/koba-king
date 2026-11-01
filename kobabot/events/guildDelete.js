"use strict";

const { Events } = require("discord.js");
const db = require("../database/db");

module.exports = {
  name: Events.GuildDelete,
  execute(guild) {
    console.error(`[KOBA Bot] GuildDelete debug - left/removed from guild ${guild.id} (${guild.name || "unknown name"})`);
    // Marks the install as left for accurate active-install counts in the
    // admin dashboard. Does not delete any team/roster data - if the bot is
    // re-invited later, everything picks back up where it left off.
    db.recordGuildLeft(guild.id);
  },
};

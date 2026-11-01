"use strict";

const { Events } = require("discord.js");
const db = require("../database/db");
const { warningEmbed } = require("../utils/embeds");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const meta = db.getGuildMeta(member.guild.id);
    if (!meta?.welcome_channel_id) return;

    const channel = await member.guild.channels.fetch(meta.welcome_channel_id).catch(() => null);
    if (!channel) return;

    await channel
      .send({ embeds: [warningEmbed("Member Left", `**${member.user.tag}** has left **${member.guild.name}**.`)] })
      .catch(() => {});
  },
};

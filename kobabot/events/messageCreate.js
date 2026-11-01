"use strict";

const { Events } = require("discord.js");
const db = require("../database/db");
const { matchFaq, faqAnswerEmbed } = require("../utils/frank");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.guildId) return;

    // Frank only watches one configured channel per guild (see
    // /set announcement-channel target:Frank) - deliberately scoped, not a
    // general chatbot that reacts anywhere.
    const meta = db.getGuildMeta(message.guildId);
    if (!meta?.frank_channel_id || message.channelId !== meta.frank_channel_id) return;

    const match = matchFaq(message.guildId, message.content);
    if (!match) return;

    await message.reply({ embeds: [faqAnswerEmbed(match)] }).catch(() => {});
  },
};

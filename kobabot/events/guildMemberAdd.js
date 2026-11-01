"use strict";

const { Events } = require("discord.js");
const db = require("../database/db");
const { grantReferralReward } = require("../utils/referralRewards");
const { infoEmbed, successEmbed } = require("../utils/embeds");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const meta = db.getGuildMeta(member.guild.id);
    if (meta?.welcome_channel_id) {
      const channel = await member.guild.channels.fetch(meta.welcome_channel_id).catch(() => null);
      if (channel) {
        await channel
          .send({
            embeds: [
              infoEmbed(
                "Member Joined",
                `**${member.user.username}** just joined **${member.guild.name}**. Welcome aboard!\n\nRun \`/link\` to connect your Xbox or PlayStation account.`
              ),
            ],
          })
          .catch(() => {});
      }
    }

    // /gift-config set gift_type:welcome - fires once per new member, no
    // claim button needed since joining IS the trigger. Kit rewards need the
    // member to already be team-rostered + linked (same requirement as every
    // other kit delivery), which a brand-new member almost never is yet -
    // flagged to the admin at config time in commands/gift-config.js.
    const giftConfig = db.getGiftConfig(member.guild.id, "welcome");
    if (giftConfig?.enabled) {
      const result = await grantReferralReward(member.guild, member.id, {
        kit: giftConfig.reward_type === "kit" ? giftConfig.kit_name : undefined,
        roleId: giftConfig.reward_type === "role" ? giftConfig.role_id : undefined,
        roleTempHours: giftConfig.role_temp_hours,
      });

      const giftsChannel = meta?.gifts_channel_id ? await member.guild.channels.fetch(meta.gifts_channel_id).catch(() => null) : null;
      if (giftsChannel) {
        const lines = [giftConfig.message_text || `🎁 Welcome, **${member.user.username}**! Here's a gift for joining.`];
        if (giftConfig.reward_type === "kit") lines.push(result.kitDelivered ? `Kit **${giftConfig.kit_name}** delivered.` : `Kit delivery failed: ${result.kitError}`);
        if (giftConfig.reward_type === "role") lines.push(result.roleGranted ? `Role <@&${giftConfig.role_id}> granted.` : `Role grant failed: ${result.roleError}`);
        await giftsChannel.send({ embeds: [successEmbed("Welcome Gift", lines.join("\n"))] }).catch(() => {});
      }
    }
  },
};

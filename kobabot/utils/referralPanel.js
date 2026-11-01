"use strict";

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const db = require("../database/db");
const { grantReferralReward } = require("./referralRewards");
const { successEmbed, dangerEmbed } = require("./embeds");

const REDEEM_ERROR_MESSAGES = {
  not_found: "That code doesn't exist or has already expired and been cleared.",
  expired: "That code has expired - codes only last 20 minutes.",
  exhausted: "That code has already been used the maximum number of times.",
  self_referral: "You can't redeem your own referral code.",
};

function buildClaimModal() {
  const modal = new ModalBuilder().setCustomId("referral:claim_modal").setTitle("Redeem Referral Code");
  const codeInput = new TextInputBuilder()
    .setCustomId("code")
    .setLabel("Referral code")
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(6)
    .setRequired(true)
    .setPlaceholder("e.g. HA34VA");
  modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
  return modal;
}

/** "Redeem Code" / "Create Code" buttons in the #referral-claim panel. */
async function handleComponent(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.customId === "referral:open") {
    await interaction.showModal(buildClaimModal());
    return;
  }

  if (interaction.customId === "referral:create") {
    if (!interaction.guild) {
      await interaction.reply({ content: "This only works inside a Discord server.", ephemeral: true });
      return;
    }
    const record = db.createReferralCode(interaction.guildId, interaction.user.id, 1);
    await interaction.reply({
      embeds: [
        successEmbed(
          "Your Referral Code",
          `**${record.code}**\n\nShare this with someone - they use **Redeem Code** (or run \`/referral\`) before it expires <t:${Math.floor(record.expires_at / 1000)}:R>. Every successful referral counts toward the leaderboard.`
        ),
      ],
      ephemeral: true,
    });
    return;
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== "referral:claim_modal") return;

  await interaction.deferReply({ ephemeral: true });

  const code = interaction.fields.getTextInputValue("code").trim();
  const result = db.redeemReferralCode(code, interaction.user.id);

  if (result.error) {
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Redeem That Code", REDEEM_ERROR_MESSAGES[result.error] || "Something went wrong.")] });
    return;
  }

  const config = db.getReferralConfig(interaction.guildId);
  if (!config?.welcome_kit && !config?.welcome_role_id) {
    await interaction.editReply({ embeds: [successEmbed("Code Redeemed", "Your referral code was accepted, but this server hasn't configured a welcome gift yet.")] });
    return;
  }

  const grantResult = await grantReferralReward(interaction.guild, interaction.user.id, {
    kit: config.welcome_kit,
    roleId: config.welcome_role_id,
    roleTempHours: config.welcome_role_temp_hours,
  });

  const lines = ["Your referral code was accepted!"];
  if (config.welcome_kit) lines.push(grantResult.kitDelivered ? `Kit **${config.welcome_kit}** delivered.` : `Kit delivery failed: ${grantResult.kitError}`);
  if (config.welcome_role_id) lines.push(grantResult.roleGranted ? `Role <@&${config.welcome_role_id}> granted${config.welcome_role_temp_hours ? ` for ${config.welcome_role_temp_hours}h` : ""}.` : `Role grant failed: ${grantResult.roleError}`);

  await interaction.editReply({ embeds: [successEmbed("Welcome Gift Claimed", lines.join("\n"))] });
}

module.exports = { handleComponent, handleModal, buildClaimModal };

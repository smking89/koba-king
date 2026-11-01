"use strict";

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const db = require("../database/db");
const { isBotOwner } = require("../utils/premium");
const { infoEmbed, successEmbed, dangerEmbed } = require("../utils/embeds");

function formatGrant(g) {
  const plan = g.plan === "max" ? "Max" : "Pro";
  const expiry = g.expires_at ? `expires <t:${Math.floor(g.expires_at / 1000)}:R>` : "**lifetime**";
  const guild = g.active_guild_id ? `claimed by guild \`${g.active_guild_id}\`` : "unclaimed";
  return `#${g.id} - ${plan}, ${expiry}, ${guild}${g.note ? ` - _${g.note}_` : ""}`;
}

module.exports = {
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("manage-licenses")
    .setDescription("[Dev Only] List or revoke a Discord account's granted BoomBot license(s)")
    .addUserOption((opt) => opt.setName("user").setDescription("The Discord user to look up").setRequired(true)),

  async execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This command is restricted to BoomBot administrators.")], ephemeral: true });
      return;
    }
    if (!process.env.OFFICIAL_GUILD_ID || interaction.guild?.id !== process.env.OFFICIAL_GUILD_ID) {
      await interaction.reply({ embeds: [dangerEmbed("Wrong Server", "/manage-licenses only works in the official BoomBot Discord server.")], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const targetUser = interaction.options.getUser("user", true);
    const grants = db.listLicenseGrants(targetUser.id);

    if (!grants.length) {
      await interaction.editReply({ embeds: [infoEmbed("No Licenses", `**${targetUser.tag}** has no manually-granted licenses on file (they may still have a Stripe subscription - that's tracked separately, see \`/activate-user\`'s legacy fallback).`)] });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("manage_licenses_select")
      .setPlaceholder("Choose a license to revoke")
      .addOptions(grants.slice(0, 25).map((g) => ({ label: `#${g.id} - ${g.plan === "max" ? "Max" : "Pro"}${g.active_guild_id ? " (claimed)" : " (unclaimed)"}`, value: String(g.id) })));

    const reply = await interaction.editReply({
      embeds: [infoEmbed(`${targetUser.tag}'s Licenses`, grants.map(formatGrant).join("\n"))],
      components: [new ActionRowBuilder().addComponents(menu)],
    });

    let selection;
    try {
      selection = await reply.awaitMessageComponent({ componentType: ComponentType.StringSelect, filter: (i) => i.user.id === interaction.user.id, time: 60_000 });
    } catch {
      return; // timed out - nothing changed
    }

    const grantId = Number(selection.values[0]);
    const grant = grants.find((g) => g.id === grantId);
    await selection.update({
      embeds: [infoEmbed("Confirm Revoke", `Revoke license #${grantId} (${grant?.plan === "max" ? "Max" : "Pro"})? This frees up the guild slot it authorized, if any.`)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`manage_licenses_confirm:${grantId}`).setLabel("Yes, revoke").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("manage_licenses_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        ),
      ],
    });

    let confirm;
    try {
      confirm = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 30_000 });
    } catch {
      return;
    }

    if (confirm.customId === "manage_licenses_cancel") {
      await confirm.update({ embeds: [successEmbed("Cancelled", "Nothing was changed.")], components: [] });
      return;
    }

    db.revokeLicenseGrant(grantId);
    await confirm.update({ embeds: [successEmbed("License Revoked", `License #${grantId} was revoked.`)], components: [] });
  },
};

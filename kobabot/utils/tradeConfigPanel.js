"use strict";

/**
 * /trade-config - admin/owner sets what a tradeable role or claimable kit
 * costs the RECIPIENT to accept via utils/playerPanel.js's player-to-player
 * trade flow (added 2026-09-19, per explicit user request: "admin and
 * server owner can set a value for each role or item thats traded ... so
 * users can have a working trade system"). No value set = free transfer,
 * exactly the behavior that existed before this feature.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");

function requireManageGuild(interaction) {
  return interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.guild.ownerId === interaction.user.id;
}

function backRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("tradeconfig:hub").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

function fmtValue(guildId, currencyId, value) {
  if (!value) return "_Free_";
  const currency = db.getCurrency(guildId, currencyId);
  return `${value} ${currency?.emoji || currency?.name || "?"}`;
}

function buildHub(guild) {
  const guildId = guild.id;
  const roleIds = db.getTradeableRoleIds(guildId);
  const kits = db.listKits(guildId).filter((k) => k.claimable);

  const roleLines = roleIds.length
    ? roleIds.map((id) => {
        const v = db.getRoleTradeValue(guildId, id);
        return `<@&${id}> - ${fmtValue(guildId, v?.currency_id, v?.value)}`;
      })
    : ["_No tradeable roles yet - see /role-trade-config add._"];
  const kitLines = kits.length
    ? kits.map((k) => `**${k.display_name}** - ${fmtValue(guildId, k.trade_currency_id, k.trade_value)}`)
    : ["_No claimable kits yet - see /kit-panel's Claim Drawer Settings._"];

  const embed = infoEmbed(
    "💱 Trade Values",
    `A value here means the RECIPIENT pays it (to the giver) when accepting a trade via /player-panel. No value = free, same as before this existed.\n\n**Tradeable Roles**\n${roleLines.join("\n")}\n\n**Claimable Kits**\n${kitLines.join("\n")}`
  );

  const components = [];
  if (roleIds.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("tradeconfig:pick_role")
          .setPlaceholder("Set a role's trade value")
          .addOptions(roleIds.slice(0, 25).map((id) => ({ label: (guild.roles.cache.get(id)?.name || `Role ${id}`).slice(0, 100), value: id })))
      )
    );
  }
  if (kits.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("tradeconfig:pick_kit")
          .setPlaceholder("Set a kit's trade value")
          .addOptions(kits.slice(0, 25).map((k) => ({ label: k.display_name.slice(0, 100), value: k.display_name })))
      )
    );
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("tradeconfig:quick_setup").setLabel("⚡ Quick Setup (Set Every Missing Value)").setStyle(ButtonStyle.Primary)));
  return { embeds: [embed], components };
}

function valueModal(customId, title, currentValue) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
  const valueInput = new TextInputBuilder().setCustomId("value").setLabel("Amount the recipient pays (0 = free)").setStyle(TextInputStyle.Short).setRequired(true);
  if (currentValue) valueInput.setValue(String(currentValue));
  modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(valueInput));
  return modal;
}

async function handleComponent(interaction) {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Access Denied", "Only the server owner or Administrators can configure trade values.")], ephemeral: true });
    return;
  }
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "hub") {
    await interaction.update(buildHub(interaction.guild));
    return;
  }

  if (action === "pick_role") {
    const roleId = interaction.values[0];
    const current = db.getRoleTradeValue(guildId, roleId);
    await interaction.showModal(valueModal(`tradeconfig:set_role_modal:${roleId}`, "Set Role Trade Value", current?.value));
    return;
  }

  if (action === "pick_kit") {
    const displayName = interaction.values[0];
    const kit = db.getKit(guildId, displayName);
    await interaction.showModal(valueModal(`tradeconfig:set_kit_modal:${encodeURIComponent(displayName)}`, "Set Kit Trade Value", kit?.trade_value));
    return;
  }

  if (action === "quick_setup") {
    const modal = new ModalBuilder().setCustomId("tradeconfig:quick_setup_modal").setTitle("Quick Setup - Default Trade Value");
    const currencyInput = new TextInputBuilder().setCustomId("currency").setLabel("Currency name (see /shop-panel)").setStyle(TextInputStyle.Short).setRequired(true);
    const valueInput = new TextInputBuilder().setCustomId("value").setLabel("Default amount for every unpriced role/kit").setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(currencyInput), new ActionRowBuilder().addComponents(valueInput));
    await interaction.showModal(modal);
    return;
  }
}

function resolveCurrency(guildId, name) {
  return db.listCurrencies(guildId).find((c) => c.name.toLowerCase() === name.trim().toLowerCase()) || null;
}

async function handleModal(interaction) {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({ embeds: [dangerEmbed("Access Denied", "Only the server owner or Administrators can configure trade values.")], ephemeral: true });
    return;
  }
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const guildId = interaction.guildId;

  if (action === "set_role_modal") {
    await interaction.deferUpdate();
    const roleId = parts[2];
    const currencyName = interaction.fields.getTextInputValue("currency");
    const value = Number(interaction.fields.getTextInputValue("value"));
    const currency = resolveCurrency(guildId, currencyName);
    if (!currency) {
      await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)], components: [backRow()] });
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number.")], components: [backRow()] });
      return;
    }
    if (value === 0) db.removeRoleTradeValue(guildId, roleId);
    else db.setRoleTradeValue(guildId, roleId, currency.id, value);
    await interaction.editReply(buildHub(interaction.guild));
    return;
  }

  if (action === "set_kit_modal") {
    await interaction.deferUpdate();
    const displayName = decodeURIComponent(parts[2]);
    const currencyName = interaction.fields.getTextInputValue("currency");
    const value = Number(interaction.fields.getTextInputValue("value"));
    const currency = resolveCurrency(guildId, currencyName);
    if (!currency) {
      await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)], components: [backRow()] });
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number.")], components: [backRow()] });
      return;
    }
    db.setKitTradeValue(guildId, displayName, value === 0 ? null : currency.id, value === 0 ? null : value);
    await interaction.editReply(buildHub(interaction.guild));
    return;
  }

  if (action === "quick_setup_modal") {
    await interaction.deferUpdate();
    const currencyName = interaction.fields.getTextInputValue("currency");
    const value = Number(interaction.fields.getTextInputValue("value"));
    const currency = resolveCurrency(guildId, currencyName);
    if (!currency) {
      await interaction.editReply({ embeds: [dangerEmbed("Currency Not Found", `No currency named **${currencyName}** - check \`/shop-panel\`.`)], components: [backRow()] });
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a positive number.")], components: [backRow()] });
      return;
    }

    let count = 0;
    for (const roleId of db.getTradeableRoleIds(guildId)) {
      if (db.getRoleTradeValue(guildId, roleId)) continue; // never overwrites an already-set value
      db.setRoleTradeValue(guildId, roleId, currency.id, value);
      count++;
    }
    for (const kit of db.listKits(guildId).filter((k) => k.claimable)) {
      if (kit.trade_value) continue;
      db.setKitTradeValue(guildId, kit.display_name, currency.id, value);
      count++;
    }

    await interaction.editReply({ embeds: [successEmbed("Quick Setup Complete", `Set **${value} ${currency.emoji || currency.name}** on **${count}** previously-unpriced role(s)/kit(s). Anything already priced was left untouched.`)], components: [backRow()] });
  }
}

module.exports = { buildHub, handleComponent, handleModal };

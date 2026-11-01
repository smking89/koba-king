"use strict";
const { Events, EmbedBuilder } = require("discord.js");
const db = require("../database/db");
const { dangerEmbed } = require("../utils/embeds");
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.user) db.upsertKnownUser(interaction.user.id, interaction.user.username);
    // NOTE (2026-10-12): this used to also handle a "template:" prefix -
    // a crude, hardcoded, destructive wipe-and-rebuild that duplicated (and
    // drifted from) config/templates.js's real TEMPLATES registry, with its
    // own stale inline EliteKit1-40 color array and old role names (Owner/
    // Co-Owner/Admin/Mod/BIZ/Player/XBOX/PSN). commands/template.js has
    // been restored to the real, consolidated /template command (setup/
    // save/mine/download), which drives its own confirm-button flow
    // inline via `reply.awaitMessageComponent()` on "boombot:"-prefixed
    // custom ids - it doesn't need (or want) a second handler here. Only
    // "nuke:" (a separate, still-active command/flow) is handled below,
    // unchanged from its previous behavior.
    if (interaction.isButton() && interaction.customId.startsWith("nuke:")) {
      if (interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: "❌ Action Restricted: Server ownership required.", ephemeral: true });
      const parts = interaction.customId.split(":");
      const action = parts[1];
      if (action === "cancel") return interaction.update({ content: "Operation cancelled safely.", embeds: [], components: [] });
      const mode = parts[2];
      await interaction.update({ content: "⏳ **Teardown sequence authorized.** Clearing old tracks...", embeds: [], components: [] });
      const guild = interaction.guild;
      try {
        const channels = await guild.channels.fetch();
        for (const [id, ch] of channels.filter(c => c && c.id !== interaction.channelId && c.type !== 4)) { try { await ch.delete(); } catch(e){} }
        for (const [id, ca] of channels.filter(c => c && c.type === 4)) { try { await ca.delete(); } catch(e){} }
        const roles = await guild.roles.fetch();
        const botHighest = (await guild.members.fetch(interaction.client.user.id)).roles.highest;
        for (const [id, r] of roles) {
          if (!r.managed && r.name !== "@everyone" && r.position < botHighest.position) {
            const ln = r.name.toLowerCase();
            let wipe = false;
            if (mode === "all") wipe = true;
            if (mode === "staff") wipe = ["owner", "co-owner", "admin", "mod"].includes(ln);
            if (mode === "player_kits") wipe = ["player", "biz", "vip", "freekit", "freekit2", "linked", "unlinked", "xbox", "psn"].includes(ln) || ln.startsWith("elitekit");
            if (wipe) { try { await r.delete(); } catch(e){} }
          }
        }
        await interaction.followUp({ embeds: [new EmbedBuilder().setTitle("Action Successful").setDescription("The selected channels, categories, and roles have been purged.").setColor(0xFFFFFF)], ephemeral: true });
      } catch (e) { console.error(e); }
      return;
    }
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction);
      } else if (interaction.isModalSubmit()) {
        // FIXED (2026-11-01): this used to route modal submits through
        // componentHandlers too (same map as buttons/selects) - every
        // registered module's handleComponent only ever checks
        // isButton()/isAnySelectMenu() internally (see e.g. linkPanel.js),
        // so a modal submit reaching it always silently fell through and
        // did nothing. client.modalHandlers (index.js) existed and was
        // populated this whole time but never once consulted - dead code
        // until now.
        const [ns] = interaction.customId.split(":");
        const handler = interaction.client.modalHandlers.get(ns);
        if (handler) await handler(interaction);
      } else if (interaction.isButton() || interaction.isAnySelectMenu()) {
        const [ns] = interaction.customId.split(":");
        const handler = interaction.client.componentHandlers.get(ns);
        if (handler) await handler(interaction);
      }
    } catch (err) { console.error(err); }
  }
};

"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parseKitList } = require("../rcon/parsers");
const { hasFactionLeaderClearance, hasAdminClearance, getRequesterMembership } = require("./teamAuth");
const { formatKitMessage, isValidHex } = require("./messageStyle");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { logAdminAction } = require("./adminFeed");
const { requireWithinBasicLimit, getGuildPlan } = require("./premium");

/** KOBA Bot Basic includes up to this many registered kits - see website/src/components/PlanGrid.jsx's "3 Kits" bullet. */
const BASIC_KIT_LIMIT = 3;

/**
 * Top-level hub - one entry point replacing /give-kit, /remove-kit, /kit-config.
 * FIXED (2026-09-10, product pruning pass): AutoKit Quickchat and the
 * player self-claimable-kit mechanic were removed entirely (generic Rust
 * kit distribution with no retained-feature dependency - see the removal
 * report). Kit registration/delivery itself stays - Lootbox game rewards,
 * referral welcome gifts, and scheduled gift drops all still deliver
 * rewards through this same registry, and staff can still hand a specific
 * kit to a specific teammate via "Give Kit" below.
 */
function buildHub(guildId) {
  const kits = db.listKits(guildId);
  const embed = infoEmbed("🎒 Kit Management Hub", `**Registered Kits:** ${kits.length}\n\nUse the buttons below - no need to remember separate commands.`);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("kitpanel:list").setLabel("📋 List Kits").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("kitpanel:register").setLabel("➕ Register Kit").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("kitpanel:unregister").setLabel("🗑️ Unregister Kit").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("kitpanel:customize").setLabel("✏️ Customize Message").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("kitpanel:give").setLabel("🎁 Give Kit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("kitpanel:reset_cooldown").setLabel("🔄 Reset Cooldown").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("kitpanel:sync").setLabel("🔄 Sync Kits").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      // Kit Claims Drawer settings (2026-09-19) - lets a kit opt into
      // utils/playerPanel.js's self-service claim drawer, restoring the
      // self-claimable-kit mechanic removed 2026-09-10, this time gated
      // per-kit by an optional role requirement + admin-set cooldown rather
      // than a blanket unrestricted claim.
      new ButtonBuilder().setCustomId("kitpanel:claim_settings").setLabel("🎯 Claim Drawer Settings").setStyle(ButtonStyle.Secondary),
      // Dynamic Adaptive Kit Engine (2026-09-19) - deliberately its own
      // dedicated panel (utils/autoKitAdminPanel.js / /autokit-config), just
      // linked from here for discoverability.
      new ButtonBuilder().setCustomId("autokit:list").setLabel("🔌 Kit Engine (Chat Triggers)").setStyle(ButtonStyle.Secondary)
    ),
  ];
  return { embeds: [embed], components: rows };
}

function backRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("kitpanel:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

/** Shared view for the Claim Drawer Settings screen - re-rendered after every toggle/cooldown/role change so it always reflects the latest kit_registry row. */
function claimSettingsView(displayName, kit) {
  const embed = infoEmbed(
    `Claim Drawer: ${displayName}`,
    `**Status:** ${kit.claimable ? "🟢 Claimable" : "🔴 Not Claimable"}\n` +
      `**Cooldown:** ${kit.claim_cooldown_minutes ?? 0} minute(s)\n` +
      `**Role Requirement:** ${kit.required_role_id ? `<@&${kit.required_role_id}>` : "Everyone"}`
  );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`kitpanel:claim_toggle:${encodeURIComponent(displayName)}`).setLabel(kit.claimable ? "Turn OFF" : "Turn ON").setStyle(kit.claimable ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`kitpanel:claim_cooldown_modal:${encodeURIComponent(displayName)}`).setLabel("Set Cooldown").setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`kitpanel:claim_role:${encodeURIComponent(displayName)}`).setPlaceholder("Role Requirement (optional)"));
  return { embeds: [embed], components: [row1, row2, backRow()] };
}

function kitSelectMenu(guildId, customId, placeholder) {
  const kits = db.listKits(guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(kits.slice(0, 25).map((k) => ({ label: k.display_name.slice(0, 100), value: k.display_name, description: k.internal_kit_name.slice(0, 100) })));
  return { menu, kits };
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  // Entry point from the persistent, shared #kit-panel channel panel -
  // reply ephemeral (only the clicker sees it) rather than update(), which
  // would otherwise overwrite the shared pinned panel message for everyone.
  if (id === "kitpanel:open") {
    await interaction.reply({ ...buildHub(interaction.guildId), ephemeral: true });
    return;
  }

  if (id === "kitpanel:back") {
    await interaction.update(buildHub(interaction.guildId));
    return;
  }

  if (id === "kitpanel:list") {
    const kits = db.listKits(interaction.guildId);
    const body = kits.length ? kits.map((k) => `**${k.display_name}** → \`${k.internal_kit_name}\``).join("\n") : "No kits registered yet.";
    await interaction.update({ embeds: [infoEmbed("Registered Kits", body)], components: [backRow()] });
    return;
  }

  if (id === "kitpanel:register") {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId("kitpanel:register_modal").setTitle("Register A Kit");
    const displayInput = new TextInputBuilder().setCustomId("display_name").setLabel("Friendly name, e.g. Starter Pack").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
    const internalInput = new TextInputBuilder().setCustomId("internal_kit_name").setLabel("Exact internal kit name, e.g. freekit2").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
    modal.addComponents(new ActionRowBuilder().addComponents(displayInput), new ActionRowBuilder().addComponents(internalInput));
    await interaction.showModal(modal);
    return;
  }

  /**
   * Auto-discovers every kit already configured server-side via WebRCON's
   * `kit list` (same command commands/referral-config.js's checkKitExists
   * already uses, just now actually parsed into individual names - see
   * rcon/parsers.js's parseKitList) and registers any KOBA Bot doesn't
   * already know about, using the server's own kit name as both the
   * display name and internal name (rename the display name afterward via
   * a re-register with the same internal name if a friendlier label is
   * wanted - upsertKit is keyed on display_name, so that's a distinct row,
   * not an edit-in-place; good enough for "discover what exists" rather
   * than requiring an admin to type every kit name in by hand first).
   */
  if (id === "kitpanel:sync") {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      const rcon = await getRcon(interaction.guildId);
      const raw = await rcon.send("kit list");
      const names = parseKitList(raw);
      if (!names.length) {
        await interaction.editReply({ embeds: [dangerEmbed("Nothing Found", "`kit list` didn't return any kit names - either this server has none configured yet, or its output format doesn't match what KOBA Bot expects (let staff know so the parser can be adjusted).")], components: [backRow()] });
        return;
      }
      const existing = new Set(db.listKits(interaction.guildId).map((k) => k.internal_kit_name.toLowerCase()));
      const plan = await getGuildPlan(interaction.guild);
      let count = db.listKits(interaction.guildId).length;
      let added = 0;
      let skippedLimit = 0;
      for (const name of names) {
        if (existing.has(name.toLowerCase())) continue;
        // Add up to the Basic quota, then stop registering new ones (rather
        // than failing the whole sync) - Pro/Max has no limit here.
        if (plan === "basic" && count >= BASIC_KIT_LIMIT) {
          skippedLimit++;
          continue;
        }
        db.upsertKit(interaction.guildId, name, name);
        added++;
        count++;
      }
      const limitNote = skippedLimit ? `\n\n⚠️ **${skippedLimit}** more kit(s) found but not registered - KOBA Bot Basic includes up to **${BASIC_KIT_LIMIT}** kits. Upgrade to Pro/Max for unlimited.` : "";
      await interaction.editReply({
        embeds: [successEmbed("Kits Synced", `Found **${names.length}** kit(s) on the server - **${added}** newly registered, **${names.length - added - skippedLimit}** already known.${limitNote}`)],
        components: [backRow()],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("Sync Failed", `Couldn't reach the Rust server: ${err.message}`)], components: [backRow()] });
    }
    return;
  }

  if (id === "kitpanel:unregister") {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    const { menu, kits } = kitSelectMenu(interaction.guildId, "kitpanel:unregister_select", "Choose a kit to unregister");
    if (!kits.length) {
      await interaction.update({ embeds: [infoEmbed("No Kits", "Nothing registered yet.")], components: [backRow()] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Unregister A Kit", "This removes the kit from KOBA Bot's registry only - it does **not** delete the kit on the Rust server.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "kitpanel:unregister_select") {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    const displayName = interaction.values[0];
    db.deleteKit(interaction.guildId, displayName);
    await interaction.update({ embeds: [successEmbed("Kit Unregistered", `**${displayName}** was removed from the registry.`)], components: [backRow()] });
    return;
  }

  if (id === "kitpanel:customize") {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    const { menu, kits } = kitSelectMenu(interaction.guildId, "kitpanel:customize_select", "Choose a kit to customize");
    if (!kits.length) {
      await interaction.update({ embeds: [infoEmbed("No Kits", "Register a kit first.")], components: [backRow()] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Customize Message", "Pick a kit, then which message to customize.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "kitpanel:customize_select") {
    const displayName = interaction.values[0];
    const typeMenu = new StringSelectMenuBuilder()
      .setCustomId(`kitpanel:customize_type:${encodeURIComponent(displayName)}`)
      .setPlaceholder("Delivery or cooldown message?")
      .addOptions({ label: "Delivery Message", value: "delivery" }, { label: "Cooldown Reset Message", value: "cooldown" });
    await interaction.update({ embeds: [infoEmbed("Customize Message", `Customizing **${displayName}** - pick which message.`)], components: [new ActionRowBuilder().addComponents(typeMenu), backRow()] });
    return;
  }

  if (id.startsWith("kitpanel:customize_type:")) {
    // encodeURIComponent'd on the way in above - a kit display name (free
    // text an admin picks) can contain ":" itself, which would otherwise
    // corrupt this customId's own ":"-delimited segments.
    const displayName = decodeURIComponent(id.split(":")[2]);
    const type = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`kitpanel:customize_modal:${encodeURIComponent(displayName)}:${type}`).setTitle(`${displayName} - ${type === "delivery" ? "Delivery" : "Cooldown"} Msg`.slice(0, 45));
    // BUG FIX (2026-09-02): both labels used to exceed Discord's hard
    // 45-char limit on TextInputBuilder labels (54/49 chars) - discord.js
    // throws building the modal, which the global catch-all in
    // events/interactionCreate.js was masking as a generic "[ DENIED ]
    // Something Went Wrong", making this look like a permissions bug when
    // it was actually a malformed modal every single time.
    const messageInput = new TextInputBuilder().setCustomId("message").setLabel("Message ({player}/{kit}) - blank = default").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200);
    const colorInput = new TextInputBuilder().setCustomId("color").setLabel("Hex color e.g. #00FF00 - blank = default").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7);
    modal.addComponents(new ActionRowBuilder().addComponents(messageInput), new ActionRowBuilder().addComponents(colorInput));
    await interaction.showModal(modal);
    return;
  }

  if (id === "kitpanel:claim_settings") {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    const { menu, kits } = kitSelectMenu(interaction.guildId, "kitpanel:claim_settings_select", "Choose a kit");
    if (!kits.length) {
      await interaction.update({ embeds: [infoEmbed("No Kits", "Register a kit first with ➕ Register Kit.")], components: [backRow()] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Claim Drawer Settings", "Pick a kit to configure its player-facing Claim Drawer entry.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "kitpanel:claim_settings_select" || id.startsWith("kitpanel:claim_toggle:")) {
    const displayName = id === "kitpanel:claim_settings_select" ? interaction.values[0] : decodeURIComponent(id.split(":")[2]);
    const kit = db.getKit(interaction.guildId, displayName);
    if (!kit) {
      await interaction.update({ embeds: [dangerEmbed("Not Found", "That kit no longer exists.")], components: [backRow()] });
      return;
    }
    if (id.startsWith("kitpanel:claim_toggle:")) {
      db.setKitClaimSettings(interaction.guildId, displayName, { claimable: kit.claimable ? 0 : 1 });
    }
    await interaction.update(claimSettingsView(displayName, db.getKit(interaction.guildId, displayName)));
    return;
  }

  if (id.startsWith("kitpanel:claim_cooldown_modal:")) {
    const displayName = decodeURIComponent(id.split(":")[2]);
    const kit = db.getKit(interaction.guildId, displayName);
    const modal = new ModalBuilder().setCustomId(`kitpanel:claim_cooldown_submit:${encodeURIComponent(displayName)}`).setTitle(`${displayName} - Cooldown`.slice(0, 45));
    const input = new TextInputBuilder().setCustomId("minutes").setLabel("Cooldown in minutes (0 = none)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6);
    if (kit?.claim_cooldown_minutes !== undefined && kit?.claim_cooldown_minutes !== null) input.setValue(String(kit.claim_cooldown_minutes));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id.startsWith("kitpanel:claim_role:")) {
    const displayName = decodeURIComponent(id.split(":")[2]);
    const roleId = interaction.values[0] || null;
    db.setKitClaimSettings(interaction.guildId, displayName, { requiredRoleId: roleId });
    await interaction.update(claimSettingsView(displayName, db.getKit(interaction.guildId, displayName)));
    return;
  }

  if (id === "kitpanel:give" || id === "kitpanel:reset_cooldown") {
    const requester = getRequesterMembership(interaction);
    if (!hasFactionLeaderClearance(interaction, requester)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "You need Faction Leader clearance (or Corporal+ rank) for this.")], ephemeral: true });
      return;
    }
    const action = id === "kitpanel:give" ? "give" : "reset_cooldown";
    const userSelect = new UserSelectMenuBuilder().setCustomId(`kitpanel:${action}_pick_user`).setPlaceholder("Choose a teammate");
    await interaction.update({
      embeds: [infoEmbed(action === "give" ? "Give A Kit" : "Reset A Kit Cooldown", "Pick the teammate first.")],
      components: [new ActionRowBuilder().addComponents(userSelect), backRow()],
    });
    return;
  }

  if (id === "kitpanel:give_pick_user" || id === "kitpanel:reset_cooldown_pick_user") {
    const action = id === "kitpanel:give_pick_user" ? "give" : "reset_cooldown";
    const targetUserId = interaction.values[0];
    const { menu, kits } = kitSelectMenu(interaction.guildId, `kitpanel:${action}_pick_kit:${targetUserId}`, "Choose a kit");
    if (!kits.length) {
      await interaction.update({ embeds: [infoEmbed("No Kits", "Register a kit first with 📋 Register Kit.")], components: [backRow()] });
      return;
    }
    await interaction.update({ embeds: [infoEmbed("Choose A Kit", `Target: <@${targetUserId}>`)], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id.startsWith("kitpanel:give_pick_kit:") || id.startsWith("kitpanel:reset_cooldown_pick_kit:")) {
    const isGive = id.startsWith("kitpanel:give_pick_kit:");
    const targetUserId = id.split(":")[2];
    const kitInput = interaction.values[0];

    await interaction.deferUpdate();

    const requester = getRequesterMembership(interaction);
    if (!requester) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Rostered", "You aren't registered to a team yet.")], components: [backRow()] });
      return;
    }
    const targetMember = db.getMember(interaction.guildId, targetUserId);
    if (!targetMember || targetMember.team_name !== requester.team_name) {
      await interaction.editReply({ embeds: [dangerEmbed("Not On Your Team", `<@${targetUserId}> isn't registered on **${requester.team_name}**.`)], components: [backRow()] });
      return;
    }

    const registered = db.getKit(interaction.guildId, kitInput);
    const internalKitName = registered?.internal_kit_name || kitInput;

    if (isGive) {
      // Doesn't deliver immediately - creates a token in the recipient's
      // Discord inventory (/player-panel -> My Items) that they redeem (or
      // pass along) themselves. Doesn't require a linked Gamertag up front -
      // that's only needed at redeem time.
      const token = db.createKitClaimToken(interaction.guildId, internalKitName, kitInput, targetUserId);
      await logAdminAction(interaction.guild, {
        title: "Kit Token Given",
        description: `**Item/Kit:** ${kitInput} (\`${internalKitName}\`) ×1\n**To:** <@${targetUserId}>\n**By:** ${interaction.user.tag}\n**Token ID:** ${token.id}`,
      });
      await interaction.editReply({
        embeds: [successEmbed("Kit Token Sent", `**${kitInput}** was sent to <@${targetUserId}>'s inventory - they can redeem it via \`/player-panel\` → My Items.`)],
        components: [backRow()],
      });
      return;
    }

    if (!targetMember.gamertag) {
      await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", `<@${targetUserId}> hasn't run \`/link\` yet.`)], components: [backRow()] });
      return;
    }

    try {
      const rcon = await getRcon(interaction.guildId);
      {
        // `kit remove "KitName" "ID"` is the documented syntax for clearing
        // a player's cooldown on a kit (docs/RUST_CONSOLE_RCON_REFERENCE.md);
        // `kit removeplayer` isn't a real RCE command (2026-10-11 fix).
        await rcon.send(`kit remove "${internalKitName}" "${targetMember.gamertag}"`);
        await rcon.say(formatKitMessage(interaction.guildId, registered, "cooldown", { player: targetMember.gamertag, kit: kitInput })).catch(() => {});
        await logAdminAction(interaction.guild, {
          title: "Kit Cooldown Reset",
          description: `**Kit:** ${kitInput} (\`${internalKitName}\`)\n**For:** ${targetMember.gamertag} (<@${targetUserId}>)\n**By:** ${interaction.user.tag}`,
        });
        await interaction.editReply({ embeds: [successEmbed("Cooldown Reset", `**${targetMember.gamertag}** (<@${targetUserId}>) can claim **${kitInput}** again.`)], components: [backRow()] });
      }
    } catch (err) {
      // isGive always returns above before reaching here now (see the token creation branch)
      await interaction.editReply({ embeds: [dangerEmbed("Reset Failed", `Couldn't reach the Rust server: \`${err.message}\`.`)], components: [backRow()] });
    }
    return;
  }

}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id.startsWith("kitpanel:claim_cooldown_submit:")) {
    await interaction.deferUpdate();
    const displayName = decodeURIComponent(id.split(":")[2]);
    const minutes = Number(interaction.fields.getTextInputValue("minutes"));
    if (!Number.isFinite(minutes) || minutes < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Value", "Enter a non-negative number of minutes.")], components: [backRow()] });
      return;
    }
    db.setKitClaimSettings(interaction.guildId, displayName, { claimCooldownMinutes: Math.round(minutes) });
    await interaction.editReply(claimSettingsView(displayName, db.getKit(interaction.guildId, displayName)));
    return;
  }

  if (id === "kitpanel:register_modal") {
    await interaction.deferUpdate();
    const displayName = interaction.fields.getTextInputValue("display_name").trim();
    const internalKitName = interaction.fields.getTextInputValue("internal_kit_name").trim();

    // Only a genuinely NEW display name counts against the Basic quota -
    // upsertKit is an upsert keyed on display_name, so re-registering an
    // existing kit (e.g. to change its internal name) is an edit, not an
    // addition, and shouldn't get blocked once a Basic guild is at 3/3.
    const isNew = !db.getKit(interaction.guildId, displayName);
    if (isNew) {
      const count = db.listKits(interaction.guildId).length;
      if (!(await requireWithinBasicLimit(interaction, count, BASIC_KIT_LIMIT, "registered kits"))) return;
    }

    db.upsertKit(interaction.guildId, displayName, internalKitName);
    await interaction.editReply({ embeds: [successEmbed("Kit Registered", `**${displayName}** → \`${internalKitName}\``)], components: [backRow()] });
    return;
  }

  if (id.startsWith("kitpanel:customize_modal:")) {
    await interaction.deferUpdate();
    const [, , displayNameRaw, type] = id.split(":");
    const displayName = decodeURIComponent(displayNameRaw);
    const message = interaction.fields.getTextInputValue("message").trim();
    const color = interaction.fields.getTextInputValue("color").trim();

    if (color && !isValidHex(color)) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Hex Code", "Use a 6-digit hex color like `#00FF00`.")], components: [backRow()] });
      return;
    }

    db.setKitStyle(interaction.guildId, displayName, type, { message: message || null, colorHex: color || null });
    await interaction.editReply({ embeds: [successEmbed("Message Updated", `**${displayName}**'s ${type} message was updated.`)], components: [backRow()] });
    return;
  }
}

module.exports = { buildHub, handleComponent, handleModal };

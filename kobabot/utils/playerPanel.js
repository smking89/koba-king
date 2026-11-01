"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { parsePrintPos } = require("../rcon/parsers");
const { formatKitMessage } = require("./messageStyle");
const { logAdminAction } = require("./adminFeed");
const { infoEmbed, successEmbed, dangerEmbed } = require("./embeds");
const { CATEGORIES: LEADERBOARD_CATEGORIES } = require("./categoryLeaderboards");
const { deliverVehicle, remainingCooldownMs } = require("./autoKitEngine");

/**
 * FIXED (2026-09-10, product pruning pass): the self-claimable-kit button
 * and TP Home/teleport buttons were removed entirely (generic Rust kit
 * distribution and teleport functionality, no retained-feature dependency -
 * see the removal report). "My Items" (kit tokens a staff member specifically
 * gave you, tradeable roles, wallet/savings, unclaimed lootbox wins) stays -
 * that's a real economy/community feature, not generic Rust admin.
 */
function buildHub() {
  const embed = infoEmbed("🎮 Player Panel", "Check your inventory (kit tokens + roles) and trade with teammates.");
  const rows = [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("playerpanel:items").setLabel("📦 My Items").setStyle(ButtonStyle.Primary)),
    // Added 2026-09-19, per the Dynamic Adaptive Kit Engine blueprint's
    // "Discord Player Control Panel" - PATHVIEW 1/2/3, each its own drawer.
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("playerpanel:claim_kits").setLabel("🎁 Claim A Kit").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("playerpanel:vehicle_delivery").setLabel("🚗 Vehicle Delivery").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("playerpanel:quickchat_matrix").setLabel("💬 Quick Actions").setStyle(ButtonStyle.Secondary)
    ),
  ];
  return { embeds: [embed], components: rows };
}

function backRow(customId = "playerpanel:back") {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

/**
 * Roles a player is allowed to trade away - explicit admin allowlist
 * (/role-trade-config), empty by default so nothing (Owner/Admin/Mod/Xbox/
 * PlayStation/anything else) is tradable until an admin opts a specific
 * role in. Permission-based exclusion kept as a second safety net on top -
 * even an allowlisted role can never be traded if it happens to carry
 * ManageGuild/Administrator.
 */
function tradeableRoles(member) {
  const allowlist = new Set(db.getTradeableRoleIds(member.guild.id));
  return member.roles.cache.filter(
    (r) => allowlist.has(r.id) && r.id !== r.guild.id && !r.managed && !r.permissions.has(PermissionFlagsBits.ManageGuild) && !r.permissions.has(PermissionFlagsBits.Administrator)
  );
}

async function buildItemsView(interaction) {
  const guildId = interaction.guildId;
  const discordId = interaction.user.id;
  const tokens = db.listHeldTokens(guildId, discordId);
  const roles = tradeableRoles(interaction.member);
  const wallets = db.listWallets(guildId, discordId).filter((w) => w.balance > 0);
  const savings = db.listSavings(guildId, discordId).filter((s) => s.balance > 0);
  const unclaimed = db.listUnclaimedLootboxClaims(guildId, discordId);

  const walletLines = wallets.length
    ? wallets.map((w) => {
        const c = db.getCurrency(guildId, w.currency_id);
        return `• ${c?.emoji || ""} **${w.balance}** ${c?.name || "coins"}`;
      })
    : ["_Empty_"];
  const vaultLines = savings.length
    ? savings.map((s) => {
        const c = db.getCurrency(guildId, s.currency_id);
        return `• ${c?.emoji || ""} **${s.balance}** ${c?.name || "coins"}`;
      })
    : ["_Empty_"];
  const unclaimedLines = unclaimed.length ? unclaimed.map((c) => `• ${c.display_name} - ${c.opened_at ? "ready to **Claim**" : "press **Open** below"}`) : ["_None_"];

  const lines = [
    `**Wallet**`,
    ...walletLines,
    "",
    `**Vault (savings)**`,
    ...vaultLines,
    "",
    `**Kit Tokens (${tokens.length})**`,
    tokens.length ? tokens.map((t) => `• ${t.display_name} - <t:${Math.floor(t.created_at / 1000)}:R>`).join("\n") : "_None_",
    "",
    `**Tradeable Roles (${roles.size})**`,
    roles.size ? [...roles.values()].map((r) => `• ${r}`).join("\n") : "_None_",
    "",
    `**Unclaimed Lootbox Wins (${unclaimed.length})**`,
    ...unclaimedLines,
  ];

  const rows = [];
  if (tokens.length) {
    const claimMenu = new StringSelectMenuBuilder()
      .setCustomId("playerpanel:token_claim_select")
      .setPlaceholder("Redeem a kit token")
      .addOptions(tokens.slice(0, 25).map((t) => ({ label: t.display_name.slice(0, 100), value: String(t.id) })));
    rows.push(new ActionRowBuilder().addComponents(claimMenu));

    const giveMenu = new StringSelectMenuBuilder()
      .setCustomId("playerpanel:token_give_select")
      .setPlaceholder("Give a kit token to a teammate")
      .addOptions(tokens.slice(0, 25).map((t) => ({ label: t.display_name.slice(0, 100), value: String(t.id) })));
    rows.push(new ActionRowBuilder().addComponents(giveMenu));
  }
  if (roles.size) {
    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId("playerpanel:role_give_select")
      .setPlaceholder("Give away a role")
      .addOptions([...roles.values()].slice(0, 25).map((r) => ({ label: r.name.slice(0, 100), value: r.id })));
    rows.push(new ActionRowBuilder().addComponents(roleMenu));
  }
  // Reuses utils/lootboxPanel.js's Open/Claim buttons directly (same
  // customId scheme) - capped to what still fits under Discord's 5-row
  // limit alongside the rows above + the always-present Back row.
  if (unclaimed.length && rows.length < 4) {
    const claimRow = new ActionRowBuilder().addComponents(
      unclaimed.slice(0, 5 - rows.length - 1).map((c) =>
        new ButtonBuilder()
          .setCustomId(`lootbox:${c.opened_at ? "claim" : "open"}:${c.id}`)
          .setLabel(`${c.opened_at ? "Claim" : "Open"}: ${c.display_name.slice(0, 60)}`)
          .setStyle(ButtonStyle.Success)
      )
    );
    rows.push(claimRow);
  }
  rows.push(backRow());

  return { embeds: [infoEmbed("My Items", lines.join("\n"))], components: rows };
}

/** Delivers a redeemed token's kit over RCON - shared by the direct-claim flow and (nothing else, kept isolated since transfers never auto-redeem). */
async function redeemToken(interaction, token) {
  const member = db.getMember(interaction.guildId, interaction.user.id);
  if (!member?.gamertag) {
    return { ok: false, embed: dangerEmbed("No Linked Gamertag", "Run `/link` first, then come back and redeem.") };
  }

  const registered = db.getKit(interaction.guildId, token.display_name) || { internal_kit_name: token.internal_kit_name, display_name: token.display_name };

  try {
    const rcon = await getRcon(interaction.guildId);
    await rcon.send(`kit givetoplayer "${token.internal_kit_name}" "${member.gamertag}"`);
    await rcon.say(formatKitMessage(interaction.guildId, registered, "delivery", { player: member.gamertag, kit: token.display_name })).catch(() => {});
    db.redeemKitClaimToken(token.id);
    db.recordKitClaim(interaction.guildId, member.gamertag, token.internal_kit_name, "panel");
    await logAdminAction(interaction.guild, {
      title: "Kit Token Redeemed",
      description: `**Item/Kit:** ${token.display_name} (\`${token.internal_kit_name}\`) ×1\n**By:** ${member.gamertag} (${interaction.user.username})\n**Token ID:** ${token.id}`,
    });
    return { ok: true, embed: successEmbed("Kit Claimed", `**${token.display_name}** delivered to **${member.gamertag}**.`) };
  } catch (err) {
    return { ok: false, embed: dangerEmbed("Claim Failed", `Couldn't reach the Rust server: \`${err.message}\`.`) };
  }
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  if (id === "playerpanel:back") {
    await interaction.update(buildHub(interaction.guildId, interaction.member));
    return;
  }

  if (id === "playerpanel:items") {
    await interaction.update(await buildItemsView(interaction));
    return;
  }

  // ---------------------------------------------------------------------
  // PATHVIEW 1: Kit Claims Drawer
  // ---------------------------------------------------------------------

  if (id === "playerpanel:claim_kits") {
    const kits = db.listClaimableKitsForMember(interaction.guildId, interaction.member);
    if (!kits.length) {
      await interaction.update({ embeds: [infoEmbed("Claim A Kit", "No kits are available to you right now.")], components: [backRow()] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("playerpanel:claim_kit_select")
      .setPlaceholder("Choose a kit to claim")
      .addOptions(kits.slice(0, 25).map((k) => ({ label: k.display_name.slice(0, 100), value: k.display_name })));
    await interaction.update({ embeds: [infoEmbed("Claim A Kit", "Pick a kit below - it delivers straight to your in-game character.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "playerpanel:claim_kit_select") {
    await interaction.deferUpdate();
    const displayName = interaction.values[0];
    const kit = db.getKit(interaction.guildId, displayName);
    if (!kit?.claimable || (kit.required_role_id && !interaction.member.roles.cache.has(kit.required_role_id))) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "That kit isn't available to you anymore.")], components: [backRow()] });
      return;
    }
    const member = db.getMember(interaction.guildId, interaction.user.id);
    if (!member?.gamertag) {
      await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first so KOBA Bot knows which in-game character to deliver to.")], components: [backRow()] });
      return;
    }

    if (kit.claim_cooldown_minutes) {
      const record = db.getKitClaimRecord(interaction.guildId, member.gamertag, kit.internal_kit_name);
      if (record) {
        const remainingMs = kit.claim_cooldown_minutes * 60 * 1000 - (Date.now() - record.claimed_at);
        if (remainingMs > 0) {
          await interaction.editReply({ embeds: [dangerEmbed("On Cooldown", `**${displayName}** is on cooldown for **${Math.ceil(remainingMs / 60000)}** more minute(s).`)], components: [backRow()] });
          return;
        }
      }
    }
    // Cross-check a Kit Engine quickchat binding for this exact internal
    // kit name (utils/autoKitEngine.js) - a player who just claimed it
    // in-game via quickchat shouldn't be able to immediately claim the
    // "same" kit again here. Added 2026-09-20 per explicit user report of
    // exactly this double-claim.
    const autokitBinding = db.listAutokitMappings(interaction.guildId).find((m) => m.binding_type === "kit" && m.kit_name === kit.internal_kit_name && m.cooldown_minutes);
    if (autokitBinding) {
      const remainingMs = db.getAutokitCooldownRemainingMs(interaction.guildId, autokitBinding.id, member.gamertag, autokitBinding.cooldown_minutes);
      if (remainingMs > 0) {
        await interaction.editReply({ embeds: [dangerEmbed("On Cooldown", `**${displayName}** is on cooldown for **${Math.ceil(remainingMs / 60000)}** more minute(s).`)], components: [backRow()] });
        return;
      }
    }

    try {
      const rcon = await getRcon(interaction.guildId);
      await rcon.send(`kit givetoplayer "${kit.internal_kit_name}" "${member.gamertag}"`);
      await rcon.say(formatKitMessage(interaction.guildId, kit, "delivery", { player: member.gamertag, kit: displayName })).catch(() => {});
      db.recordKitClaim(interaction.guildId, member.gamertag, kit.internal_kit_name, "panel");
      // Mirror into the matching Kit Engine binding's own cooldown record
      // too (if any), so claiming here also blocks an immediate in-game
      // quickchat claim of the same kit - see the cross-check above.
      if (autokitBinding) db.setAutokitCooldown(interaction.guildId, autokitBinding.id, member.gamertag);
      await interaction.editReply({ embeds: [successEmbed("Kit Claimed", `**${displayName}** delivered to **${member.gamertag}**.`)], components: [backRow()] });
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("Delivery Failed", `Couldn't reach the Rust server: ${err.message}`)], components: [backRow()] });
    }
    return;
  }

  // ---------------------------------------------------------------------
  // PATHVIEW 2: Vehicle Delivery Drawer
  // ---------------------------------------------------------------------

  // FIXED (2026-09-20, per explicit user report): this used to list EVERY
  // vehicle in config/vehicleShortnames.js unconditionally, with no admin
  // control and no cooldown at all - a completely separate, ungated path
  // from the Kit Engine's own Vehicle bindings (utils/autoKitEngine.js),
  // which DO have admin-configured role/cooldown/enabled controls. Now
  // sources from those same bindings instead of the raw static list, and
  // shares their exact delivery + cooldown logic (deliverVehicle/
  // remainingCooldownMs) so there's only one real vehicle-delivery path,
  // not two that can be played against each other.
  if (id === "playerpanel:vehicle_delivery") {
    const bindings = db.listAutokitMappings(interaction.guildId).filter((m) => m.binding_type === "vehicle" && m.enabled && (!m.required_role_id || interaction.member.roles.cache.has(m.required_role_id)));
    if (!bindings.length) {
      await interaction.update({ embeds: [infoEmbed("Vehicle Delivery", "No vehicles are available to you right now - ask staff to configure one via `/autokit-config`.")], components: [backRow()] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("playerpanel:vehicle_select")
      .setPlaceholder("Choose a vehicle")
      .addOptions(bindings.slice(0, 25).map((m) => ({ label: (m.display_name || m.kit_name).slice(0, 100), value: String(m.id) })));
    await interaction.update({ embeds: [infoEmbed("Vehicle Delivery", "Pick a vehicle - it spawns at your current in-game position.")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "playerpanel:vehicle_select") {
    await interaction.deferUpdate();
    const bindingId = Number(interaction.values[0]);
    const mapping = db.getAutokitMapping(interaction.guildId, bindingId);
    if (!mapping || mapping.binding_type !== "vehicle" || !mapping.enabled || (mapping.required_role_id && !interaction.member.roles.cache.has(mapping.required_role_id))) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "That vehicle isn't available to you anymore.")], components: [backRow()] });
      return;
    }
    const member = db.getMember(interaction.guildId, interaction.user.id);
    if (!member?.gamertag) {
      await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first so KOBA Bot knows where to spawn it.")], components: [backRow()] });
      return;
    }
    const remainingMs = remainingCooldownMs(interaction.guildId, mapping, member.gamertag);
    if (remainingMs > 0) {
      await interaction.editReply({ embeds: [dangerEmbed("On Cooldown", `**${mapping.display_name || mapping.kit_name}** is on cooldown for **${Math.ceil(remainingMs / 60000)}** more minute(s).`)], components: [backRow()] });
      return;
    }
    await deliverVehicle(interaction.guildId, mapping, member.gamertag);
    await interaction.editReply({ embeds: [successEmbed("Vehicle Delivered", `**${mapping.display_name || mapping.kit_name}** spawned at your position.`)], components: [backRow()] });
    return;
  }

  // ---------------------------------------------------------------------
  // PATHVIEW 3: Remote QuickChat Matrix
  // ---------------------------------------------------------------------

  if (id === "playerpanel:quickchat_matrix") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("playerpanel:qc_cooldowns").setLabel("⏱️ Check Cooldowns").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("playerpanel:qc_leaderboard").setLabel("🏆 View Leaderboard").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("playerpanel:qc_clan_status").setLabel("🛡️ Clan Status").setStyle(ButtonStyle.Secondary),
      // Added 2026-09-19, per explicit user request for the Teleport Home
      // quick-chat trigger - captures the player's own LIVE position
      // (server.printpos, same confirmed mechanism as Vehicle Delivery)
      // rather than an admin-typed coordinate, since "Home" is inherently
      // personal to each player.
      new ButtonBuilder().setCustomId("playerpanel:qc_set_home").setLabel("🏠 Set Home").setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [infoEmbed("Quick Actions", "Pick a shortcut below.")], components: [row, backRow()] });
    return;
  }

  if (id === "playerpanel:qc_set_home") {
    await interaction.deferUpdate();
    const member = db.getMember(interaction.guildId, interaction.user.id);
    if (!member?.gamertag) {
      await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first so KOBA Bot knows which in-game character to track.")], components: [backRow("playerpanel:quickchat_matrix")] });
      return;
    }
    try {
      const rcon = await getRcon(interaction.guildId);
      const pos = parsePrintPos(await rcon.send(`server.printpos "${member.gamertag}"`));
      if (!pos) {
        await interaction.editReply({ embeds: [dangerEmbed("Couldn't Locate You", "You need to be online and in-game to set your Home.")], components: [backRow("playerpanel:quickchat_matrix")] });
        return;
      }
      db.setPlayerHome(interaction.guildId, interaction.user.id, member.gamertag, pos.x, pos.y, pos.z);
      await interaction.editReply({ embeds: [successEmbed("Home Set", "Your current position is now saved as Home - use the Teleport Home quick-chat trigger in-game to return here anytime.")], components: [backRow("playerpanel:quickchat_matrix")] });
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("Failed", `Couldn't reach the Rust server: ${err.message}`)], components: [backRow("playerpanel:quickchat_matrix")] });
    }
    return;
  }

  if (id === "playerpanel:qc_cooldowns") {
    const member = db.getMember(interaction.guildId, interaction.user.id);
    const kits = db.listClaimableKitsForMember(interaction.guildId, interaction.member);
    if (!member?.gamertag || !kits.length) {
      await interaction.update({ embeds: [infoEmbed("Your Cooldowns", "No claimable kits to track yet.")], components: [backRow("playerpanel:quickchat_matrix")] });
      return;
    }
    const lines = kits.map((k) => {
      if (!k.claim_cooldown_minutes) return `**${k.display_name}** - always ready`;
      const record = db.getKitClaimRecord(interaction.guildId, member.gamertag, k.internal_kit_name);
      if (!record) return `**${k.display_name}** - ready now`;
      const remainingMs = k.claim_cooldown_minutes * 60 * 1000 - (Date.now() - record.claimed_at);
      return remainingMs > 0 ? `**${k.display_name}** - ${Math.ceil(remainingMs / 60000)}m remaining` : `**${k.display_name}** - ready now`;
    });
    await interaction.update({ embeds: [infoEmbed("Your Cooldowns", lines.join("\n"))], components: [backRow("playerpanel:quickchat_matrix")] });
    return;
  }

  if (id === "playerpanel:qc_leaderboard") {
    const sections = Object.values(LEADERBOARD_CATEGORIES).map((cat) => {
      const rows = cat.query(interaction.guildId, 0, Date.now(), 5);
      if (!rows.length) return `**${cat.label}**\n_No entries yet._`;
      const isTeamBased = cat.isTeamBased;
      const lines = rows.map((r, i) => `${i + 1}. ${isTeamBased ? r.team_name : r.killer_gamertag} - ${isTeamBased ? r.wins : r.kills} ${cat.countLabel}(s)`);
      return `**${cat.label}**\n${lines.join("\n")}`;
    });
    await interaction.update({ embeds: [infoEmbed("Leaderboards", sections.join("\n\n"))], components: [backRow("playerpanel:quickchat_matrix")] });
    return;
  }

  if (id === "playerpanel:qc_clan_status") {
    // Deep link to the existing Team Panel hub - same call-through
    // convention as utils/mainPanels.js's "team" option, rather than
    // re-implementing clan status here.
    const teamPanel = require("./teamPanel");
    await interaction.update(await teamPanel.buildHub(interaction));
    return;
  }

  if (id === "playerpanel:token_claim_select") {
    await interaction.deferUpdate();
    const tokenId = Number(interaction.values[0]);
    const token = db.getKitClaimToken(tokenId);
    if (!token || token.holder_discord_id !== interaction.user.id || token.status !== "held") {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "That token isn't yours to claim anymore.")], components: [backRow()] });
      return;
    }
    const result = await redeemToken(interaction, token);
    await interaction.editReply({ embeds: [result.embed], components: [backRow()] });
    return;
  }

  if (id === "playerpanel:token_give_select") {
    const tokenId = interaction.values[0];
    const userSelect = new UserSelectMenuBuilder().setCustomId(`playerpanel:token_give_pick_user:${tokenId}`).setPlaceholder("Give to who?");
    await interaction.update({ embeds: [infoEmbed("Give A Kit Token", "Pick the teammate to receive it.")], components: [new ActionRowBuilder().addComponents(userSelect), backRow()] });
    return;
  }

  if (id.startsWith("playerpanel:token_give_pick_user:")) {
    await interaction.deferUpdate();
    const tokenId = Number(id.split(":")[2]);
    const recipientId = interaction.values[0];
    const token = db.getKitClaimToken(tokenId);

    if (!token || token.holder_discord_id !== interaction.user.id || token.status !== "held") {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "That token isn't yours to give anymore.")], components: [backRow()] });
      return;
    }
    if (recipientId === interaction.user.id) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Recipient", "You can't give a token to yourself.")], components: [backRow()] });
      return;
    }

    // Added 2026-09-19, per explicit user request: an admin-set trade value
    // (utils/tradeConfigPanel.js) charges the RECIPIENT, paid to the giver -
    // no value set (the default, unchanged from before this existed) stays
    // a free transfer.
    const kitRow = db.getKit(interaction.guildId, token.display_name);
    let priceNote = "";
    if (kitRow?.trade_value) {
      const currency = db.getCurrency(interaction.guildId, kitRow.trade_currency_id);
      const recipientWallet = db.getWallet(interaction.guildId, recipientId, kitRow.trade_currency_id);
      if (recipientWallet.balance < kitRow.trade_value) {
        await interaction.editReply({
          embeds: [dangerEmbed("Recipient Can't Afford It", `**${token.display_name}** costs **${kitRow.trade_value} ${currency?.emoji || currency?.name}** - <@${recipientId}> only has **${recipientWallet.balance}**.`)],
          components: [backRow()],
        });
        return;
      }
      db.adjustWallet(interaction.guildId, recipientId, kitRow.trade_currency_id, -kitRow.trade_value);
      db.adjustWallet(interaction.guildId, interaction.user.id, kitRow.trade_currency_id, kitRow.trade_value);
      priceNote = ` for **${kitRow.trade_value} ${currency?.emoji || currency?.name}**`;
    }

    db.transferKitClaimToken(tokenId, recipientId);
    const recipientUser = interaction.users.get(recipientId);
    await logAdminAction(interaction.guild, {
      title: "Kit Token Traded",
      description: `**Item/Kit:** ${token.display_name} (\`${token.internal_kit_name}\`) ×1\n**From:** ${interaction.user.username}\n**To:** ${recipientUser?.username || recipientId}${priceNote}\n**Token ID:** ${tokenId}`,
    });
    await interaction.editReply({ embeds: [successEmbed("Token Sent", `**${token.display_name}** was given to **${recipientUser?.username || recipientId}**${priceNote}.`)], components: [backRow()] });
    return;
  }

  if (id === "playerpanel:role_give_select") {
    const roleId = interaction.values[0];
    const userSelect = new UserSelectMenuBuilder().setCustomId(`playerpanel:role_give_pick_user:${roleId}`).setPlaceholder("Give to who?");
    await interaction.update({ embeds: [infoEmbed("Give Away A Role", "Pick who receives it - you'll lose the role once they get it.")], components: [new ActionRowBuilder().addComponents(userSelect), backRow()] });
    return;
  }

  if (id.startsWith("playerpanel:role_give_pick_user:")) {
    await interaction.deferUpdate();
    const roleId = id.split(":")[2];
    const recipientId = interaction.values[0];

    if (recipientId === interaction.user.id) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Recipient", "You can't give a role to yourself.")], components: [backRow()] });
      return;
    }

    // interaction.guild can be null right after the bot restarts (guild
    // objects populate into the cache progressively) - fall back to a
    // fresh REST fetch instead of crashing on .roles/.members of null.
    const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
    if (!guild) {
      await interaction.editReply({ embeds: [dangerEmbed("Try Again", "KOBA Bot just restarted and hasn't fully synced yet - try again in a few seconds.")], components: [backRow()] });
      return;
    }

    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role || !interaction.member.roles.cache.has(roleId)) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "You don't hold that role anymore.")], components: [backRow()] });
      return;
    }

    const recipientMember = await guild.members.fetch(recipientId).catch(() => null);
    if (!recipientMember) {
      await interaction.editReply({ embeds: [dangerEmbed("Member Not Found", "Couldn't find that member in this server.")], components: [backRow()] });
      return;
    }

    // Added 2026-09-19, per explicit user request: an admin-set trade value
    // (utils/tradeConfigPanel.js) charges the RECIPIENT, paid to the giver -
    // no value set (the default, unchanged from before this existed) stays
    // a free transfer.
    const tradeValue = db.getRoleTradeValue(interaction.guildId, roleId);
    let priceNote = "";
    if (tradeValue) {
      const currency = db.getCurrency(interaction.guildId, tradeValue.currency_id);
      const recipientWallet = db.getWallet(interaction.guildId, recipientId, tradeValue.currency_id);
      if (recipientWallet.balance < tradeValue.value) {
        await interaction.editReply({
          embeds: [dangerEmbed("Recipient Can't Afford It", `${role} costs **${tradeValue.value} ${currency?.emoji || currency?.name}** - **${recipientMember.user.username}** only has **${recipientWallet.balance}**.`)],
          components: [backRow()],
        });
        return;
      }
    }

    try {
      await interaction.member.roles.remove(role, "Traded away via /player-panel");
      await recipientMember.roles.add(role, "Received via /player-panel trade");

      if (tradeValue) {
        db.adjustWallet(interaction.guildId, recipientId, tradeValue.currency_id, -tradeValue.value);
        db.adjustWallet(interaction.guildId, interaction.user.id, tradeValue.currency_id, tradeValue.value);
        const currency = db.getCurrency(interaction.guildId, tradeValue.currency_id);
        priceNote = ` for **${tradeValue.value} ${currency?.emoji || currency?.name}**`;
      }

      // If this was a temporary role grant, carry the REMAINING time over to
      // the new holder instead of resetting it - "if cooldown timer is still
      // going it respects it".
      const grant = db.getTempRoleGrant?.(interaction.guildId, interaction.user.id, roleId);
      if (grant) db.transferTempRoleGrant?.(interaction.guildId, interaction.user.id, recipientId, roleId);

      await logAdminAction(interaction.guild, {
        title: "Role Traded",
        description: `**Role:** ${role}\n**From:** ${interaction.user.username}\n**To:** ${recipientMember.user.username}${priceNote}`,
      });
      await interaction.editReply({ embeds: [successEmbed("Role Given", `${role} was moved from you to **${recipientMember.user.username}**${priceNote}.`)], components: [backRow()] });
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("Transfer Failed", `Couldn't update roles: \`${err.message}\`. KOBA Bot's role may need to be above **${role.name}** in the role list.`)], components: [backRow()] });
    }
    return;
  }

}

module.exports = { buildHub, handleComponent, tradeableRoles };

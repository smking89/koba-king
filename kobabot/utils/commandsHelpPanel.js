"use strict";

const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
const { classifyCommand, TIER_LABELS } = require("../config/commandTiers");
const { infoEmbed } = require("./embeds");
const { hasAdminClearance } = require("./teamAuth");
const { isBotOwner } = require("./premium");

/**
 * Which tiers THIS requester is even allowed to pick - matches the user's
 * ask directly: a plain player only ever sees "Player Commands" as an
 * option, staff additionally see their own tier, and only the actual bot
 * owner sees the Owner tier (bot-developer-only commands - not a per-guild
 * role at all, so no guild staff member should see it regardless of their
 * in-guild clearance).
 */
function visibleTiers(interaction) {
  const tiers = ["player"];
  if (hasAdminClearance(interaction)) tiers.push("staff");
  if (isBotOwner(interaction.user.id)) tiers.push("owner");
  return tiers;
}

function buildTierSelect(interaction, selected) {
  const options = visibleTiers(interaction).map((tier) => ({
    label: TIER_LABELS[tier],
    value: tier,
    default: tier === selected,
  }));
  const menu = new StringSelectMenuBuilder().setCustomId("commandshelp:tier_select").setPlaceholder("Choose a command category").addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

/** Every command in this tier, alphabetized - `/name` - description, stripped of its own "[Tag]" prefix (that's an internal convention, not useful to whoever's reading the list). */
function buildTierList(client, tier) {
  const commands = [...client.commands.values()]
    .filter((c) => classifyCommand(c) === tier)
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  if (!commands.length) return "Nothing in this category yet.";

  const lines = commands.map((c) => {
    const desc = (c.data.toJSON().description || "").replace(/^\[[^\]]+\]\s*/, "");
    return `\`/${c.data.name}\` — ${desc}`;
  });

  // Discord's 4096-char embed description limit - 79 commands' worth of
  // lines (Staff tier alone has 40+) could plausibly get close with long
  // descriptions, so hard-truncate rather than risk a failed send.
  let out = "";
  for (const line of lines) {
    if (out.length + line.length + 1 > 4000) {
      out += "\n…and more (too many to list here).";
      break;
    }
    out += (out ? "\n" : "") + line;
  }
  return out;
}

function buildTierView(interaction, tier) {
  return {
    embeds: [infoEmbed(TIER_LABELS[tier] || tier, buildTierList(interaction.client, tier))],
    components: [buildTierSelect(interaction, tier)],
  };
}

async function handleComponent(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const [, action] = interaction.customId.split(":");
  if (action !== "tier_select") return;

  await interaction.deferUpdate();
  const tier = interaction.values[0];
  // Re-check clearance at click time, not just at /commands' original
  // invocation - a stale ephemeral message from before a role change
  // shouldn't still let someone pick a tier they no longer qualify for.
  if (!visibleTiers(interaction).includes(tier)) {
    await interaction.editReply(buildTierView(interaction, "player"));
    return;
  }
  await interaction.editReply(buildTierView(interaction, tier));
}

module.exports = { visibleTiers, buildTierSelect, buildTierView, handleComponent };

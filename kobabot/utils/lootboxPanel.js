"use strict";

const fs = require("fs");
const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { successEmbed, dangerEmbed, infoEmbed } = require("./embeds");
const { deliverReward } = require("./rewardDelivery");
const { renderBoxSpin } = require("./lootboxImage");
const { LOOTBOX_TYPES } = require("../config/lootboxes");
const { rollBonusDrop } = require("./scrapMerchant");
const { publishGameCompleted } = require("./gameEvents");

/** reward.image_url can be a remote URL (Rust items, uploaded Discord attachments) or a local filesystem path (material icons) - embeds only accept the former directly, so a local path needs attaching as a file first. */
function buildImagePayload(imageUrl) {
  if (!imageUrl) return { setImage: null, files: [] };
  if (/^https?:\/\//i.test(imageUrl)) return { setImage: imageUrl, files: [] };
  if (!fs.existsSync(imageUrl)) return { setImage: null, files: [] };
  const filename = path.basename(imageUrl);
  return { setImage: `attachment://${filename}`, files: [new AttachmentBuilder(imageUrl, { name: filename })] };
}

/** Weighted random pick among a box's rewards - conditional on already having won (see win_rate, rolled separately). */
function pickWeighted(rewards) {
  const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const reward of rewards) {
    roll -= reward.weight;
    if (roll <= 0) return reward;
  }
  return rewards[rewards.length - 1]; // float rounding fallback
}

async function announceRoll(guild, channelId, text) {
  const lootboxChannelId = db.getGuildMeta(guild.id)?.lootbox_channel_id;
  if (!lootboxChannelId || lootboxChannelId === channelId) return;
  const channel = await guild.channels.fetch(lootboxChannelId).catch(() => null);
  if (channel) await channel.send({ embeds: [infoEmbed("Lootbox Roll", text)] }).catch(() => {});
}

/**
 * Core roll logic, shared by /lootbox (commands/lootbox.js) and the Games
 * Panel (utils/gamesPanel.js) - validates, charges the wager, rolls
 * win/lose + (if won) which reward, renders the spin image, and creates the
 * pending claim. Callers own actually sending the returned payload (each
 * entry point has different interaction/reply semantics).
 *
 * @param {{ guild: import('discord.js').Guild, channelId: string, userId: string, boxKey: string, wager: number, serverName?: string }} params
 * @returns {Promise<{ error: string } | { embeds: any[], files: any[], components: any[] }>}
 */
async function rollLootbox({ guild, channelId, userId, boxKey, wager, serverName }) {
  const guildId = guild.id;
  const boxLabel = LOOTBOX_TYPES.find((b) => b.key === boxKey)?.label || boxKey;

  const lossBoxKey = db.getGuildMeta(guildId)?.lootbox_loss_box_key || null;
  if (boxKey === lossBoxKey) {
    return { error: `**${boxLabel}** is this server's designated loss outcome - it shows automatically when you lose, but can't be opened directly.` };
  }

  const settings = db.getLootboxSettings(guildId, boxKey);
  if (!settings) return { error: `**${boxLabel}** hasn't been set up yet - ask staff to configure it via the Games Panel's Configure button.` };

  if (wager < settings.min_bet || wager > settings.max_bet) {
    return { error: `**${boxLabel}** only accepts wagers between **${settings.min_bet}** and **${settings.max_bet}**.` };
  }

  const pool = db.listLootboxRewards(guildId, boxKey);
  if (!pool.length) return { error: `**${boxLabel}** has no rewards configured yet - ask staff to add some via the Games Panel's Configure button.` };

  const wallet = db.getWallet(guildId, userId, settings.currency_id);
  if (wallet.balance < wager) {
    return { error: `You're trying to wager **${wager} ${settings.currency_emoji || ""} ${settings.currency_name}** but only have **${wallet.balance}**.` };
  }

  // Wager is spent on the roll itself, win or lose - that's the gamble.
  db.adjustWallet(guildId, userId, settings.currency_id, -wager);

  const isWin = Math.random() * 100 < settings.win_rate;
  const image = await renderBoxSpin({ openedBoxKey: boxKey, isWin, lossBoxKey });
  const attachment = new AttachmentBuilder(image, { name: "lootbox.gif" });

  if (!isWin) {
    // No persisted row exists for a loss (nothing to claim), so there's no
    // natural id to key idempotency off - a fresh random one is correct
    // here since rollLootbox only ever runs once per roll, synchronously,
    // with no separate "close" step that could replay the same loss twice.
    publishGameCompleted({ guildId, discordId: userId, gameKey: "lootbox", won: false, wager, payout: 0, sourceId: `lootbox_loss:${guildId}:${userId}:${Date.now()}:${Math.random()}` });
    const embed = infoEmbed("Lootbox Result", `You wagered **${wager} ${settings.currency_emoji || ""} ${settings.currency_name}** on **${boxLabel}** and came up empty. Better luck next time!`).setImage(
      "attachment://lootbox.gif"
    );
    await announceRoll(guild, channelId, `<@${userId}> opened **${boxLabel}** and lost their wager.`);
    return { embeds: [embed], files: [attachment], components: [] };
  }

  const winner = pickWeighted(pool);
  const claimId = db.addLootboxPendingClaim(guildId, userId, boxKey, winner.id, wager, serverName);
  // Reward isn't necessarily currency-denominated (could be a kit/item/material) - payout is left null rather than fabricating a number, same rule as utils/gameEvents.js's header documents.
  publishGameCompleted({ guildId, discordId: userId, gameKey: "lootbox", won: true, wager, payout: null, sourceId: `lootbox_claim:${claimId}` });

  // The Scrap Merchant - a win here has a chance to also drop a junk item,
  // independent of and on top of the box's own reward (see
  // utils/scrapMerchant.js's rollBonusDrop).
  const scrapDrop = rollBonusDrop(guildId, userId);
  const scrapNote = scrapDrop ? `\n\n${scrapDrop.emoji || "🔩"} You also picked up **${scrapDrop.name}** - sell it at The Scrap Merchant.` : "";

  const embed = infoEmbed("Lootbox Result", `You won something in **${boxLabel}**! Press **Open** below to reveal it.${scrapNote}`).setImage("attachment://lootbox.gif");
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`lootbox:open:${claimId}`).setLabel("Open").setStyle(ButtonStyle.Success));

  await announceRoll(guild, channelId, `<@${userId}> opened **${boxLabel}** and won a prize!`);
  return { embeds: [embed], files: [attachment], components: [row] };
}

async function handleComponent(interaction) {
  const [, action, claimIdRaw] = interaction.customId.split(":");
  const claimId = Number(claimIdRaw);
  const guildId = interaction.guildId;
  const claim = db.getLootboxPendingClaim(guildId, claimId);

  if (!claim) {
    await interaction.reply({ embeds: [dangerEmbed("Not Found", "This lootbox claim no longer exists.")], ephemeral: true });
    return;
  }
  if (claim.discord_id !== interaction.user.id) {
    await interaction.reply({ embeds: [dangerEmbed("Not Yours", "This isn't your lootbox win to open.")], ephemeral: true });
    return;
  }

  const reward = db.getLootboxReward(guildId, claim.reward_id);
  if (!reward) {
    await interaction.reply({ embeds: [dangerEmbed("Reward Removed", "This reward was removed from the box's pool after you won it - contact staff.")], ephemeral: true });
    return;
  }

  if (action === "open") {
    if (!claim.opened_at) db.markLootboxClaimOpened(claimId);

    const boxLabel = LOOTBOX_TYPES.find((b) => b.key === claim.box_key)?.label || claim.box_key;
    const amountLine = reward.amount !== 1 ? ` ×${reward.amount}` : "";
    const { setImage, files } = buildImagePayload(reward.image_url);
    const embed = successEmbed("You Won!", `From **${boxLabel}**: **${reward.display_name}**${amountLine}\n\nPress **Claim** below to receive it.`);
    if (setImage) embed.setImage(setImage);

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`lootbox:claim:${claimId}`).setLabel("Claim").setStyle(ButtonStyle.Success));
    await interaction.update({ embeds: [embed], files, components: [row] });
    return;
  }

  if (action === "claim") {
    if (claim.claimed_at) {
      await interaction.reply({ embeds: [infoEmbed("Already Claimed", "This reward was already delivered.")], ephemeral: true });
      return;
    }

    // Delay is admin-configurable (/lootbox-config set-claim) and can
    // exceed Discord's ~3s unacknowledged-interaction window, so acknowledge
    // first (deferUpdate keeps the existing message, no new reply) and edit
    // in the actual result once delivery finishes.
    await interaction.deferUpdate();

    const delaySec = db.getConfig(guildId, "lootbox_claim_delay_sec");
    if (delaySec > 0) await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));

    const delivery = await deliverReward(
      interaction.guild,
      interaction.user.id,
      { rewardType: reward.reward_type, rewardRef: reward.reward_ref, amount: reward.amount },
      claim.server_name
    );
    // FIXED (2026-09-06): this used to mark the claim fulfilled
    // unconditionally, even when delivery.delivered was false - a failed
    // claim (e.g. the player wasn't online) got permanently locked out from
    // ever retrying (claim.claimed_at gated above blocks a second attempt),
    // with "contact staff for a manual fix" as the only way out. Only mark
    // it claimed once delivery actually succeeded.
    if (delivery.delivered) db.markLootboxClaimClaimed(claimId);

    // In-game flavor message for anything that actually lands in the Rust
    // world (item/kit/material) - a Discord role grant has no natural
    // in-game equivalent to announce, so skip those. Same server/map the
    // reward itself was delivered to, not just the guild's default.
    if (delivery.delivered && ["item", "kit", "material"].includes(reward.reward_type)) {
      const member = db.getMember(guildId, interaction.user.id);
      if (member?.gamertag) {
        try {
          const rcon = await getRcon(guildId, claim.server_name);
          const template = db.getConfig(guildId, "lootbox_claim_message");
          await rcon.say(template.replace(/\{gamertag\}/g, member.gamertag));
        } catch {
          // best-effort, delivery itself already succeeded regardless
        }
      }
    }

    const embed = delivery.delivered
      ? successEmbed("Claimed!", `**${reward.display_name}** has been delivered.`)
      : dangerEmbed("Delivery Failed", `**${reward.display_name}** couldn't be delivered: ${delivery.note}\nContact staff - this needs a manual fix.`);

    await interaction.editReply({ embeds: [embed], files: [], components: [] });
    return;
  }
}

module.exports = { handleComponent, rollLootbox };

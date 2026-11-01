"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require("discord.js");
const db = require("../database/db");
const { deliverReward } = require("./rewardDelivery");
const { baseEmbed, successEmbed, dangerEmbed, infoEmbed, COLORS } = require("./embeds");

/** Human-readable label for a reward, given its type/ref - used in every auction embed and DM. */
function rewardLabel(guild, rewardType, rewardRef, amount) {
  if (rewardType === "role") {
    const role = guild.roles.cache.get(rewardRef);
    // A real mention (not plain "RoleName" text) - renders with the role's
    // actual color and is clickable, same as any other role mention.
    return role ? `${role} role` : "Unknown role";
  }
  if (rewardType === "material") {
    const { MATERIAL_LABELS } = require("../config/materials");
    return `${amount}x ${MATERIAL_LABELS[rewardRef] || rewardRef}`;
  }
  // 'kit' and 'item' both just show their configured/short name directly.
  return `${amount > 1 ? `${amount}x ` : ""}${rewardRef}`;
}

function buildAuctionMessage(guild, auction) {
  const currency = db.getCurrency(guild.id, auction.currency_id);
  const currencyLabel = currency?.emoji || currency?.name || "coins";
  const label = rewardLabel(guild, auction.reward_type, auction.reward_ref, auction.amount);

  const closed = auction.status !== "active";
  const embed = baseEmbed(closed ? COLORS.warning : COLORS.brand)
    .setTitle(`${closed ? "[ CLOSED ] " : "[ AUCTION ] "}${label}`)
    .addFields(
      { name: "Current Bid", value: auction.current_bid ? `${auction.current_bid} ${currencyLabel} (${auction.current_bidder ? `<@${auction.current_bidder}>` : "-"})` : `Starting bid: ${auction.starting_bid} ${currencyLabel}`, inline: true },
      ...(auction.buy_now_price ? [{ name: "Buy Now", value: `${auction.buy_now_price} ${currencyLabel}`, inline: true }] : []),
      { name: "Ends", value: `<t:${Math.floor(auction.ends_at / 1000)}:R>`, inline: true }
    );

  if (closed) {
    embed.setDescription(auction.status === "sold" ? `Won by <@${auction.current_bidder}> for **${auction.current_bid} ${currencyLabel}**.` : "No bids were placed - this auction expired.");
    // Sold but not yet delivered (see schema.sql's auctions header) - the
    // winner already paid, so this stays visible until someone (them or
    // staff) successfully retries, rather than silently losing the reward.
    const needsRetry = auction.status === "sold" && !auction.delivered_at;
    return {
      embeds: [needsRetry ? embed.setFooter({ text: "⚠️ Delivery failed - press Retry Delivery below." }) : embed],
      components: needsRetry
        ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`auction:retry_delivery:${auction.id}`).setLabel("Retry Delivery").setStyle(ButtonStyle.Danger))]
        : [],
    };
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`auction:bid_open:${auction.id}`).setLabel("Place Bid").setStyle(ButtonStyle.Primary).setEmoji("🔨"),
    ...(auction.buy_now_price ? [new ButtonBuilder().setCustomId(`auction:buynow:${auction.id}`).setLabel("Buy Now").setStyle(ButtonStyle.Success)] : [])
  );

  return { embeds: [embed], components: [row] };
}

async function postAuction(guild, auction) {
  const meta = db.getGuildMeta(guild.id);
  if (!meta?.auction_channel_id) return null;
  const channel = await guild.channels.fetch(meta.auction_channel_id).catch(() => null);
  if (!channel) return null;

  const message = await channel.send(buildAuctionMessage(guild, auction)).catch(() => null);
  if (message) db.setAuctionMessage(guild.id, auction.id, channel.id, message.id);
  return message;
}

async function refreshAuctionMessage(guild, auction) {
  if (!auction.channel_id || !auction.message_id) return;
  const channel = await guild.channels.fetch(auction.channel_id).catch(() => null);
  const message = channel ? await channel.messages.fetch(auction.message_id).catch(() => null) : null;
  if (message) await message.edit(buildAuctionMessage(guild, auction)).catch(() => {});
}

async function handleComponent(interaction) {
  if (!interaction.isButton()) return;
  const [, action, idRaw] = interaction.customId.split(":");
  const auctionId = Number(idRaw);

  if (action === "browse") {
    const auctions = db.listActiveAuctions(interaction.guildId);
    if (!auctions.length) {
      await interaction.reply({ embeds: [infoEmbed("Active Auctions", "None right now - check back later.")], ephemeral: true });
      return;
    }
    const lines = auctions.map((a) => `**#${a.id}** ${rewardLabel(interaction.guild, a.reward_type, a.reward_ref, a.amount)} - current bid **${a.current_bid || a.starting_bid}** - ends <t:${Math.floor(a.ends_at / 1000)}:R>\nScroll up to this auction's own post to **Place Bid**${a.buy_now_price ? " or **Buy Now**" : ""}.`);
    await interaction.reply({ embeds: [infoEmbed("Active Auctions", lines.join("\n\n"))], ephemeral: true });
    return;
  }

  if (action === "bid_open") {
    const auction = db.getAuction(interaction.guildId, auctionId);
    if (!auction || auction.status !== "active") {
      await interaction.reply({ embeds: [dangerEmbed("Auction Closed", "This auction is no longer active.")], ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`auction:bid_modal:${auctionId}`).setTitle("Place Your Bid");
    const amountInput = new TextInputBuilder()
      .setCustomId("amount")
      // .slice(0, 45) - defensive: TextInputBuilder labels hard-fail past
      // Discord's 45-char limit (see utils/kitPanel.js's customize-message
      // bug fix, same session) - this one's built from a live numeric
      // value, not a fixed string, so it isn't provably safe by inspection.
      .setLabel(`Bid amount (min ${(auction.current_bid || auction.starting_bid) + (auction.current_bid ? 1 : 0)})`.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    await interaction.showModal(modal);
    return;
  }

  if (action === "buynow") {
    await interaction.deferReply({ ephemeral: true });
    const auction = db.getAuction(interaction.guildId, auctionId);
    if (!auction || auction.status !== "active" || !auction.buy_now_price) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "This auction can't be bought now.")] });
      return;
    }

    const wallet = db.getWallet(interaction.guildId, interaction.user.id, auction.currency_id);
    if (wallet.balance < auction.buy_now_price) {
      await interaction.editReply({ embeds: [dangerEmbed("Insufficient Balance", `You need **${auction.buy_now_price}** but only have **${wallet.balance}**.`)] });
      return;
    }

    const sold = db.buyNowAuction(interaction.guildId, auctionId, interaction.user.id, auction.buy_now_price, auction.currency_id);
    // FIXED (2026-09-06): used to ignore deliverReward's return value
    // entirely and always say "Bought!" - a failed delivery (e.g. offline)
    // was reported as a success with no way to ever retry. Payment is
    // already taken at this point regardless (same as before), but now a
    // failure shows honestly and leaves a Retry Delivery button on the
    // auction message (see buildAuctionMessage) instead of silently losing
    // the reward.
    const delivery = await deliverReward(interaction.guild, interaction.user.id, { rewardType: sold.reward_type, rewardRef: sold.reward_ref, amount: sold.amount }, undefined);
    if (delivery.delivered) db.markAuctionDelivered(auctionId);
    await refreshAuctionMessage(interaction.guild, db.getAuction(interaction.guildId, auctionId));

    if (delivery.delivered) {
      await interaction.editReply({ embeds: [successEmbed("Bought!", `You bought this auction for **${auction.buy_now_price}**.`)] });
    } else {
      await interaction.editReply({
        embeds: [dangerEmbed("Bought - Delivery Failed", `You were charged **${auction.buy_now_price}**, but delivery failed: ${delivery.note}\nPress **Retry Delivery** on the auction post once you're able to.`)],
      });
    }
    return;
  }

  if (action === "retry_delivery") {
    await interaction.deferReply({ ephemeral: true });
    const auction = db.getAuction(interaction.guildId, auctionId);
    if (!auction || auction.status !== "sold") {
      await interaction.editReply({ embeds: [dangerEmbed("Not Available", "This auction isn't in a state that needs a delivery retry.")] });
      return;
    }
    if (auction.delivered_at) {
      await interaction.editReply({ embeds: [infoEmbed("Already Delivered", "This was already delivered.")] });
      await refreshAuctionMessage(interaction.guild, auction);
      return;
    }
    // Only the winner or staff can retry - anyone else clicking a public
    // auction message shouldn't be able to trigger a delivery attempt for
    // someone else's purchase.
    const isWinner = interaction.user.id === auction.current_bidder;
    const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    if (!isWinner && !isStaff) {
      await interaction.editReply({ embeds: [dangerEmbed("Not Yours", "Only the winning bidder or staff can retry this delivery.")] });
      return;
    }

    const delivery = await deliverReward(interaction.guild, auction.current_bidder, { rewardType: auction.reward_type, rewardRef: auction.reward_ref, amount: auction.amount }, undefined);
    if (delivery.delivered) db.markAuctionDelivered(auctionId);
    await refreshAuctionMessage(interaction.guild, db.getAuction(interaction.guildId, auctionId));

    await interaction.editReply({
      embeds: [delivery.delivered ? successEmbed("Delivered!", "The reward was delivered successfully.") : dangerEmbed("Still Failed", `Delivery failed again: ${delivery.note}`)],
    });
    return;
  }
}

async function handleModal(interaction) {
  const [, action, idRaw] = interaction.customId.split(":");
  if (action !== "bid_modal") return;
  const auctionId = Number(idRaw);

  await interaction.deferReply({ ephemeral: true });

  const auction = db.getAuction(interaction.guildId, auctionId);
  if (!auction || auction.status !== "active") {
    await interaction.editReply({ embeds: [dangerEmbed("Auction Closed", "This auction is no longer active.")] });
    return;
  }

  const amount = parseFloat(interaction.fields.getTextInputValue("amount").trim());
  const minBid = auction.current_bid ? auction.current_bid + 1 : auction.starting_bid;
  if (!Number.isFinite(amount) || amount < minBid) {
    await interaction.editReply({ embeds: [dangerEmbed("Bid Too Low", `Your bid must be at least **${minBid}**.`)] });
    return;
  }
  if (auction.current_bidder === interaction.user.id) {
    await interaction.editReply({ embeds: [dangerEmbed("Already Highest Bidder", "You're already the highest bidder on this auction.")] });
    return;
  }

  const wallet = db.getWallet(interaction.guildId, interaction.user.id, auction.currency_id);
  if (wallet.balance < amount) {
    await interaction.editReply({ embeds: [dangerEmbed("Insufficient Balance", `You need **${amount}** but only have **${wallet.balance}**.`)] });
    return;
  }

  const updated = db.placeBid(interaction.guildId, auctionId, interaction.user.id, amount, auction.currency_id);
  await refreshAuctionMessage(interaction.guild, updated);
  await interaction.editReply({ embeds: [successEmbed("Bid Placed", `You're now the highest bidder at **${amount}**.`)] });
}

/** Background-loop tick: resolves any auction whose ends_at has passed - awards the top bidder (delivering the reward) or marks it expired if nobody bid. */
async function runAuctionTick(client) {
  for (const auction of db.listDueAuctions()) {
    try {
      const guild = await client.guilds.fetch(auction.guild_id).catch(() => null);
      if (!guild) {
        db.setAuctionStatus(auction.id, "expired");
        continue;
      }

      if (auction.current_bidder) {
        db.setAuctionStatus(auction.id, "sold");
        // FIXED (2026-09-06): return value used to be discarded entirely -
        // a failed delivery here (no interactive session to retry from,
        // this is a background tick) silently lost the winner's reward
        // forever with no record anything went wrong. Now leaves
        // delivered_at unset on failure, which makes buildAuctionMessage
        // show a Retry Delivery button on the closed auction post.
        const delivery = await deliverReward(guild, auction.current_bidder, { rewardType: auction.reward_type, rewardRef: auction.reward_ref, amount: auction.amount });
        if (delivery.delivered) db.markAuctionDelivered(auction.id);
        else console.warn(`[KOBA Bot] Auction #${auction.id} delivery failed on close: ${delivery.note}`);
        await refreshAuctionMessage(guild, db.getAuction(auction.guild_id, auction.id));
      } else {
        db.setAuctionStatus(auction.id, "expired");
        await refreshAuctionMessage(guild, db.getAuction(auction.guild_id, auction.id));
      }
    } catch (err) {
      console.error(`[KOBA Bot] Auction resolve failed for auction ${auction.id}:`, err);
    }
  }
}

module.exports = { buildAuctionMessage, postAuction, handleComponent, handleModal, runAuctionTick, rewardLabel };

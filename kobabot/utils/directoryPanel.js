"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const db = require("../database/db");
const { getRcon } = require("../rcon/manager");
const { RconClient } = require("../rcon/rcon");
const { decryptSecret } = require("./secretCrypto");
const { flagshipGuildId } = require("./premium");
const { parseServerInfo, parsePlayerlist } = require("../rcon/parsers");
const { baseEmbed, successEmbed, dangerEmbed, infoEmbed, COLORS } = require("./embeds");
const { computeServerAchievementScore, serverAchievementTierForScore } = require("../config/serverAchievements");

/**
 * A standalone listing (see database/schema.sql's directory_servers header
 * comment) has no KOBA Bot guild/license at all - just a WebRCON host/port/
 * password entered on the website - so it can't go through
 * rcon/manager.js's guild-keyed connection cache. Connects directly and
 * closes the connection right after use rather than caching it, since
 * these polls are infrequent (one per telemetry tick) and there's no
 * guild-scoped lifecycle to hang the connection off of.
 */
async function connectStandaloneRcon(server) {
  const client = new RconClient({ host: server.rcon_host, port: server.rcon_port, password: decryptSecret(server.rcon_password_encrypted) });
  await client.connect();
  return client;
}

/**
 * Resolves the right RCON connection for a listing, whichever type it is.
 * Standalone listings (rcon_host set) connect directly via
 * connectStandaloneRcon and are the CALLER's responsibility to close
 * afterward (isStandalone: true signals this) - there's no guild-scoped
 * lifecycle to hang a cached connection off of for these. Guild-based
 * listings use rcon/manager.js's shared cached connection instead, which
 * must NOT be closed here (the manager owns that lifecycle for every other
 * feature sharing it).
 */
async function resolveRcon(server) {
  if (server.rcon_host) {
    const rcon = await connectStandaloneRcon(server);
    return { rcon, isStandalone: true };
  }
  const rcon = await getRcon(server.guild_id);
  return { rcon, isStandalone: false };
}

const PLAYTIME_REQUIRED_MINUTES = 10;
const STARS = "⭐";

function hubGuildId() {
  return flagshipGuildId();
}

/** Renders one server's directory card, matching the pinned reference layout (title bar, ID, players, queue, rating, playtime req). */
function buildServerCard(server) {
  const rating = db.getDirectoryRating(server.guild_id);
  const ratingLine = rating.reviewCount ? `${STARS} ${rating.avgStars.toFixed(1)} / 5.0 (${rating.reviewCount} Verified Review${rating.reviewCount === 1 ? "" : "s"})` : "No reviews yet";

  const achievementScore = computeServerAchievementScore({
    eventsHosted: server.events_hosted_count,
    eventsCompleted: server.events_completed_count,
    followers: db.getDirectoryFollowerCount(server.guild_id),
  });
  const achievementTier = serverAchievementTierForScore(achievementScore);

  const embed = baseEmbed(COLORS.brand)
    .setTitle(`🎮 ${server.title}`)
    .setDescription(
      [
        `🆔 Server ID: #${server.id}`,
        `👥 Players: ${server.player_count} / ${server.max_players}`,
        `⏳ Queue: ${server.queued} in queue`,
        `${ratingLine}`,
        `⏱️ Playtime Req: ${PLAYTIME_REQUIRED_MINUTES}+ Min Playtime Verified`,
        `🎖️ Server Achievement: **${achievementTier.name}**`,
        ...(server.tags.length ? [server.tags.map((t) => `#${t}`).join(" ")] : []),
      ].join("\n")
    )
    .setThumbnail(achievementTier.badgeUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Join Server Discord").setStyle(ButtonStyle.Link).setURL(server.invite_url).setEmoji("🔗"),
    new ButtonBuilder().setCustomId(`directory:review_open:${server.id}`).setLabel("Write Review").setStyle(ButtonStyle.Primary).setEmoji("⭐"),
    new ButtonBuilder().setCustomId(`directory:copy_id:${server.id}`).setLabel("Copy Server ID").setStyle(ButtonStyle.Secondary).setEmoji("📋")
  );

  return { embeds: [embed], components: [row] };
}

/** Posts (first registration) or edits-in-place (every telemetry/rating update after) a server's card in the hub directory channel. */
async function syncServerCard(client, server) {
  const guildId = hubGuildId();
  if (!guildId) return;
  const hub = await client.guilds.fetch(guildId).catch(() => null);
  if (!hub) return;
  const channelId = server.channel_id || db.getConfig(guildId, "directory_channel_id");
  if (!channelId) return;
  const channel = await hub.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const payload = buildServerCard(server);

  if (server.message_id) {
    const existing = await channel.messages.fetch(server.message_id).catch(() => null);
    if (existing) {
      await existing.edit(payload).catch(() => {});
      return;
    }
  }

  const message = await channel.send(payload).catch(() => null);
  if (message) db.setDirectoryServerMessage(server.guild_id, channel.id, message.id);
}

function buildFilterPanel() {
  const embed = infoEmbed("🌐 KOBA Bot Directory", "Pick a sort below, or run `/server directory search` any time.");
  const menu = new StringSelectMenuBuilder()
    .setCustomId("directory:filter")
    .setPlaceholder("Sort the directory")
    .addOptions(
      { label: "🔥 Newest First", value: "newest" },
      { label: "📜 Oldest / Established", value: "oldest" },
      { label: "⭐ 5-Star Rated (4.5-5.0)", value: "5star" },
      { label: "🌟 4-Star & Up", value: "4star" },
      { label: "📈 Highest Population", value: "highpop" }
    );
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

/** Shared by the pinned select menu and /directory search - both just need a sorted+filtered list rendered as an ephemeral summary, since editing/reordering the live per-server cards isn't possible. */
function buildFilteredResults(sort) {
  let servers = db.listDirectoryServers();
  const withRating = servers.map((s) => ({ ...s, rating: db.getDirectoryRating(s.guild_id) }));

  switch (sort) {
    case "oldest":
      withRating.sort((a, b) => a.created_at - b.created_at);
      break;
    case "5star":
      servers = withRating.filter((s) => s.rating.avgStars >= 4.5);
      break;
    case "4star":
      servers = withRating.filter((s) => s.rating.avgStars >= 4.0);
      break;
    case "highpop":
      withRating.sort((a, b) => b.player_count + b.queued - (a.player_count + a.queued));
      break;
    case "newest":
    default:
      withRating.sort((a, b) => b.created_at - a.created_at);
      break;
  }

  const list = sort === "5star" || sort === "4star" ? servers : withRating;
  if (!list.length) return { embeds: [infoEmbed("Directory Results", "No servers match that filter.")] };

  const lines = list.slice(0, 15).map((s) => {
    const r = s.rating || db.getDirectoryRating(s.guild_id);
    return `**#${s.id} - ${s.title}**\n👥 ${s.player_count}/${s.max_players} (${s.queued} queued) · ${STARS} ${r.reviewCount ? r.avgStars.toFixed(1) : "—"} (${r.reviewCount})`;
  });

  return { embeds: [infoEmbed("Directory Results", lines.join("\n\n"))] };
}

function buildStarPrompt(serverId) {
  const row1 = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) => new ButtonBuilder().setCustomId(`directory:star:${serverId}:${n}`).setLabel(STARS.repeat(n)).setStyle(ButtonStyle.Secondary))
  );
  return { embeds: [infoEmbed("Rate This Server", "Pick a star rating, then write your review.")], components: [row1] };
}

async function handleComponent(interaction) {
  const [, action, ...rest] = interaction.customId.split(":");

  if (action === "filter" && interaction.isStringSelectMenu()) {
    await interaction.reply({ ...buildFilteredResults(interaction.values[0]), ephemeral: true });
    return;
  }

  if (!interaction.isButton()) return;
  const serverId = Number(rest[0]);

  if (action === "copy_id") {
    await interaction.reply({ content: `\`#${serverId}\``, ephemeral: true });
    return;
  }

  if (action === "review_open") {
    const server = db.getDirectoryServerById(serverId);
    if (!server) {
      await interaction.reply({ embeds: [dangerEmbed("Not Found", "This server is no longer listed.")], ephemeral: true });
      return;
    }

    const gamertag = db.getAnyLinkedGamertag(interaction.user.id);
    if (!gamertag) {
      await interaction.reply({ embeds: [dangerEmbed("Link Required", "Run `/link` (in any server you play on) before reviewing.")], ephemeral: true });
      return;
    }

    const minutes = db.getDirectoryPlaytime(server.guild_id, gamertag);
    if (minutes < PLAYTIME_REQUIRED_MINUTES) {
      await interaction.reply({ embeds: [dangerEmbed("[ ❌ Playtime Required ]", `You must log at least **${PLAYTIME_REQUIRED_MINUTES} minutes** of active playtime on this server before submitting a review. Logged so far: **${Math.floor(minutes)} min**.`)], ephemeral: true });
      return;
    }

    await interaction.reply({ ...buildStarPrompt(serverId), ephemeral: true });
    return;
  }

  if (action === "star") {
    const stars = Number(rest[1]);
    const modal = new ModalBuilder().setCustomId(`directory:review_modal:${serverId}:${stars}`).setTitle(`${STARS.repeat(stars)} Review`);
    const textInput = new TextInputBuilder().setCustomId("text").setLabel("Your review").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await interaction.showModal(modal);
    return;
  }
}

async function handleModal(interaction) {
  const [, action, serverIdRaw, starsRaw] = interaction.customId.split(":");
  if (action !== "review_modal") return;

  await interaction.deferReply({ ephemeral: true });

  const server = db.getDirectoryServerById(Number(serverIdRaw));
  if (!server) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Found", "This server is no longer listed.")] });
    return;
  }

  const stars = Number(starsRaw);
  const text = interaction.fields.getTextInputValue("text").trim();
  db.upsertDirectoryReview(server.guild_id, interaction.user.id, stars, text);

  // Post/update the review log entry and the card's aggregate rating.
  try {
    const hubId = hubGuildId();
    const hub = hubId ? await interaction.client.guilds.fetch(hubId).catch(() => null) : null;
    const reviewChannelId = hubId ? db.getConfig(hubId, "reviews_channel_id") : null;
    const reviewChannel = hub && reviewChannelId ? await hub.channels.fetch(reviewChannelId).catch(() => null) : null;
    if (reviewChannel) {
      const reviewEmbed = baseEmbed(COLORS.brand)
        .setTitle(`${STARS.repeat(stars)} Review for ${server.title}`)
        .setDescription(text)
        .setFooter({ text: `Verified ${PLAYTIME_REQUIRED_MINUTES}+ min playtime · by ${interaction.user.tag}` });
      const existing = db.getDirectoryReview(server.guild_id, interaction.user.id);
      const existingMessage = existing?.message_id ? await reviewChannel.messages.fetch(existing.message_id).catch(() => null) : null;
      if (existingMessage) {
        await existingMessage.edit({ embeds: [reviewEmbed] }).catch(() => {});
      } else {
        const posted = await reviewChannel.send({ embeds: [reviewEmbed] }).catch(() => null);
        if (posted) db.setDirectoryReviewMessage(server.guild_id, interaction.user.id, posted.id);
      }
    }
    await syncServerCard(interaction.client, db.getDirectoryServer(server.guild_id));
  } catch (err) {
    console.warn("[KOBA Bot] Directory review post/refresh failed:", err.message);
  }

  await interaction.editReply({ embeds: [successEmbed("Review Submitted", "Thanks - your review is posted and the server's rating has been updated.")] });
}

/** Background tick: refreshes live telemetry (player count/queue/ping) for every registered server and keeps its card in sync. ping_ms is the real RCON request/response round-trip time - not a player's client-side ping (KOBA Bot has no way to measure that), but an honest, real number rather than a fabricated one. */
async function runDirectoryTelemetryTick(client) {
  for (const server of db.listDirectoryServers()) {
    let standaloneRcon = null;
    try {
      const { rcon, isStandalone } = await resolveRcon(server);
      if (isStandalone) standaloneRcon = rcon;
      const startedAt = Date.now();
      const info = parseServerInfo(await rcon.sendJson("serverinfo"));
      const pingMs = Date.now() - startedAt;
      db.updateDirectoryTelemetry(server.guild_id, info.players, info.maxPlayers, info.queued, pingMs);
      await syncServerCard(client, db.getDirectoryServer(server.guild_id));
    } catch (err) {
      console.warn(`[KOBA Bot] Directory telemetry poll failed for guild ${server.guild_id}:`, err.message);
    } finally {
      if (standaloneRcon) standaloneRcon.close();
    }
  }
}

/** Background tick: accrues playtime minutes for every gamertag currently online on each registered server, at whatever interval this tick runs. */
async function runDirectoryPlaytimeTick(intervalMinutes) {
  for (const server of db.listDirectoryServers()) {
    let standaloneRcon = null;
    try {
      const { rcon, isStandalone } = await resolveRcon(server);
      if (isStandalone) standaloneRcon = rcon;
      const players = parsePlayerlist(await rcon.send("players"));
      for (const p of players) db.addDirectoryPlaytime(server.guild_id, p.gamertag, intervalMinutes);
    } catch {
      // server offline - just skip this tick for this server, no accrual
    } finally {
      if (standaloneRcon) standaloneRcon.close();
    }
  }
}

module.exports = {
  hubGuildId,
  buildServerCard,
  syncServerCard,
  buildFilterPanel,
  buildFilteredResults,
  handleComponent,
  handleModal,
  runDirectoryTelemetryTick,
  runDirectoryPlaytimeTick,
  PLAYTIME_REQUIRED_MINUTES,
};

"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("./premium");
const { baseEmbed, dangerEmbed, COLORS } = require("./embeds");

/** Builds the LFG post embed + its "Join Group"/"Mark Filled" buttons, shared by the origin post and every mirrored copy. Participant count is real (database/db.js's lfg_participants, the same table the website's join route writes to), not a static "needed" number - reflects an actual website join as soon as this message is next re-rendered. */
function buildLfgMessage(post, originGuildName) {
  const count = db.getLfgParticipantCount(post.id);
  const embed = baseEmbed(COLORS.brand)
    .setTitle(`[ LFG ] ${count}/${post.players_needed} player${post.players_needed === 1 ? "" : "s"}`)
    .setDescription(post.description)
    .addFields({ name: "Posted by", value: `<@${post.user_id}>`, inline: true }, { name: "From", value: originGuildName, inline: true })
    .setFooter({ text: "Expires 1 hour after posting" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lfg:join:${post.id}`).setLabel("Join Group").setStyle(ButtonStyle.Primary).setEmoji("🤝"),
    new ButtonBuilder().setCustomId(`lfg:fill:${post.id}`).setLabel("Mark Filled").setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Every LFG post gets its own temporary group-chat thread per guild it's
 * posted into (threads can't span guilds, so a mirrored post gets one per
 * server) - this is "the gather": created automatically the moment the post
 * goes out, not a separate step. "Join Group" just adds the clicking user
 * to it. Public thread (not private) so anyone who can see the feed
 * channel can already read it - membership is just for the ping/roster.
 */
async function startLfgThread(message, post) {
  try {
    const thread = await message.startThread({
      name: `LFG: ${post.description.slice(0, 80)}`,
      autoArchiveDuration: 60,
      reason: "KOBA Bot LFG group chat",
    });
    await thread.members.add(post.user_id).catch(() => {});
    return thread;
  } catch (err) {
    console.warn("[KOBA Bot] LFG thread creation failed:", err.message);
    return null;
  }
}

/**
 * Actually posts an already-created lfg_posts row into Discord (origin
 * guild's feed channel + thread, plus every global-scope mirror) - the
 * part of the flow that needs a live discord.js Client, split out from
 * post creation itself specifically so the website (a separate Passenger
 * process with zero Discord client access, sharing only the SQLite file -
 * see admin/server.js's header comment) can create the DB row directly via
 * db.createLfgPost() and let the bot's own background tick
 * (runLfgWebDeliveryTick) pick it up and deliver it moments later, with no
 * cross-process RPC/webhook needed. Discord's own /create-lfg flow still
 * calls this synchronously right after creating the row (below), so a
 * Discord-originated post appears instantly same as before - only a
 * website-originated one has the few-seconds tick delay.
 */
async function deliverLfgPost(client, post) {
  const meta = db.getGuildMeta(post.guild_id);
  const feedChannelId = meta?.lfg_feed_channel_id;
  if (!feedChannelId) return { delivered: false, reason: "no_feed_channel" };

  // Guild objects populate into the cache progressively right after a bot
  // restart - fall back to a fresh REST fetch instead of crashing on a null.
  const guild = client.guilds.cache.get(post.guild_id) ?? (await client.guilds.fetch(post.guild_id).catch(() => null));
  if (!guild) return { delivered: false, reason: "guild_unavailable" };

  const feedChannel = await guild.channels.fetch(feedChannelId).catch(() => null);
  if (!feedChannel) return { delivered: false, reason: "channel_missing" };

  const payload = buildLfgMessage(post, guild.name);
  const originMessage = await feedChannel.send(payload).catch(() => null);
  if (!originMessage) return { delivered: false, reason: "send_failed" };

  const thread = await startLfgThread(originMessage, post);
  db.addLfgBroadcast(post.id, post.guild_id, feedChannel.id, originMessage.id, thread?.id || null);

  let mirroredCount = 0;
  if (db.getLfgScope(post.guild_id) === "global") {
    const targetGuildIds = db.listGlobalLfgGuildIds(post.guild_id);
    for (const targetGuildId of targetGuildIds) {
      try {
        const targetGuild = client.guilds.cache.get(targetGuildId) ?? (await client.guilds.fetch(targetGuildId).catch(() => null));
        if (!targetGuild) continue;
        const targetMeta = db.getGuildMeta(targetGuildId);
        if (!targetMeta?.lfg_feed_channel_id) continue;
        const targetChannel = await targetGuild.channels.fetch(targetMeta.lfg_feed_channel_id).catch(() => null);
        if (!targetChannel) continue;

        const mirrorMessage = await targetChannel.send(payload).catch(() => null);
        if (mirrorMessage) {
          const mirrorThread = await startLfgThread(mirrorMessage, post);
          db.addLfgBroadcast(post.id, targetGuildId, targetChannel.id, mirrorMessage.id, mirrorThread?.id || null);
          mirroredCount++;
        }
      } catch (err) {
        console.warn(`[KOBA Bot] LFG mirror to guild ${targetGuildId} failed:`, err.message);
      }
    }
  }

  return { delivered: true, feedChannel, mirroredCount };
}

/** Shared by /create-lfg and the "Create LFG Post" panel button/modal. `interaction` must already be deferred (ephemeral). */
async function createLfgPostFromInteraction(interaction, description, playersNeeded) {
  const meta = db.getGuildMeta(interaction.guildId);
  if (!meta?.lfg_feed_channel_id) {
    await interaction.editReply({ embeds: [dangerEmbed("No LFG Feed Channel", "This server doesn't have an LFG feed channel yet - ask an admin to run `/template setup`.")] });
    return;
  }

  const post = db.createLfgPost(interaction.guildId, interaction.user.id, description, playersNeeded);
  const result = await deliverLfgPost(interaction.client, post);

  if (!result.delivered) {
    const messages = {
      guild_unavailable: "KOBA Bot just restarted and hasn't fully synced yet - try again in a few seconds.",
      channel_missing: "This server's configured LFG feed channel no longer exists - ask an admin to re-run `/template setup`.",
      send_failed: "Something went wrong posting to the feed channel - try again.",
    };
    await interaction.editReply({ embeds: [dangerEmbed("Couldn't Post", messages[result.reason] || "Something went wrong.")] });
    return;
  }

  const mirrorNote = result.mirroredCount > 0 ? ` It also mirrored to **${result.mirroredCount}** other global server${result.mirroredCount === 1 ? "" : "s"}.` : "";
  await interaction.editReply({ embeds: [baseEmbed(COLORS.success).setTitle("[ OK ] LFG Post Created").setDescription(`Posted to ${result.feedChannel} with its own group chat thread.${mirrorNote} It expires in 1 hour.`)] });
}

/** Background-loop tick: delivers any lfg_posts row that's never been broadcast anywhere yet - in practice this only ever catches website-created posts, since Discord's own /create-lfg path delivers synchronously above. Cheap DB scan, safe to run often. */
async function runLfgWebDeliveryTick(client) {
  for (const post of db.listPendingLfgDeliveries()) {
    await deliverLfgPost(client, post).catch((err) => console.error(`[KOBA Bot] LFG web-post delivery failed for post ${post.id}:`, err));
  }
}

// postId -> participant count as of the last time its Discord embed(s) were
// rendered - lets the sync tick below skip a Discord API round-trip for
// every open post on every tick, only actually re-editing a message when
// something (almost always a website-side join, since a Discord-side join
// already refreshes immediately in handleJoinButton) changed the count.
const lastRenderedCount = new Map();

/**
 * Background-loop tick: catches a WEBSITE join updating a post's real-time
 * Discord display (spec section 10/29 - "if the player joins through the
 * website, Discord must update... where technically practical"). The
 * website process has no live Discord client (see deliverLfgPost's header
 * comment on the same constraint for post creation), so this periodic
 * sweep is the mechanism, same architecture as the existing web-delivery
 * tick above rather than a new infrastructure layer (no websockets/queue
 * introduced, exactly per the spec's own instruction not to add one).
 */
async function runLfgParticipantSyncTick(client) {
  for (const post of db.listOpenLfgPostsWithBroadcasts()) {
    const count = db.getLfgParticipantCount(post.id);
    if (lastRenderedCount.get(post.id) === count) continue;
    lastRenderedCount.set(post.id, count);
    await refreshLfgBroadcasts(client, post).catch((err) => console.error(`[KOBA Bot] LFG participant sync failed for post ${post.id}:`, err));
  }
  // Forget closed posts so the map doesn't grow forever - matches every open post still tracked.
  const openIds = new Set(db.listOpenLfgPostsWithBroadcasts().map((p) => p.id));
  for (const id of lastRenderedCount.keys()) if (!openIds.has(id)) lastRenderedCount.delete(id);
}

function buildCreateModal() {
  const modal = new ModalBuilder().setCustomId("lfg:create_modal").setTitle("Create LFG Post");
  const descriptionInput = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("What are you looking for?")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(300)
    .setRequired(true)
    .setPlaceholder('e.g. "Raiding tonight, need 2 more"');
  const playersInput = new TextInputBuilder()
    .setCustomId("players_needed")
    .setLabel("How many players do you need?")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("e.g. 2");
  modal.addComponents(new ActionRowBuilder().addComponents(descriptionInput), new ActionRowBuilder().addComponents(playersInput));
  return modal;
}

/** Button/modal handlers for the #create-lfg panel and the "Join Group"/"Mark Filled" buttons on posted LFG cards. */
async function handleComponent(interaction) {
  if (!interaction.isButton()) return;
  const [, action, postIdRaw] = interaction.customId.split(":");

  if (action === "open") {
    if (!(await requirePremiumOwner(interaction))) return;
    await interaction.showModal(buildCreateModal());
    return;
  }

  if (action === "join") {
    await handleJoinButton(interaction, Number(postIdRaw));
    return;
  }

  if (action === "fill") {
    await handleFillButton(interaction, Number(postIdRaw));
    return;
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== "lfg:create_modal") return;
  await interaction.deferReply({ ephemeral: true });
  if (!(await requirePremiumOwner(interaction))) return;

  const description = interaction.fields.getTextInputValue("description").trim();
  const playersNeeded = parseInt(interaction.fields.getTextInputValue("players_needed").trim(), 10);
  if (!Number.isInteger(playersNeeded) || playersNeeded < 1 || playersNeeded > 50) {
    await interaction.editReply({ embeds: [dangerEmbed("Invalid Number", "Enter a whole number between 1 and 50 for players needed.")] });
    return;
  }

  await createLfgPostFromInteraction(interaction, description, playersNeeded);
}

/** "Join Group" - adds the clicking user to that guild's own thread for this post (never a different server's, per getLfgBroadcastForGuild). */
async function handleJoinButton(interaction, postId) {
  await interaction.deferReply({ ephemeral: true });

  // The ONE join path (database/db.js's joinLfgPost) - the exact same
  // function the website's /dashboard/lfg/:id/join route calls, so a
  // Discord join and a website join can never both slip past a full group
  // or double-count the same player (spec: "duplicate participation is
  // impossible", "full LFG cannot accept another player").
  const result = db.joinLfgPost(postId, interaction.user.id);
  const FAILURE_MESSAGES = {
    not_found: "This LFG post no longer exists.",
    not_open: "This LFG post has been filled, expired, or no longer exists.",
    expired: "This LFG post has expired.",
    own_post: "You can't join your own LFG post.",
    already_joined: "You've already joined this group.",
    full: "This group is already full.",
  };
  if (!result.ok) {
    await interaction.editReply({ embeds: [dangerEmbed("Can't Join", FAILURE_MESSAGES[result.reason] || "Something went wrong.")] });
    return;
  }

  if (result.justFilled) {
    await closeLfgPost(interaction.client, postId, "FILLED");
  } else {
    await refreshLfgBroadcasts(interaction.client, db.getLfgPost(postId));
  }

  const broadcast = db.getLfgBroadcastForGuild(postId, interaction.guildId);
  const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
  const thread = broadcast?.thread_id && guild ? await guild.channels.fetch(broadcast.thread_id).catch(() => null) : null;
  if (thread) await thread.members.add(interaction.user.id).catch(() => {});

  const countLine = `${result.count}/${result.needed}${result.justFilled ? " - full!" : ""}`;
  await interaction.editReply({ content: thread ? `You're in (${countLine}) - ${thread}` : `You're in (${countLine}).` });
}

/**
 * "Mark Filled" button on an LFG post. Only the original poster can fill it
 * (same pattern as ticket/team ownership checks elsewhere). Edits every
 * mirrored copy across every guild it was broadcast to, not just the one
 * the button was clicked in - that's the whole point of lfg_broadcasts.
 */
async function handleFillButton(interaction, postId) {
  await interaction.deferReply({ ephemeral: true });

  const post = db.getLfgPost(postId);
  if (!post) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Found", "This LFG post no longer exists.")] });
    return;
  }

  if (post.user_id !== interaction.user.id) {
    await interaction.editReply({ embeds: [dangerEmbed("Not Your Post", "Only the person who posted this LFG request can mark it filled.")] });
    return;
  }

  if (post.status !== "open") {
    await interaction.editReply({ content: "This post is no longer open." });
    return;
  }

  db.markLfgPostFilled(postId);
  await closeLfgPost(interaction.client, postId, "FILLED");
  await interaction.editReply({ content: "Marked filled - every posted copy has been updated and its group chat archived." });
}

/**
 * Shared "close this post everywhere" logic used by both Mark Filled and
 * the 1h auto-expiry tick - edits every broadcast's message (disabled
 * buttons, [FILLED]/[EXPIRED] title) and archives its thread.
 */
/**
 * Re-renders every broadcast's message with the current participant count -
 * only touches the title (same targeted-edit approach as closeLfgPost
 * below, which only rewrites the title's [ LABEL ] prefix), leaving the
 * rest of the original embed (description/fields/footer) untouched. Used
 * both right after a Discord-side join (immediate) and by the background
 * tick below (for a website-side join, which has no live Discord client to
 * update from directly - see runLfgWebDeliveryTick's own comment for why
 * that's an inherent limitation of the website's process, not a bug).
 */
async function refreshLfgBroadcasts(client, post) {
  const count = db.getLfgParticipantCount(post.id);
  const newTitle = `[ LFG ] ${count}/${post.players_needed} player${post.players_needed === 1 ? "" : "s"}`;
  for (const broadcast of db.listLfgBroadcasts(post.id)) {
    try {
      const guild = await client.guilds.fetch(broadcast.guild_id).catch(() => null);
      if (!guild) continue;
      const channel = await guild.channels.fetch(broadcast.channel_id).catch(() => null);
      if (!channel) continue;
      const message = await channel.messages.fetch(broadcast.message_id).catch(() => null);
      const embed = message?.embeds[0];
      if (embed) await message.edit({ embeds: [{ ...embed.data, title: newTitle }] }).catch(() => {});
    } catch (err) {
      console.warn(`[KOBA Bot] LFG participant-count refresh to guild ${broadcast.guild_id} failed:`, err.message);
    }
  }
}

async function closeLfgPost(client, postId, label) {
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lfg:join:${postId}`).setLabel("Join Group").setStyle(ButtonStyle.Primary).setEmoji("🤝").setDisabled(true),
    new ButtonBuilder().setCustomId(`lfg:fill:${postId}`).setLabel(label === "FILLED" ? "Filled" : "Expired").setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  for (const broadcast of db.listLfgBroadcasts(postId)) {
    try {
      const guild = await client.guilds.fetch(broadcast.guild_id).catch(() => null);
      if (!guild) continue;
      const channel = await guild.channels.fetch(broadcast.channel_id).catch(() => null);
      if (!channel) continue;
      const message = await channel.messages.fetch(broadcast.message_id).catch(() => null);
      if (message) {
        const embed = message.embeds[0];
        const closedEmbed = embed ? { ...embed.data, title: `[ ${label} ] ${embed.data.title?.replace(/^\[ LFG \] /, "") || "LFG Post"}` } : null;
        await message.edit({ embeds: closedEmbed ? [closedEmbed] : message.embeds, components: [disabledRow] }).catch(() => {});
      }

      if (broadcast.thread_id) {
        const thread = await guild.channels.fetch(broadcast.thread_id).catch(() => null);
        if (thread) await thread.setArchived(true, `LFG post ${label.toLowerCase()}`).catch(() => {});
      }
    } catch (err) {
      console.warn(`[KOBA Bot] LFG close-sync (${label}) to guild ${broadcast.guild_id} failed:`, err.message);
    }
  }
}

/** Background-loop tick: closes any post whose 1h lifetime has elapsed but was never manually filled. */
async function runLfgExpiryTick(client) {
  for (const post of db.listExpiredLfgPosts()) {
    db.markLfgPostExpired(post.id);
    await closeLfgPost(client, post.id, "EXPIRED").catch((err) => console.error(`[KOBA Bot] LFG expiry close failed for post ${post.id}:`, err));
  }
}

module.exports = { handleComponent, handleModal, createLfgPostFromInteraction, buildLfgMessage, runLfgExpiryTick, runLfgWebDeliveryTick, runLfgParticipantSyncTick, deliverLfgPost };

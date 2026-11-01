"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { hasAdminClearance } = require("./teamAuth");
const { logAdminAction } = require("./adminFeed");
const { infoEmbed, successEmbed, dangerEmbed, warningEmbed } = require("./embeds");

/** Posted once via /staff-config post - "Apply Now" panel, one button leading into a position picker. */
function buildApplyPanel(guildId) {
  const positions = db.listEnabledStaffPositions(guildId);
  const embed = infoEmbed(
    "📋 Staff Applications",
    positions.length ? `We're currently looking for: ${positions.map((p) => `**${p.position_name}**`).join(", ")}.\n\nClick below to apply.` : "No positions are open right now - check back later."
  );
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("staffapp:apply").setLabel("Apply Now").setStyle(ButtonStyle.Success).setDisabled(!positions.length).setEmoji("📋"));
  return { embeds: [embed], components: [row] };
}

function questionModal(positionName, position) {
  const modal = new ModalBuilder().setCustomId(`staffapp:submit:${positionName}`).setTitle(`Apply - ${positionName}`.slice(0, 45));
  const rows = position.questions.map((q, i) =>
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))
  );
  if (position.require_social) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("social").setLabel("Your social links (required)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)
      )
    );
  }
  modal.addComponents(...rows.slice(0, 5)); // Discord's hard modal cap - enforced again at /staff-config set time
  return modal;
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  if (id === "staffapp:apply") {
    const positions = db.listEnabledStaffPositions(interaction.guildId);
    if (!positions.length) {
      await interaction.reply({ embeds: [dangerEmbed("Nothing Open", "No positions are open right now.")], ephemeral: true });
      return;
    }
    if (positions.length === 1) {
      const position = positions[0];
      if (db.hasPendingApplication(interaction.guildId, position.position_name, interaction.user.id)) {
        await interaction.reply({ embeds: [warningEmbed("Already Applied", `You already have a pending application for **${position.position_name}**.`)], ephemeral: true });
        return;
      }
      await interaction.showModal(questionModal(position.position_name, position));
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("staffapp:pick_position")
      .setPlaceholder("Which position?")
      .addOptions(positions.map((p) => ({ label: p.position_name, value: p.position_name })));
    await interaction.reply({ embeds: [infoEmbed("Apply For Staff", "Pick a position.")], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    return;
  }

  if (id === "staffapp:pick_position") {
    const positionName = interaction.values[0];
    const position = db.getStaffPosition(interaction.guildId, positionName);
    if (!position?.enabled) {
      await interaction.update({ embeds: [dangerEmbed("No Longer Open", `**${positionName}** isn't accepting applications anymore.`)], components: [] });
      return;
    }
    if (db.hasPendingApplication(interaction.guildId, positionName, interaction.user.id)) {
      await interaction.update({ embeds: [warningEmbed("Already Applied", `You already have a pending application for **${positionName}**.`)], components: [] });
      return;
    }
    await interaction.showModal(questionModal(positionName, position));
    return;
  }

  if (id.startsWith("staffapp:review:")) {
    if (!hasAdminClearance(interaction)) {
      await interaction.reply({ embeds: [dangerEmbed("Access Denied", "This is restricted to KOBA Bot Admins.")], ephemeral: true });
      return;
    }
    const [, , decision, appIdRaw] = id.split(":");
    const appId = Number(appIdRaw);
    const application = db.getStaffApplication(appId);
    if (!application || application.status !== "pending") {
      await interaction.reply({ embeds: [warningEmbed("Already Reviewed", "This application was already decided.")], ephemeral: true });
      return;
    }

    await interaction.deferUpdate();
    db.setStaffApplicationStatus(appId, decision, interaction.user.id);

    // interaction.guild can be null right after the bot restarts (guild
    // objects populate into the cache progressively) - fall back to a
    // fresh REST fetch instead of crashing on .members/.name of null.
    const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));

    if (decision === "accepted" && guild) {
      const position = db.getStaffPosition(interaction.guildId, application.position_name);
      if (position?.role_id) {
        const member = await guild.members.fetch(application.applicant_id).catch(() => null);
        if (member) await member.roles.add(position.role_id, `Staff application accepted by ${interaction.user.tag}`).catch(() => {});
      }
    }

    const applicant = await interaction.client.users.fetch(application.applicant_id).catch(() => null);
    if (applicant) {
      const guildName = guild?.name || "the server";
      await applicant
        .send({
          embeds: [
            decision === "accepted"
              ? successEmbed("Application Accepted", `Congratulations! Your **${application.position_name}** application for **${guildName}** was accepted.`)
              : dangerEmbed("Application Update", `Your **${application.position_name}** application for **${guildName}** was not accepted this time.`),
          ],
        })
        .catch(() => {}); // DMs closed - not fatal, the decision is still recorded
    }

    if (guild) await logAdminAction(guild, {
      title: `Staff Application ${decision === "accepted" ? "Accepted" : "Rejected"}`,
      description: `**Position:** ${application.position_name}\n**Applicant:** <@${application.applicant_id}>\n**Reviewed by:** ${interaction.user.username}`,
    });

    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = originalEmbed
      ? { ...originalEmbed.toJSON(), title: `${originalEmbed.title} - ${decision === "accepted" ? "✅ ACCEPTED" : "❌ REJECTED"}`, color: decision === "accepted" ? 0x2ecc71 : 0xe74c3c }
      : null;
    await interaction.editReply({ embeds: updatedEmbed ? [updatedEmbed] : [], components: [] }).catch(() => {});
    return;
  }
}

async function handleModal(interaction) {
  if (!interaction.customId.startsWith("staffapp:submit:")) return;

  await interaction.deferReply({ ephemeral: true });

  const positionName = interaction.customId.split(":").slice(2).join(":");
  const position = db.getStaffPosition(interaction.guildId, positionName);
  if (!position?.enabled) {
    await interaction.editReply({ embeds: [dangerEmbed("No Longer Open", `**${positionName}** isn't accepting applications anymore.`)] });
    return;
  }

  const answers = position.questions.map((q, i) => ({ question: q, answer: interaction.fields.getTextInputValue(`q${i}`) }));
  const socialLinks = position.require_social ? interaction.fields.getTextInputValue("social") : null;

  const application = db.createStaffApplication(interaction.guildId, positionName, interaction.user.id, answers, socialLinks);

  const meta = db.getGuildMeta(interaction.guildId);
  const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
  const reviewChannel = meta?.staff_apps_channel_id && guild ? await guild.channels.fetch(meta.staff_apps_channel_id).catch(() => null) : null;

  if (reviewChannel) {
    const lines = answers.map((a, i) => `**${i + 1}. ${a.question}**\n${a.answer}`);
    if (socialLinks) lines.push(`**Social Links**\n${socialLinks}`);
    const embed = infoEmbed(`Application: ${positionName}`, `**Applicant:** ${interaction.user.tag}\n\n${lines.join("\n\n")}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`staffapp:review:accepted:${application.id}`).setLabel("✅ Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`staffapp:review:rejected:${application.id}`).setLabel("❌ Reject").setStyle(ButtonStyle.Danger)
    );
    await reviewChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
  }

  await interaction.editReply({ embeds: [successEmbed("Application Submitted", `Your **${positionName}** application was submitted${reviewChannel ? "" : " (note: no review channel is configured yet, an admin should set one up)"}.`)] });
}

module.exports = { buildApplyPanel, handleComponent, handleModal };

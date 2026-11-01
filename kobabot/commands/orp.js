"use strict";

/**
 * ORP ("ZORP"-style Offline Raid Protection) - KOBABOT_FULL_ROADMAP.md
 * Category 1/4, Phase 2's flagged biggest competitive gap. One zone PER
 * TEAM (see schema.sql's orp_zones header) - register captures the
 * caller's live position via `server.printpos` and deploys a real
 * zones.createcustomzone marker; the background tick
 * (utils/orpZones.js's runOrpTick) flips its color/chat message between a
 * neutral "online" look and a red "offline/protected" warning depending on
 * whether any of the team's linked members are currently connected.
 *
 * Not plan-gated beyond requirePremiumOwner - config/planTiers.js's header
 * explicitly states Basic already gets full "Rust integration, teams,
 * events" functionality with Pro/Max being feature-identical to Basic, and
 * ORP is squarely a Rust-integration/team feature, not a Pro-exclusive one.
 *
 * Register/remove are restricted to the team LEADER only (Corporal/Fireteam
 * Leader clearance or higher - utils/teamAuth.js's hasLeadershipClearance,
 * the exact same check utils/teamPanel.js already uses for invite/kick/
 * promote/demote), not any team member - a shared zone shouldn't be
 * movable/removable by every roster member. The leader also has to be the
 * one with a linked gamertag (not just "someone on the team"), since
 * register captures the CALLER's own live position.
 */

const { SlashCommandBuilder } = require("discord.js");
const db = require("../database/db");
const { requirePremiumOwner } = require("../utils/premium");
const { hasLeadershipClearance } = require("../utils/teamAuth");
const { registerOrpZone, removeOrpZone } = require("../utils/orpZones");
const { successEmbed, infoEmbed, dangerEmbed, errorEmbed } = require("../utils/embeds");

const MIN_RADIUS = 10;
const MAX_RADIUS = 150;
const DEFAULT_RADIUS = 60;
const MIN_BOX_DIM = 10;
const MAX_BOX_DIM = 300;
const DEFAULT_BOX_DIM = 120;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("orp")
    .setDescription("ZORP-style Offline Raid Protection - register a protective zone around your team's base")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("register")
        .setDescription("Capture your current position and (re)register your team's ORP zone there - leader only")
        .addIntegerOption((opt) => opt.setName("radius").setDescription(`Sphere radius in meters (${MIN_RADIUS}-${MAX_RADIUS}, default ${DEFAULT_RADIUS}) - only used if this server's ORP shape is Sphere`))
        .addIntegerOption((opt) => opt.setName("box_width").setDescription(`Box width in meters (${MIN_BOX_DIM}-${MAX_BOX_DIM}, default ${DEFAULT_BOX_DIM}) - only used if this server's ORP shape is Box`))
        .addIntegerOption((opt) => opt.setName("box_height").setDescription(`Box height in meters (${MIN_BOX_DIM}-${MAX_BOX_DIM}, default ${DEFAULT_BOX_DIM}) - only used if this server's ORP shape is Box`))
        .addIntegerOption((opt) => opt.setName("box_length").setDescription(`Box length in meters (${MIN_BOX_DIM}-${MAX_BOX_DIM}, default ${DEFAULT_BOX_DIM}) - only used if this server's ORP shape is Box`))
    )
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove your team's ORP zone - leader only"))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show your team's current ORP zone and protection state")),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requirePremiumOwner(interaction))) return;

    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    try {
      const member = db.getMember(guildId, interaction.user.id);
      if (!member?.team_name) {
        await interaction.editReply({ embeds: [dangerEmbed("No Team", "You need to be on a team (`/team create` or accept an invite) before registering an ORP zone - it's shared by your whole roster.")] });
        return;
      }

      if (subcommand === "register" || subcommand === "remove") {
        if (!hasLeadershipClearance(interaction, member)) {
          await interaction.editReply({ embeds: [dangerEmbed("Access Denied", "You need Corporal (Fireteam Leader) clearance or higher on your team to manage its ORP zone.")] });
          return;
        }
        if (!member.gamertag) {
          await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first so KOBA Bot knows which in-game character you are.")] });
          return;
        }
      }

      if (subcommand === "register") {
        const meta = db.getGuildMeta(guildId);
        const shape = meta?.orp_shape === "Box" ? "Box" : "Sphere";

        let radius = interaction.options.getInteger("radius") ?? DEFAULT_RADIUS;
        radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));

        const clampBoxDim = (value) => Math.min(MAX_BOX_DIM, Math.max(MIN_BOX_DIM, value ?? DEFAULT_BOX_DIM));
        const boxWidth = clampBoxDim(interaction.options.getInteger("box_width"));
        const boxHeight = clampBoxDim(interaction.options.getInteger("box_height"));
        const boxLength = clampBoxDim(interaction.options.getInteger("box_length"));

        const result = await registerOrpZone(interaction.guild, {
          teamName: member.team_name,
          gamertag: member.gamertag,
          radius,
          boxWidth,
          boxHeight,
          boxLength,
          createdBy: interaction.user.id,
        });

        if (!result.ok) {
          await interaction.editReply({ embeds: [dangerEmbed("Couldn't Locate You", "You need to be online and in-game to register an ORP zone here.")] });
          return;
        }

        const sizeText = shape === "Box" ? `${boxWidth}x${boxHeight}x${boxLength}m box` : `${radius}m radius sphere`;
        await interaction.editReply({
          embeds: [
            successEmbed(
              "🟢 ORP Zone Registered",
              `**${member.team_name}**'s ORP zone is now live at \`${result.zone.center_x}, ${result.zone.center_y}, ${result.zone.center_z}\` (${sizeText}).\n\n` +
                `While anyone on your team is online, the zone stays in its normal/online look. Once your whole roster goes offline, KOBA Bot automatically flags it **protected** (and re-colors it) until someone's back.`
            ),
          ],
        });
        return;
      }

      if (subcommand === "remove") {
        const result = await removeOrpZone(interaction.guild, member.team_name);
        if (!result.ok) {
          await interaction.editReply({ embeds: [dangerEmbed("Not Registered", "Your team doesn't have an ORP zone registered.")] });
          return;
        }
        await interaction.editReply({ embeds: [successEmbed("ORP Zone Removed", `**${member.team_name}**'s ORP zone (\`${result.zone.zone_name}\`) has been removed.`)] });
        return;
      }

      if (subcommand === "status") {
        const zone = db.getOrpZone(guildId, member.team_name);
        if (!zone) {
          await interaction.editReply({ embeds: [infoEmbed("No ORP Zone", "Your team hasn't registered an ORP zone yet - use `/orp register` at your base.")] });
          return;
        }
        const stateLabel = zone.state === "protected" ? "🔴 Protected (team offline)" : "🟢 Online (unprotected)";
        const sizeLabel = zone.shape === "Box" ? `${zone.box_width}x${zone.box_height}x${zone.box_length}m box` : `${zone.radius}m radius sphere`;
        await interaction.editReply({
          embeds: [
            infoEmbed(
              `ORP Zone - ${member.team_name}`,
              `**State:** ${stateLabel}\n**Zone:** \`${zone.zone_name}\`\n**Location:** \`${zone.center_x}, ${zone.center_y}, ${zone.center_z}\`\n**Shape/Size:** ${sizeLabel}\n**Last updated:** <t:${Math.floor(zone.updated_at / 1000)}:R>`
            ),
          ],
        });
        return;
      }
    } catch (error) {
      console.error(`Error executing /orp ${subcommand}:`, error);
      await interaction.editReply({ embeds: [errorEmbed("ORP Error", error.message || "Failed to run that ORP action.")] });
    }
  },
};

"use strict";

/**
 * Tier classification for /commands (added 2026-09-07).
 * Most commands are classified automatically from signals already on the
 * command definition: `devOnly`, the Discord permission bit
 * (Administrator/Manage Server), and the "[Tag]" convention this codebase
 * already uses at the front of restricted descriptions ("[Restricted]",
 * "[Admin]", "[Bot Owner]", "[Dev Only]").
 *
 * A handful of commands are gated by custom in-code checks buried in a
 * component handler rather than on the command definition itself
 * (hasAdminClearance/requireManageGuild/isBotOwner deep in
 * utils/*Panel.js), which static inspection of the command file can't see.
 * List those here so they land in the right tier anyway. If a future
 * command's real restriction can't be read off its setDefaultMemberPermissions
 * or description text, add it here rather than relying on the automatic path.
 */
const TIER_OVERRIDES = {
  // ban/unban (merged 2026-09-08 from guild-ban/global-ban and
  // guild-unban/global-unban - see commands/ban.js's header) mix two real
  // gating levels in one command now (hasAdminClearance() for the "server"
  // subcommand, isBotOwner() for "global") - classification is per whole
  // command, not per-subcommand, so "staff" here means "at least SOME of
  // this command's functionality (the server-scoped half) is usable at
  // staff clearance", not that every subcommand is. The "global" half still
  // enforces its own isBotOwner() check in-handler regardless of this tier.
  ban: "staff",
  unban: "staff",
};

const TIER_LABELS = {
  player: "🎮 Player Commands",
  staff: "🛡️ Staff Commands",
  owner: "👑 Bot Owner Commands",
};

const ADMINISTRATOR_BIT = 8n;
const MANAGE_GUILD_BIT = 32n;

/** Classifies one loaded command module (client.commands entry) into "player" | "staff" | "owner". */
function classifyCommand(command) {
  const override = TIER_OVERRIDES[command.data.name];
  if (override) return override;
  if (command.devOnly) return "owner";

  const json = command.data.toJSON();
  const desc = json.description || "";
  if (desc.startsWith("[Bot Owner]") || desc.startsWith("[Dev Only]")) return "owner";

  const perms = json.default_member_permissions;
  const isAdmin = perms != null && (BigInt(perms) & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT;
  const isManageGuild = perms != null && (BigInt(perms) & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
  const restrictedText = desc.startsWith("[Restricted]") || desc.startsWith("[Admin]") || desc.startsWith("DANGER");
  if (isAdmin || isManageGuild || restrictedText) return "staff";

  return "player";
}

module.exports = { classifyCommand, TIER_LABELS, TIER_OVERRIDES };

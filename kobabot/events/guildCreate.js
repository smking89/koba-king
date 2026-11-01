"use strict";

const { Events } = require("discord.js");
const db = require("../database/db");
const { isGuildOwnerPremium, officialGuildIds } = require("../utils/premium");
const { infoEmbed } = require("../utils/embeds");

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    console.error(`[KOBA Bot] GuildCreate debug - joined guild ${guild.id} (${guild.name})`);
    // Cache the owner's username the moment KOBA Bot joins - they may never
    // run a command themselves, but a superadmin still needs to be able to
    // grant/revoke access by the username they'd actually recognize.
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) db.upsertKnownUser(owner.id, owner.user.username);

    // Install approval gate (2026-10-13, per explicit owner request) - a
    // Discord OAuth invite link can always be shared/leaked regardless of
    // what the landing page shows, so the real enforcement has to live
    // here, not just in hiding the link. Official guilds (the bot's own
    // support/dev servers) are exempt - everyone else needs a row in
    // approved_guilds (see /approve-guild) or the bot leaves immediately.
    //
    // CRITICAL FIX (same day): discord.js's `guildCreate` event does NOT
    // mean "just joined" - per the official docs it fires "whenever a guild
    // is created/joined, OR BECOMES AVAILABLE" - which includes every guild
    // the bot was ALREADY in, re-announced on every reconnect/restart as
    // the gateway re-syncs. The original version of this gate had no way to
    // tell "brand new, unapproved server" apart from "a server we've been
    // in for weeks, just reconnecting" - so it was leaving EVERY non-
    // official guild on EVERY bot restart, including ones the owner
    // explicitly wanted the bot in. `hasGuildInstallRecord` checks whether
    // this guild has ever been recorded before; only a guild with NO prior
    // record is treated as a real new join and subject to the gate.
    const isGenuinelyNewJoin = !db.hasGuildInstallRecord(guild.id);
    if (isGenuinelyNewJoin && !officialGuildIds().includes(guild.id) && !db.isGuildApproved(guild.id)) {
      const target =
        guild.systemChannel ||
        guild.channels.cache.find((c) => c.isTextBased?.() && c.permissionsFor(guild.members.me)?.has("SendMessages"));
      if (target) {
        await target
          .send({ embeds: [infoEmbed("Access Required", "KOBA Bot is invite-only right now - this server hasn't been approved yet. Apply at **koba.games** and the bot will rejoin once approved.")] })
          .catch(() => {});
      }
      if (owner) {
        await owner
          .send({ embeds: [infoEmbed("Access Required", `KOBA Bot hasn't approved **${guild.name}** yet. Apply at **koba.games** - once approved, re-invite the bot and it'll stay.`)] })
          .catch(() => {});
      }
      await guild.leave().catch((err) => console.error(`[KOBA Bot] Failed to leave unapproved guild ${guild.id}:`, err.message));
      return;
    }

    const premium = await isGuildOwnerPremium(guild);

    // Log the install regardless of premium status - this is the only
    // reliable "how many servers has KOBA Bot ever been added to" count.
    db.recordGuildInstall(guild.id, guild.name, guild.ownerId, guild.memberCount, premium);

    // FIXED (2026-09-19): this used to refuse to even welcome the guild
    // (posting "Premium Required" and returning) unless the owner already
    // had a paid Pro/Max license - locking KOBA Bot Basic ("Free Forever",
    // per website/src/components/PlanGrid.jsx) out at the very first step,
    // before the owner could even run /setup. Every guild - paid or not -
    // gets the same welcome now; premium/plan gating belongs on the
    // specific Pro/Max-only features, not on joining at all.

    // FIXED (2026-09-08): this used to auto-run provisionGuild() (creates
    // roles/channels/categories) + deploy the dashboard/ticket panel the
    // instant KOBA Bot joins, with zero action from the server owner. Per
    // owner request, KOBA Bot should touch nothing until the owner actually
    // asks it to - the identical provisioning now only happens when they
    // explicitly run /template setup or /template wizard (both consolidated
    // 2026-10-13 from the old standalone /setup and /setup-wizard commands).
    // Just point them at it here.
    const target =
      guild.systemChannel ||
      guild.channels.cache.find((c) => c.isTextBased?.() && c.permissionsFor(guild.members.me)?.has("SendMessages"));
    if (target) {
      await target
        .send({ embeds: [infoEmbed("Thanks for adding KOBA Bot!", "Run `/template setup` (or `/template wizard` for a guided walkthrough) whenever you're ready - KOBA Bot won't create any roles or channels until then.")] })
        .catch(() => {});
    }
  },
};

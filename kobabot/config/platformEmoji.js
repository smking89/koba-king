"use strict";

/**
 * Custom Discord emoji for the two Rust Console Edition platforms. Discord
 * role names can only render standard Unicode emoji (not custom guild
 * emoji), so config/templates.js keeps 🎮 on the Xbox/PlayStation roles -
 * that's a Discord API limitation, not a style choice. These are for
 * anywhere that CAN render custom emoji instead: select-menu options and
 * embed text - namely the platform picker on /link (gamertag verification,
 * still unbuilt - tracked as feature #7 on the master list) once it exists.
 */
const PLATFORM_EMOJI = {
  xbox: { id: "1544113320511013016", name: "xbox" },
  playstation: { id: "1544113752712945726", name: "playstation" },
};

/** <:name:id> markdown tags, for embed/message text. */
const PLATFORM_EMOJI_TAG = {
  xbox: `<:${PLATFORM_EMOJI.xbox.name}:${PLATFORM_EMOJI.xbox.id}>`,
  playstation: `<:${PLATFORM_EMOJI.playstation.name}:${PLATFORM_EMOJI.playstation.id}>`,
};

module.exports = { PLATFORM_EMOJI, PLATFORM_EMOJI_TAG };

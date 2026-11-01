"use strict";

/** Feature 5 - raw crafting material types tracked per team. */
const MATERIAL_FIELDS = ["sulfur_cores", "emp_capacitors", "uranium_rods", "blueprints"];

const MATERIAL_LABELS = {
  sulfur_cores: "Sulfur Cores",
  emp_capacitors: "EMP Capacitors",
  uranium_rods: "Uranium Rods",
  blueprints: "Blueprints",
};

/** Icon filenames under assets/icons/ - served at /game-icons/<file> on the public site. */
const MATERIAL_ICONS = {
  sulfur_cores: "sulfur-cores.png",
  emp_capacitors: "emp-capacitors.png",
  uranium_rods: "uranium-rods.png",
  blueprints: "blueprints.png",
};

// Plain Unicode emoji - always renders everywhere, unlike a custom Discord
// emoji <:name:id> tag, which only renders if that exact emoji ID still
// exists AND the bot has access to it (custom emoji tied to a specific
// server/upload - the earlier IDs here were never real uploaded emoji,
// which is why they showed up as raw ":name:" text instead of an icon).
// Slash-command choices (.addChoices() on /give-material, /create-event)
// can't render custom emoji at all regardless - that's a hard API
// limitation - so these are for embed/message text only either way.
const MATERIAL_EMOJI = {
  sulfur_cores: "🧪",
  emp_capacitors: "🔋",
  uranium_rods: "☢️",
  blueprints: "📜",
};

module.exports = { MATERIAL_FIELDS, MATERIAL_LABELS, MATERIAL_ICONS, MATERIAL_EMOJI };

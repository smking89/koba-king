"use strict";

/**
 * Delivers a shop cart to a player using a throwaway per-purchase kit -
 * the only confirmed way to hand a player raw items over RCON (see
 * schema.sql's shop_* header). Kit name is unique per purchase so concurrent
 * checkouts across different players never collide.
 *
 * Confirmed against RCE's official Kit Management docs (2026-09-01):
 *   kit add "KitName" "ItemName" Amount Condition Container
 *   kit givetoplayer "KitName" "PlayerName"
 *   kit delete "KitName"
 * "Condition" and "Container" args are best-guess defaults (1 = full
 * condition, "Main" = main inventory) - not independently re-verified since
 * every prior kit built this session went through the in-game kit UI, not
 * `kit add` directly. Test one purchase via /rcon before trusting this live.
 */

const { getRcon } = require("../rcon/manager");

async function deliverCart(guildId, gamertag, lineItems, serverName) {
  const kitName = `shop_${gamertag.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`;
  const rcon = await getRcon(guildId, serverName);

  for (const { itemShortName, amount } of lineItems) {
    await rcon.send(`kit add "${kitName}" "${itemShortName}" ${amount} 1 Main`);
  }
  await rcon.send(`kit givetoplayer "${kitName}" "${gamertag}"`);
  await rcon.send(`kit delete "${kitName}"`).catch(() => {}); // cleanup best-effort - a leaked one-off kit is harmless clutter, not a functional problem
}

module.exports = { deliverCart };

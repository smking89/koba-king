"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { registerClient, postErrorAlert } = require("./utils/botHealthAlerts");

if (!process.env.DISCORD_TOKEN) {
  console.error("[KOBA Bot] Missing DISCORD_TOKEN in .env - copy .env.example to .env and fill it in.");
  process.exit(1);
}

// Bot Health monitoring (2026-10-15) - a cascading failure (e.g. a bad DB
// migration) can throw many unhandled rejections in quick succession; this
// throttle keeps #error-alerts from being flooded while still always
// logging every single one to the console/pm2 log, which has no such limit.
let lastErrorAlertAt = 0;
const ERROR_ALERT_THROTTLE_MS = 10000;
function alertOnError(label, err) {
  console.error(`[KOBA Bot] ${label}:`, err);
  if (Date.now() - lastErrorAlertAt < ERROR_ALERT_THROTTLE_MS) return;
  lastErrorAlertAt = Date.now();
  postErrorAlert(`🚨 ${label}: \`${String(err?.message || err).slice(0, 500)}\``).catch(() => {});
}

// Background loops (Phase 6) and interaction handlers should never take the
// whole process down over one bad RCON response or a rejected promise
// nobody awaited - log and keep running instead.
process.on("unhandledRejection", (err) => alertOnError("Unhandled rejection", err));
process.on("uncaughtException", (err) => alertOnError("Uncaught exception", err));

const client = new Client({
  // MessageContent is a privileged intent - must also be toggled ON in the
  // Discord Developer Portal (Bot -> Privileged Gateway Intents) or every
  // message.content arrives empty regardless of what's requested here.
  // Added for Frank's keyword-FAQ watcher (events/messageCreate.js).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
registerClient(client);

// --- Slash commands ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  if (command && command.data && command.data.name) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[KOBA Bot] Skipping file ${file}: Missing valid data.name export structure.`);
  }
}

// --- Component/modal handlers, keyed by customId namespace (e.g. "kobabot:inventory" -> "kobabot") ---
const linkPanel = require("./utils/linkPanel");
const tickets = require("./utils/tickets");
const staffApplications = require("./utils/staffApplications");
const staffRecruitment = require("./utils/staffRecruitment");
const staffPanel = require("./utils/staffPanel");
const setupWizardPanel = require("./utils/setupWizardPanel");
require("./utils/rawBroadcastLogger"); // TEMPORARY - see that file's header, remove after the capture session

// FIXED (2026-11-01): these 32 modules each export a real, working
// handleComponent (and most, handleModal) but were never registered here -
// every button/select/modal they build was silently unreachable (the
// dispatcher's `if (handler) await handler(interaction)` just no-opped on
// a missing map entry, no error, no log). Confirmed the real customId
// prefix for each by reading its actual setCustomId calls, not guessing
// from the filename (several differ: cargoShipHeist -> "cargoheist",
// ticketJackpot -> "jackpot", shopPlayerPanel -> "shop", etc.). This was
// found while wiring up Treasure Slots' own registration and turned out to
// affect nearly every button-driven feature in the bot, including the
// Challenge/duel system - see utils/eventJoin.js separately, which is
// genuinely dead code (nothing requires it anywhere) and is deliberately
// NOT registered here.
const auctionPanel = require("./utils/auctionPanel");
const autoKitAdminPanel = require("./utils/autoKitAdminPanel");
const bradleyAmbush = require("./utils/bradleyAmbush");
const cargoShipHeist = require("./utils/cargoShipHeist");
const challengeEngine = require("./utils/challengeEngine");
const commandsHelpPanel = require("./utils/commandsHelpPanel");
const defuseWire = require("./utils/defuseWire");
const directoryPanel = require("./utils/directoryPanel");
const gamesPanel = require("./utils/gamesPanel");
const gameWagerCurrency = require("./utils/gameWagerCurrency");
const giftScheduler = require("./utils/giftScheduler");
const gridMinefield = require("./utils/gridMinefield");
const kitPanel = require("./utils/kitPanel");
const lfgPanel = require("./utils/lfgPanel");
const lootboxPanel = require("./utils/lootboxPanel");
const mainPanels = require("./utils/mainPanels");
const marketplacePanel = require("./utils/marketplacePanel");
const messageFeedPanel = require("./utils/messageFeedPanel");
const playerPanel = require("./utils/playerPanel");
const recyclerRoulette = require("./utils/recyclerRoulette");
const referralPanel = require("./utils/referralPanel");
const rivalSystem = require("./utils/rivalSystem");
const scrapMerchant = require("./utils/scrapMerchant");
const serversHub = require("./utils/serversHub");
const shopPanel = require("./utils/shopPanel");
const shopPlayerPanel = require("./utils/shopPlayerPanel");
const targetRange = require("./utils/targetRange");
const teamPanel = require("./utils/teamPanel");
const ticketJackpot = require("./utils/ticketJackpot");
const towerClimb = require("./utils/towerClimb");
const tradeConfigPanel = require("./utils/tradeConfigPanel");
const treasureSlots = require("./utils/treasureSlots");
const vaultHeist = require("./utils/vaultHeist");

client.componentHandlers = new Collection();
client.modalHandlers = new Collection();
client.componentHandlers.set("link", linkPanel.handleComponent);
// Ticket buttons use the "kobabot" customId prefix, a holdover from when
// utils/kobabotPanel.js (now removed - Detonation/War Room) also owned this
// namespace. Kept the same prefix (not renamed to "tickets") so already-
// posted/pinned ticket panel messages in live guilds keep working with no
// migration needed.
client.componentHandlers.set("kobabot", tickets.handleComponent);
client.componentHandlers.set("staffapp", staffApplications.handleComponent);
client.componentHandlers.set("staffpanel", staffPanel.handleComponent);
client.componentHandlers.set("staffrecruit", staffRecruitment.handleComponent);
client.componentHandlers.set("setupwizard", setupWizardPanel.handleComponent);
client.componentHandlers.set("auction", auctionPanel.handleComponent);
client.componentHandlers.set("autokit", autoKitAdminPanel.handleComponent);
client.componentHandlers.set("bradleyambush", bradleyAmbush.handleComponent);
client.componentHandlers.set("cargoheist", cargoShipHeist.handleComponent);
client.componentHandlers.set("challenge", challengeEngine.handleComponent);
client.componentHandlers.set("commandshelp", commandsHelpPanel.handleComponent);
client.componentHandlers.set("defusewire", defuseWire.handleComponent);
client.componentHandlers.set("directory", directoryPanel.handleComponent);
client.componentHandlers.set("gamespanel", gamesPanel.handleComponent);
client.componentHandlers.set("gamecurrency", gameWagerCurrency.handleComponent);
client.componentHandlers.set("gift", giftScheduler.handleComponent);
client.componentHandlers.set("gridmine", gridMinefield.handleComponent);
client.componentHandlers.set("kitpanel", kitPanel.handleComponent);
client.componentHandlers.set("lfg", lfgPanel.handleComponent);
client.componentHandlers.set("lootbox", lootboxPanel.handleComponent);
client.componentHandlers.set("mainpanel", mainPanels.handleComponent);
client.componentHandlers.set("marketplace", marketplacePanel.handleComponent);
client.componentHandlers.set("messagefeed", messageFeedPanel.handleComponent);
client.componentHandlers.set("playerpanel", playerPanel.handleComponent);
client.componentHandlers.set("recyclerroulette", recyclerRoulette.handleComponent);
client.componentHandlers.set("referral", referralPanel.handleComponent);
client.componentHandlers.set("rival", rivalSystem.handleComponent);
client.componentHandlers.set("scrapmerchant", scrapMerchant.handleComponent);
client.componentHandlers.set("servershub", serversHub.handleComponent);
client.componentHandlers.set("shoppanel", shopPanel.handleComponent);
client.componentHandlers.set("shop", shopPlayerPanel.handleComponent);
client.componentHandlers.set("targetrange", targetRange.handleComponent);
client.componentHandlers.set("teampanel", teamPanel.handleComponent);
client.componentHandlers.set("jackpot", ticketJackpot.handleComponent);
client.componentHandlers.set("towerclimb", towerClimb.handleComponent);
client.componentHandlers.set("tradeconfig", tradeConfigPanel.handleComponent);
client.componentHandlers.set("treasureslots", treasureSlots.handleComponent);
client.componentHandlers.set("vaultheist", vaultHeist.handleComponent);

client.modalHandlers.set("link", linkPanel.handleModal);
client.modalHandlers.set("kobabot", tickets.handleModal);
client.modalHandlers.set("staffapp", staffApplications.handleModal);
client.modalHandlers.set("staffrecruit", staffRecruitment.handleModal);
client.modalHandlers.set("auction", auctionPanel.handleModal);
client.modalHandlers.set("autokit", autoKitAdminPanel.handleModal);
client.modalHandlers.set("defusewire", defuseWire.handleModal);
client.modalHandlers.set("directory", directoryPanel.handleModal);
client.modalHandlers.set("gamespanel", gamesPanel.handleModal);
client.modalHandlers.set("gamecurrency", gameWagerCurrency.handleModal);
client.modalHandlers.set("gridmine", gridMinefield.handleModal);
client.modalHandlers.set("kitpanel", kitPanel.handleModal);
client.modalHandlers.set("lfg", lfgPanel.handleModal);
client.modalHandlers.set("mainpanel", mainPanels.handleModal);
client.modalHandlers.set("marketplace", marketplacePanel.handleModal);
client.modalHandlers.set("recyclerroulette", recyclerRoulette.handleModal);
client.modalHandlers.set("referral", referralPanel.handleModal);
client.modalHandlers.set("scrapmerchant", scrapMerchant.handleModal);
client.modalHandlers.set("servershub", serversHub.handleModal);
client.modalHandlers.set("shoppanel", shopPanel.handleModal);
client.modalHandlers.set("shop", shopPlayerPanel.handleModal);
client.modalHandlers.set("teampanel", teamPanel.handleModal);
client.modalHandlers.set("jackpot", ticketJackpot.handleModal);
client.modalHandlers.set("towerclimb", towerClimb.handleModal);
client.modalHandlers.set("tradeconfig", tradeConfigPanel.handleModal);
client.modalHandlers.set("treasureslots", treasureSlots.handleModal);

// --- Events ---
const eventsPath = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

client.login(process.env.DISCORD_TOKEN);

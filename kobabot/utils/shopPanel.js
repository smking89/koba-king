"use strict";

/**
 * Admin Shop Panel - create/configure shops, currencies, categories,
 * products, and sales. Player-facing browsing/cart/checkout lives in
 * utils/shopPlayerPanel.js instead - kept separate since the two audiences
 * need completely different views of the same tables.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { searchItems, getItemByShortName, itemsForTier, TIER_RULES } = require("../config/rustItems");
const { infoEmbed, successEmbed, dangerEmbed, basicLimitEmbed } = require("./embeds");
const { getGuildPlan } = require("./premium");

// KOBA Bot Basic includes 1 currency and 1 shop - see
// website/src/components/PlanGrid.jsx's "Shop (1 currency, 1 shop)" bullet.
const BASIC_CURRENCY_LIMIT = 1;
const BASIC_SHOP_LIMIT = 1;

/**
 * Inline version of premium.js's requireWithinBasicLimit, kept local
 * because this panel always keeps a Back button on screen (unlike the
 * ephemeral slash-command replies requireWithinBasicLimit was written
 * for) - replying with just the bare lock embed would strand the user
 * with no way back into the panel short of re-running /shop-panel.
 */
async function withinBasicLimit(interaction, currentCount, limit, featureLabel, backCustomId) {
  const plan = await getGuildPlan(interaction.guild);
  if (plan !== "basic" || currentCount < limit) return true;
  await interaction.editReply({ embeds: [basicLimitEmbed(featureLabel, limit)], components: [backRow(backCustomId)] });
  return false;
}

function backRow(customId = "shoppanel:back") {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

function buildHub(guildId) {
  const shops = db.listShops(guildId);
  const currencies = db.listCurrencies(guildId);
  const embed = infoEmbed(
    "🛒 Shop Admin Panel",
    `**Shops:** ${shops.length}  ·  **Currencies:** ${currencies.length}\n\nCreate a currency first, then a shop, then add categories/products.`
  );
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shoppanel:currencies").setLabel("💰 Currencies").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shoppanel:create_shop").setLabel("➕ Create Shop").setStyle(ButtonStyle.Success)
    ),
  ];
  if (shops.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("shoppanel:pick_shop")
      .setPlaceholder("Manage a shop")
      .addOptions(shops.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), value: String(s.id), description: s.enabled ? "Enabled" : "Disabled" })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return { embeds: [embed], components: rows };
}

function buildCurrenciesView(guildId) {
  const currencies = db.listCurrencies(guildId);
  const body = currencies.length
    ? currencies.map((c) => `${c.emoji || ""} **${c.name}** - ${c.savings_interest_pct}%/day savings interest`).join("\n")
    : "None yet - create one before making a shop.";
  const rows = [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("shoppanel:create_currency").setLabel("➕ New Currency").setStyle(ButtonStyle.Success)),
  ];
  if (currencies.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("shoppanel:pick_currency")
      .setPlaceholder("Edit interest rate or delete")
      .addOptions(currencies.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: String(c.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(backRow());
  return { embeds: [infoEmbed("💰 Currencies", body)], components: rows };
}

function buildCurrencyDetailView(guildId, currencyId) {
  const currency = db.getCurrency(guildId, currencyId);
  const embed = infoEmbed(`${currency.emoji || ""} ${currency.name}`, `**Savings Interest:** ${currency.savings_interest_pct}%/day`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shoppanel:currency_rate:${currencyId}`).setLabel("Set Interest Rate").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shoppanel:currency_delete:${currencyId}`).setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row, backRow("shoppanel:currencies")] };
}

function buildShopDetailView(guildId, shopId) {
  const shop = db.getShop(guildId, shopId);
  const currency = db.getCurrency(guildId, shop.currency_id);
  const categories = db.listCategories(guildId, shopId);
  const roleText = shop.required_role_ids.length ? shop.required_role_ids.map((r) => `<@&${r}>`).join(", ") : "None - anyone can shop here";
  const embed = infoEmbed(
    `🛒 ${shop.name}`,
    [
      `**Status:** ${shop.enabled ? "🟢 Enabled" : "🔴 Disabled"}`,
      `**Currency:** ${currency?.emoji || ""} ${currency?.name || "?"}`,
      `**Required Roles:** ${roleText}`,
      `**Categories:** ${categories.length}`,
    ].join("\n")
  );
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shoppanel:toggle_shop:${shopId}`).setLabel(shop.enabled ? "🔴 Disable" : "🟢 Enable").setStyle(shop.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shoppanel:set_roles:${shopId}`).setLabel("Set Required Roles").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`shoppanel:add_category:${shopId}`).setLabel("➕ Add Category").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`shoppanel:easy_shop:${shopId}`).setLabel("⚡ Easy Shop").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`shoppanel:delete_shop:${shopId}`).setLabel("🗑️ Delete Shop").setStyle(ButtonStyle.Danger)
    ),
  ];
  if (categories.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shoppanel:pick_category:${shopId}`)
      .setPlaceholder("Manage a category")
      .addOptions(categories.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: String(c.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  // Added 2026-09-19 - sales (🏷️ buttons below, on category/product views)
  // were createable and applied live, but had no way to view or cancel one
  // early short of waiting out its ends_at.
  if (db.listActiveSales(guildId, shopId).length) {
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`shoppanel:view_sales:${shopId}`).setLabel("🏷️ View Active Sales").setStyle(ButtonStyle.Secondary)));
  }
  rows.push(backRow());
  return { embeds: [embed], components: rows };
}

/** Lists every currently-active sale on this shop (category- or product-scoped) with a Cancel button per row. */
function buildSalesView(guildId, shopId) {
  const sales = db.listActiveSales(guildId, shopId);
  if (!sales.length) {
    return { embeds: [infoEmbed("Active Sales", "No sales running right now.")], components: [backRow(`shoppanel:pick_shop_direct:${shopId}`)] };
  }
  const lines = sales.map((s) => {
    const target = s.product_id ? db.getProduct(guildId, s.product_id)?.display_name || `Product #${s.product_id}` : db.getCategory(guildId, s.category_id)?.name || `Category #${s.category_id}`;
    return `**${s.percent_off}% off** ${target} - ends <t:${Math.floor(s.ends_at / 1000)}:R>`;
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`shoppanel:cancel_sale_select:${shopId}`)
    .setPlaceholder("Cancel a sale early")
    .addOptions(
      sales.slice(0, 25).map((s) => ({
        label: `${s.percent_off}% off ${s.product_id ? db.getProduct(guildId, s.product_id)?.display_name || "product" : db.getCategory(guildId, s.category_id)?.name || "category"}`.slice(0, 100),
        value: String(s.id),
      }))
    );
  return { embeds: [infoEmbed("Active Sales", lines.join("\n"))], components: [new ActionRowBuilder().addComponents(menu), backRow(`shoppanel:pick_shop_direct:${shopId}`)] };
}

function buildCategoryDetailView(guildId, shopId, categoryId) {
  const category = db.getCategory(guildId, categoryId);
  const products = db.listProducts(guildId, categoryId);
  const body = products.length
    ? products
        .map((p) => {
          const { price, percentOff } = db.getEffectivePrice(guildId, p);
          return `**${p.display_name}** (\`${p.item_short_name}\` x${p.amount_per_unit}) - ${price}${percentOff ? ` ~~${p.price}~~ (${percentOff}% off)` : ""}`;
        })
        .join("\n")
    : "No products yet.";
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shoppanel:add_product:${shopId}:${categoryId}`).setLabel("➕ Add Product").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shoppanel:add_sale:cat:${shopId}:${categoryId}`).setLabel("🏷️ Category Sale").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`shoppanel:delete_category:${shopId}:${categoryId}`).setLabel("🗑️ Delete Category").setStyle(ButtonStyle.Danger)
    ),
  ];
  if (products.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shoppanel:pick_product:${shopId}:${categoryId}`)
      .setPlaceholder("Edit or delete a product")
      .addOptions(products.slice(0, 25).map((p) => ({ label: p.display_name.slice(0, 100), value: String(p.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(backRow(`shoppanel:pick_shop_direct:${shopId}`));
  return { embeds: [infoEmbed(`📁 ${category.name}`, body)], components: rows };
}

function buildProductDetailView(guildId, shopId, categoryId, productId) {
  const product = db.getProduct(guildId, productId);
  const { price, percentOff } = db.getEffectivePrice(guildId, product);
  const embed = infoEmbed(
    product.display_name,
    `**Item:** \`${product.item_short_name}\` x${product.amount_per_unit}\n**Price:** ${price}${percentOff ? ` (${percentOff}% off ${product.price})` : ""}`
  );
  // Discord select menus can only show text + emoji per option (never a real
  // image), so there's no way to put item art directly in a dropdown - this
  // is the actual available spot for it: an embed thumbnail on the single-
  // product detail view. image_url was already being captured on product
  // creation (see the item picker below) but never actually rendered anywhere.
  if (product.image_url) embed.setThumbnail(product.image_url);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shoppanel:edit_price:${productId}`).setLabel("Edit Price").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shoppanel:add_sale:prod:${shopId}:${productId}`).setLabel("🏷️ Sale").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`shoppanel:delete_product:${categoryId}:${productId}`).setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row, backRow(`shoppanel:pick_category_direct:${shopId}:${categoryId}`)] };
}

function numberModal(customId, title, label, value) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  const input = new TextInputBuilder().setCustomId("value").setLabel(label.slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10);
  if (value !== undefined) input.setValue(String(value));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleComponent(interaction) {
  const id = interaction.customId;
  const parts = id.split(":");

  if (id === "shoppanel:back") {
    await interaction.update(buildHub(interaction.guildId));
    return;
  }

  if (id === "shoppanel:currencies") {
    await interaction.update(buildCurrenciesView(interaction.guildId));
    return;
  }

  if (id === "shoppanel:create_currency") {
    const modal = new ModalBuilder().setCustomId("shoppanel:create_currency_modal").setTitle("New Currency");
    const nameInput = new TextInputBuilder().setCustomId("name").setLabel("Currency name, e.g. Coins").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30);
    const emojiInput = new TextInputBuilder().setCustomId("emoji").setLabel("Emoji, e.g. 🪙 (optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(emojiInput));
    await interaction.showModal(modal);
    return;
  }

  if (id === "shoppanel:pick_currency") {
    await interaction.update(buildCurrencyDetailView(interaction.guildId, Number(interaction.values[0])));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "currency_rate") {
    const currencyId = Number(parts[2]);
    const currency = db.getCurrency(interaction.guildId, currencyId);
    await interaction.showModal(numberModal(`shoppanel:currency_rate_modal:${currencyId}`, "Savings Interest Rate", "Percent per day, e.g. 1.5", currency.savings_interest_pct));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "currency_delete") {
    db.deleteCurrency(interaction.guildId, Number(parts[2]));
    await interaction.update(buildCurrenciesView(interaction.guildId));
    return;
  }

  if (id === "shoppanel:create_shop") {
    const currencies = db.listCurrencies(interaction.guildId);
    if (!currencies.length) {
      await interaction.update({ embeds: [dangerEmbed("No Currencies", "Create a currency first via 💰 Currencies.")], components: [backRow()] });
      return;
    }
    // FIXED 2026-09-07: was a free-text field, now select-then-modal.
    const menu = new StringSelectMenuBuilder()
      .setCustomId("shoppanel:create_shop_currency_select")
      .setPlaceholder("Pick a currency for this shop")
      .addOptions(currencies.slice(0, 25).map((c) => ({ label: c.name, description: c.emoji ? `${c.emoji} ${c.name}` : undefined, value: String(c.id) })));
    await interaction.update({ embeds: [infoEmbed("New Shop", "Pick which currency this shop charges in:")], components: [new ActionRowBuilder().addComponents(menu), backRow()] });
    return;
  }

  if (id === "shoppanel:create_shop_currency_select") {
    const currencyId = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`shoppanel:create_shop_modal:${currencyId}`).setTitle("New Shop");
    const nameInput = new TextInputBuilder().setCustomId("name").setLabel("Shop name, e.g. VIP Shop").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
    return;
  }

  if (id === "shoppanel:pick_shop") {
    await interaction.update(buildShopDetailView(interaction.guildId, Number(interaction.values[0])));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "pick_shop_direct") {
    await interaction.update(buildShopDetailView(interaction.guildId, Number(parts[2])));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "toggle_shop") {
    const shopId = Number(parts[2]);
    const shop = db.getShop(interaction.guildId, shopId);
    db.updateShop(interaction.guildId, shopId, { enabled: !shop.enabled });
    await interaction.update(buildShopDetailView(interaction.guildId, shopId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "delete_shop") {
    db.deleteShop(interaction.guildId, Number(parts[2]));
    await interaction.update(buildHub(interaction.guildId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "set_roles") {
    const shopId = Number(parts[2]);
    const roleSelect = new RoleSelectMenuBuilder().setCustomId(`shoppanel:roles_pick:${shopId}`).setPlaceholder("Choose required role(s) - none = anyone").setMinValues(0).setMaxValues(10);
    await interaction.update({ embeds: [infoEmbed("Set Required Roles", "Pick every role allowed to use this shop, or select none to open it to everyone.")], components: [new ActionRowBuilder().addComponents(roleSelect), backRow(`shoppanel:pick_shop_direct:${shopId}`)] });
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "roles_pick") {
    const shopId = Number(parts[2]);
    db.updateShop(interaction.guildId, shopId, { required_role_ids: interaction.values || [] });
    await interaction.update(buildShopDetailView(interaction.guildId, shopId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "add_category") {
    const shopId = Number(parts[2]);
    await interaction.showModal(
      (() => {
        const modal = new ModalBuilder().setCustomId(`shoppanel:add_category_modal:${shopId}`).setTitle("New Category");
        const nameInput = new TextInputBuilder().setCustomId("name").setLabel("Category name, e.g. Weapons").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        return modal;
      })()
    );
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "pick_category") {
    const shopId = Number(parts[2]);
    const categoryId = Number(interaction.values[0]);
    await interaction.update(buildCategoryDetailView(interaction.guildId, shopId, categoryId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "pick_category_direct") {
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    await interaction.update(buildCategoryDetailView(interaction.guildId, shopId, categoryId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "delete_category") {
    const shopId = Number(parts[2]);
    db.deleteCategory(interaction.guildId, Number(parts[3]));
    await interaction.update(buildShopDetailView(interaction.guildId, shopId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "add_product") {
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    const modal = new ModalBuilder().setCustomId(`shoppanel:search_item_modal:${shopId}:${categoryId}`).setTitle("Find An Item");
    const searchInput = new TextInputBuilder().setCustomId("query").setLabel("Item name or shortname to search for").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
    modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
    await interaction.showModal(modal);
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "pick_item") {
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    const shortName = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`shoppanel:product_details_modal:${shopId}:${categoryId}:${shortName}`).setTitle("Product Details");
    const priceInput = new TextInputBuilder().setCustomId("price").setLabel("Price").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10);
    const amountInput = new TextInputBuilder().setCustomId("amount").setLabel("Amount given per purchase").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setValue("1");
    modal.addComponents(new ActionRowBuilder().addComponents(priceInput), new ActionRowBuilder().addComponents(amountInput));
    await interaction.showModal(modal);
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "pick_product") {
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    const productId = Number(interaction.values[0]);
    await interaction.update(buildProductDetailView(interaction.guildId, shopId, categoryId, productId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "edit_price") {
    const productId = Number(parts[2]);
    const product = db.getProduct(interaction.guildId, productId);
    await interaction.showModal(numberModal(`shoppanel:edit_price_modal:${productId}`, "Edit Price", "New price", product.price));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "delete_product") {
    const categoryId = Number(parts[2]);
    const productId = Number(parts[3]);
    const product = db.getProduct(interaction.guildId, productId);
    db.deleteProduct(interaction.guildId, productId);
    await interaction.update(buildCategoryDetailView(interaction.guildId, product.shop_id, categoryId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "view_sales") {
    const shopId = Number(parts[2]);
    await interaction.update(buildSalesView(interaction.guildId, shopId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "cancel_sale_select") {
    const shopId = Number(parts[2]);
    db.deleteSale(interaction.guildId, Number(interaction.values[0]));
    await interaction.update(buildSalesView(interaction.guildId, shopId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "add_sale") {
    const targetType = parts[2]; // "cat" | "prod"
    const shopId = Number(parts[3]);
    const targetId = Number(parts[4]);
    const modal = new ModalBuilder().setCustomId(`shoppanel:sale_modal:${targetType}:${shopId}:${targetId}`).setTitle("Create Sale");
    const percentInput = new TextInputBuilder().setCustomId("percent").setLabel("Percent off, e.g. 25").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3);
    const durationInput = new TextInputBuilder().setCustomId("duration").setLabel("Duration in hours").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6);
    modal.addComponents(new ActionRowBuilder().addComponents(percentInput), new ActionRowBuilder().addComponents(durationInput));
    await interaction.showModal(modal);
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "easy_shop") {
    const shopId = Number(parts[2]);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shoppanel:easy_shop_tier:${shopId}`)
      .setPlaceholder("Choose a price tier")
      .addOptions(Object.entries(TIER_RULES).map(([key, t]) => ({ label: t.label, value: key, description: `${t.priceRange[0]}-${t.priceRange[1]}` })));
    await interaction.update({ embeds: [infoEmbed("⚡ Easy Shop", "Auto-generates a category + ~12 products at this price tier. Review/adjust afterward - prices are a rough heuristic.")], components: [new ActionRowBuilder().addComponents(menu), backRow(`shoppanel:pick_shop_direct:${shopId}`)] });
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "easy_shop_tier") {
    const shopId = Number(parts[2]);
    const tierKey = interaction.values[0];
    await interaction.deferUpdate();
    const tierInfo = TIER_RULES[tierKey];
    const category = db.createCategory(interaction.guildId, shopId, `${tierInfo.label} Items`);
    const picks = itemsForTier(tierKey, 12);
    for (const { item, price } of picks) {
      db.createProduct(interaction.guildId, shopId, category.id, { displayName: item.name, itemShortName: item.shortName, amountPerUnit: 1, price });
    }
    await interaction.editReply({ embeds: [successEmbed("Easy Shop Generated", `Added **${picks.length}** products to a new **${tierInfo.label} Items** category.`)], components: [backRow(`shoppanel:pick_shop_direct:${shopId}`)] });
    return;
  }
}

async function handleModal(interaction) {
  const id = interaction.customId;
  const parts = id.split(":");

  if (id === "shoppanel:create_currency_modal") {
    await interaction.deferUpdate();
    const count = db.listCurrencies(interaction.guildId).length;
    if (!(await withinBasicLimit(interaction, count, BASIC_CURRENCY_LIMIT, "currencies", "shoppanel:currencies"))) return;
    const name = interaction.fields.getTextInputValue("name").trim();
    const emoji = interaction.fields.getTextInputValue("emoji").trim();
    db.createCurrency(interaction.guildId, name, emoji || null);
    await interaction.editReply(buildCurrenciesView(interaction.guildId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "currency_rate_modal") {
    await interaction.deferUpdate();
    const currencyId = Number(parts[2]);
    const pct = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(pct) || pct < 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Rate", "Enter a non-negative number.")], components: [backRow("shoppanel:currencies")] });
      return;
    }
    db.setCurrencyInterestRate(interaction.guildId, currencyId, pct);
    await interaction.editReply(buildCurrencyDetailView(interaction.guildId, currencyId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "create_shop_modal") {
    await interaction.deferUpdate();
    const shopCount = db.listShops(interaction.guildId).length;
    if (!(await withinBasicLimit(interaction, shopCount, BASIC_SHOP_LIMIT, "shops", "shoppanel:back"))) return;
    const name = interaction.fields.getTextInputValue("name").trim();
    const currency = db.getCurrency(interaction.guildId, Number(parts[2]));
    if (!currency) {
      await interaction.editReply({ embeds: [dangerEmbed("Currency Gone", "That currency was deleted since you started - pick another via Create Shop again.")], components: [backRow()] });
      return;
    }
    const shop = db.createShop(interaction.guildId, name, currency.id);
    await interaction.editReply(buildShopDetailView(interaction.guildId, shop.id));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "add_category_modal") {
    await interaction.deferUpdate();
    const shopId = Number(parts[2]);
    const name = interaction.fields.getTextInputValue("name").trim();
    db.createCategory(interaction.guildId, shopId, name);
    await interaction.editReply(buildShopDetailView(interaction.guildId, shopId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "search_item_modal") {
    await interaction.deferUpdate();
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    const query = interaction.fields.getTextInputValue("query").trim();
    const results = searchItems(query, 25);
    if (!results.length) {
      await interaction.editReply({ embeds: [dangerEmbed("No Matches", `Nothing matched "${query}" - try a different search.`)], components: [backRow(`shoppanel:pick_category_direct:${shopId}:${categoryId}`)] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shoppanel:pick_item:${shopId}:${categoryId}`)
      .setPlaceholder("Choose the exact item")
      .addOptions(results.map((i) => ({ label: i.name.slice(0, 100), value: i.shortName, description: i.shortName.slice(0, 100) })));
    await interaction.editReply({ embeds: [infoEmbed("Search Results", `${results.length} match(es) for "${query}".`)], components: [new ActionRowBuilder().addComponents(menu), backRow(`shoppanel:pick_category_direct:${shopId}:${categoryId}`)] });
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "product_details_modal") {
    await interaction.deferUpdate();
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    const shortName = parts[4];
    const price = Number(interaction.fields.getTextInputValue("price"));
    const amount = parseInt(interaction.fields.getTextInputValue("amount"), 10);
    const item = getItemByShortName(shortName);

    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(amount) || amount <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Price and amount must both be positive numbers.")], components: [backRow(`shoppanel:pick_category_direct:${shopId}:${categoryId}`)] });
      return;
    }

    db.createProduct(interaction.guildId, shopId, categoryId, { displayName: item?.name || shortName, itemShortName: shortName, amountPerUnit: amount, price, imageUrl: item?.image });
    await interaction.editReply(buildCategoryDetailView(interaction.guildId, shopId, categoryId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "edit_price_modal") {
    await interaction.deferUpdate();
    const productId = Number(parts[2]);
    const price = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(price) || price <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Price", "Enter a positive number.")], components: [backRow()] });
      return;
    }
    const product = db.updateProduct(interaction.guildId, productId, { price });
    await interaction.editReply(buildProductDetailView(interaction.guildId, product.shop_id, product.category_id, productId));
    return;
  }

  if (parts[0] === "shoppanel" && parts[1] === "sale_modal") {
    await interaction.deferUpdate();
    const targetType = parts[2];
    const shopId = Number(parts[3]);
    const targetId = Number(parts[4]);
    const percentOff = parseInt(interaction.fields.getTextInputValue("percent"), 10);
    const durationHours = Number(interaction.fields.getTextInputValue("duration"));

    if (!Number.isInteger(percentOff) || percentOff <= 0 || percentOff > 100 || !Number.isFinite(durationHours) || durationHours <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Input", "Percent must be 1-100, duration must be a positive number of hours.")], components: [backRow(`shoppanel:pick_shop_direct:${shopId}`)] });
      return;
    }

    const now = Date.now();
    db.createSale(interaction.guildId, shopId, {
      categoryId: targetType === "cat" ? targetId : null,
      productId: targetType === "prod" ? targetId : null,
      percentOff,
      startsAt: now,
      endsAt: now + durationHours * 60 * 60 * 1000,
    });

    await interaction.editReply({ embeds: [successEmbed("Sale Created", `**${percentOff}% off** for the next **${durationHours}** hour(s).`)], components: [backRow(`shoppanel:pick_shop_direct:${shopId}`)] });
    return;
  }
}

module.exports = { buildHub, handleComponent, handleModal };

"use strict";

/**
 * Player-facing Shop - browse enabled shops the player's roles qualify for,
 * add to cart, checkout (debits wallet, delivers via utils/shopDelivery.js),
 * plus Wallet/Savings management. Admin configuration lives in
 * utils/shopPanel.js instead.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const db = require("../database/db");
const { deliverCart } = require("./shopDelivery");
const { logAdminAction } = require("./adminFeed");
const { infoEmbed, successEmbed, dangerEmbed, warningEmbed } = require("./embeds");

function backRow(customId = "shop:back") {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary));
}

function shopsVisibleTo(guildId, member) {
  return db.listShops(guildId).filter((s) => s.enabled && (!s.required_role_ids.length || s.required_role_ids.some((r) => member.roles.cache.has(r))));
}

function buildHub(guildId, member) {
  const shops = shopsVisibleTo(guildId, member);
  const embed = infoEmbed("🛒 Shop", shops.length ? "Pick a shop below, or check your wallet/savings." : "No shops are available to you right now.");
  const rows = [];
  if (shops.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("shop:pick_shop")
      .setPlaceholder("Choose a shop")
      .addOptions(shops.slice(0, 25).map((s) => ({ label: s.name.slice(0, 100), value: String(s.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shop:wallet").setLabel("💰 My Wallet").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shop:savings").setLabel("🏦 My Savings").setStyle(ButtonStyle.Secondary)
    )
  );
  return { embeds: [embed], components: rows };
}

function buildShopView(guildId, discordId, shopId) {
  const shop = db.getShop(guildId, shopId);
  const currency = db.getCurrency(guildId, shop.currency_id);
  const categories = db.listCategories(guildId, shopId);
  const wallet = db.getWallet(guildId, discordId, currency.id);
  const cart = db.getCartItems(guildId, discordId).filter((c) => db.getProduct(guildId, c.product_id)?.shop_id === shopId);

  const embed = infoEmbed(`🛒 ${shop.name}`, `**Your Balance:** ${wallet.balance} ${currency.emoji || currency.name}\n**Cart:** ${cart.length} item type(s)`);
  const rows = [];
  if (categories.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shop:pick_category:${shopId}`)
      .setPlaceholder("Browse a category")
      .addOptions(categories.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: String(c.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop:cart:${shopId}`).setLabel("🛍️ View Cart").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("shop:back").setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
    )
  );
  return { embeds: [embed], components: rows };
}

function buildCategoryView(guildId, shopId, categoryId) {
  const category = db.getCategory(guildId, categoryId);
  const products = db.listProducts(guildId, categoryId);
  const lines = products.map((p) => {
    const { price, percentOff } = db.getEffectivePrice(guildId, p);
    return `**${p.display_name}** - ${price}${percentOff ? ` ~~${p.price}~~ 🏷️${percentOff}% off` : ""}`;
  });
  const rows = [];
  if (products.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`shop:pick_product:${shopId}:${categoryId}`)
      .setPlaceholder("Choose a product to add to cart")
      .addOptions(products.slice(0, 25).map((p) => ({ label: p.display_name.slice(0, 100), value: String(p.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(backRow(`shop:pick_shop_direct:${shopId}`));
  return { embeds: [infoEmbed(`📁 ${category.name}`, lines.join("\n") || "No products here yet.")], components: rows };
}

function buildQuantityView(guildId, shopId, categoryId, productId) {
  const product = db.getProduct(guildId, productId);
  const { price } = db.getEffectivePrice(guildId, product);
  const row = new ActionRowBuilder().addComponents(
    ...[1, 5, 10].map((qty) => new ButtonBuilder().setCustomId(`shop:add_to_cart:${productId}:${qty}`).setLabel(`Add ${qty} (${price * qty})`).setStyle(ButtonStyle.Success)),
    new ButtonBuilder().setCustomId(`shop:add_custom:${productId}`).setLabel("Custom Amount").setStyle(ButtonStyle.Secondary)
  );
  const embed = infoEmbed(product.display_name, `**Price each:** ${price}\nChoose a quantity to add to your cart.`);
  // Same limitation as the admin side - select menus can't show images, so
  // this single-product view (the closest thing players have to a "product
  // page") is where the item's icon actually shows up, as an embed thumbnail.
  if (product.image_url) embed.setThumbnail(product.image_url);
  return { embeds: [embed], components: [row, backRow(`shop:pick_category_direct:${shopId}:${categoryId}`)] };
}

function buildCartView(guildId, discordId, shopId) {
  const shop = db.getShop(guildId, shopId);
  const currency = db.getCurrency(guildId, shop.currency_id);
  const wallet = db.getWallet(guildId, discordId, currency.id);
  const cartRows = db.getCartItems(guildId, discordId);
  const lineItems = cartRows
    .map((c) => {
      const product = db.getProduct(guildId, c.product_id);
      if (!product || product.shop_id !== shopId) return null;
      const { price } = db.getEffectivePrice(guildId, product);
      return { product, quantity: c.quantity, lineTotal: price * c.quantity };
    })
    .filter(Boolean);

  const total = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);
  const body = lineItems.length
    ? lineItems.map((l) => `**${l.product.display_name}** x${l.quantity} - ${l.lineTotal}`).join("\n") + `\n\n**Total:** ${total} ${currency.emoji || currency.name}\n**Your Balance:** ${wallet.balance}`
    : "Your cart is empty.";

  const rows = [];
  if (lineItems.length) {
    const removeMenu = new StringSelectMenuBuilder()
      .setCustomId(`shop:remove_from_cart:${shopId}`)
      .setPlaceholder("Remove an item")
      .addOptions(lineItems.slice(0, 25).map((l) => ({ label: l.product.display_name.slice(0, 100), value: String(l.product.id) })));
    rows.push(new ActionRowBuilder().addComponents(removeMenu));
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shop:checkout:${shopId}`).setLabel(`✅ Checkout (${total})`).setStyle(ButtonStyle.Success).setDisabled(total > wallet.balance),
        new ButtonBuilder().setCustomId(`shop:pick_shop_direct:${shopId}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Secondary)
      )
    );
  } else {
    rows.push(backRow(`shop:pick_shop_direct:${shopId}`));
  }
  return { embeds: [infoEmbed("🛍️ Your Cart", body)], components: rows };
}

function buildWalletView(guildId, discordId) {
  const wallets = db.listWallets(guildId, discordId);
  const currencies = db.listCurrencies(guildId);
  const lines = currencies.map((c) => {
    const w = wallets.find((x) => x.currency_id === c.id);
    return `${c.emoji || ""} **${c.name}:** ${w?.balance ?? 0}`;
  });
  return { embeds: [infoEmbed("💰 My Wallet", lines.join("\n") || "No currencies configured yet.")], components: [backRow()] };
}

function buildSavingsView(guildId, discordId) {
  const currencies = db.listCurrencies(guildId);
  const savings = db.listSavings(guildId, discordId);
  const wallets = db.listWallets(guildId, discordId);
  const lines = currencies.map((c) => {
    const s = savings.find((x) => x.currency_id === c.id);
    return `${c.emoji || ""} **${c.name}:** ${s?.balance?.toFixed(2) ?? "0.00"} saved (${c.savings_interest_pct}%/day) - ${wallets.find((w) => w.currency_id === c.id)?.balance ?? 0} in wallet`;
  });
  const rows = [];
  if (currencies.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("shop:savings_pick_currency")
      .setPlaceholder("Deposit or withdraw a currency")
      .addOptions(currencies.slice(0, 25).map((c) => ({ label: c.name.slice(0, 100), value: String(c.id) })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  rows.push(backRow());
  return { embeds: [infoEmbed("🏦 My Savings", lines.join("\n") || "No currencies configured yet.")], components: rows };
}

function buildSavingsCurrencyView(guildId, discordId, currencyId) {
  const currency = db.getCurrency(guildId, currencyId);
  const wallet = db.getWallet(guildId, discordId, currencyId);
  const savings = db.getSavings(guildId, discordId, currencyId);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop:deposit:${currencyId}`).setLabel("⬆️ Deposit").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop:withdraw:${currencyId}`).setLabel("⬇️ Withdraw").setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [infoEmbed(`${currency.emoji || ""} ${currency.name}`, `**Wallet:** ${wallet.balance}\n**Savings:** ${savings.balance.toFixed(2)} (earning ${currency.savings_interest_pct}%/day)`)],
    components: [row, backRow("shop:savings")],
  };
}

async function handleComponent(interaction) {
  const id = interaction.customId;
  const parts = id.split(":");
  const guildId = interaction.guildId;
  const discordId = interaction.user.id;

  // Entry point from the persistent, shared #shop channel panel - reply
  // ephemeral (only the clicker sees it) rather than update(), which would
  // otherwise overwrite the shared pinned panel message for everyone.
  if (id === "shop:open") {
    await interaction.reply({ ...buildHub(guildId, interaction.member), ephemeral: true });
    return;
  }

  if (id === "shop:back") {
    await interaction.update(buildHub(guildId, interaction.member));
    return;
  }

  if (id === "shop:wallet") {
    await interaction.update(buildWalletView(guildId, discordId));
    return;
  }

  if (id === "shop:savings") {
    await interaction.update(buildSavingsView(guildId, discordId));
    return;
  }

  if (id === "shop:savings_pick_currency") {
    await interaction.update(buildSavingsCurrencyView(guildId, discordId, Number(interaction.values[0])));
    return;
  }

  if (parts[0] === "shop" && (parts[1] === "deposit" || parts[1] === "withdraw")) {
    const currencyId = Number(parts[2]);
    const modal = new ModalBuilder().setCustomId(`shop:${parts[1]}_modal:${currencyId}`).setTitle(parts[1] === "deposit" ? "Deposit To Savings" : "Withdraw From Savings");
    const amountInput = new TextInputBuilder().setCustomId("amount").setLabel("Amount").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12);
    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    await interaction.showModal(modal);
    return;
  }

  if (id === "shop:pick_shop") {
    await interaction.update(buildShopView(guildId, discordId, Number(interaction.values[0])));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "pick_shop_direct") {
    await interaction.update(buildShopView(guildId, discordId, Number(parts[2])));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "pick_category") {
    const shopId = Number(parts[2]);
    const categoryId = Number(interaction.values[0]);
    await interaction.update(buildCategoryView(guildId, shopId, categoryId));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "pick_category_direct") {
    await interaction.update(buildCategoryView(guildId, Number(parts[2]), Number(parts[3])));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "pick_product") {
    const shopId = Number(parts[2]);
    const categoryId = Number(parts[3]);
    const productId = Number(interaction.values[0]);
    await interaction.update(buildQuantityView(guildId, shopId, categoryId, productId));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "add_to_cart") {
    const productId = Number(parts[2]);
    const qty = Number(parts[3]);
    await interaction.deferUpdate();
    const existing = db.getCartItems(guildId, discordId).find((c) => c.product_id === productId);
    db.setCartQuantity(guildId, discordId, productId, (existing?.quantity || 0) + qty);
    const product = db.getProduct(guildId, productId);
    await interaction.editReply(buildShopView(guildId, discordId, product.shop_id));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "add_custom") {
    const productId = Number(parts[2]);
    const modal = new ModalBuilder().setCustomId(`shop:add_custom_modal:${productId}`).setTitle("Custom Quantity");
    const qtyInput = new TextInputBuilder().setCustomId("qty").setLabel("How many?").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6);
    modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
    await interaction.showModal(modal);
    return;
  }

  if (parts[0] === "shop" && parts[1] === "cart") {
    await interaction.update(buildCartView(guildId, discordId, Number(parts[2])));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "remove_from_cart") {
    const shopId = Number(parts[2]);
    const productId = Number(interaction.values[0]);
    await interaction.deferUpdate();
    db.setCartQuantity(guildId, discordId, productId, 0);
    await interaction.editReply(buildCartView(guildId, discordId, shopId));
    return;
  }

  if (parts[0] === "shop" && parts[1] === "checkout") {
    const shopId = Number(parts[2]);
    await interaction.deferUpdate();

    const shop = db.getShop(guildId, shopId);
    const currency = db.getCurrency(guildId, shop.currency_id);
    const member = db.getMember(guildId, discordId);
    if (!member?.gamertag) {
      await interaction.editReply({ embeds: [dangerEmbed("No Linked Gamertag", "Run `/link` first, then come back and checkout.")], components: [backRow(`shop:pick_shop_direct:${shopId}`)] });
      return;
    }

    const cartRows = db.getCartItems(guildId, discordId);
    const lineItems = cartRows
      .map((c) => {
        const product = db.getProduct(guildId, c.product_id);
        if (!product || product.shop_id !== shopId) return null;
        const { price } = db.getEffectivePrice(guildId, product);
        return { product, quantity: c.quantity, lineTotal: price * c.quantity };
      })
      .filter(Boolean);

    if (!lineItems.length) {
      await interaction.editReply({ embeds: [dangerEmbed("Empty Cart", "Nothing to check out.")], components: [backRow(`shop:pick_shop_direct:${shopId}`)] });
      return;
    }

    const total = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);
    const wallet = db.getWallet(guildId, discordId, currency.id);
    if (total > wallet.balance) {
      await interaction.editReply({ embeds: [warningEmbed("Insufficient Funds", `You need **${total}** but only have **${wallet.balance}**.`)], components: [backRow(`shop:cart:${shopId}`)] });
      return;
    }

    try {
      await deliverCart(
        guildId,
        member.gamertag,
        lineItems.map((l) => ({ itemShortName: l.product.item_short_name, amount: l.product.amount_per_unit * l.quantity }))
      );
    } catch (err) {
      await interaction.editReply({ embeds: [dangerEmbed("Delivery Failed", `Couldn't reach the Rust server: \`${err.message}\`. Nothing was charged.`)], components: [backRow(`shop:cart:${shopId}`)] });
      return;
    }

    db.adjustWallet(guildId, discordId, currency.id, -total);
    const summary = lineItems.map((l) => `${l.product.display_name} x${l.quantity}`).join(", ");
    db.recordPurchase(guildId, discordId, member.gamertag, shopId, summary, total, currency.id);
    db.clearCart(guildId, discordId);

    await logAdminAction(interaction.guild, {
      title: "Shop Purchase",
      description: `**Shop:** ${shop.name}\n**By:** ${member.gamertag} (${interaction.user.username})\n**Items:** ${summary}\n**Total:** ${total} ${currency.emoji || currency.name}`,
    });

    await interaction.editReply({ embeds: [successEmbed("Purchase Complete", `Delivered to **${member.gamertag}**: ${summary}\n**Charged:** ${total} ${currency.emoji || currency.name}`)], components: [backRow(`shop:pick_shop_direct:${shopId}`)] });
    return;
  }
}

async function handleModal(interaction) {
  const id = interaction.customId;
  const parts = id.split(":");
  const guildId = interaction.guildId;
  const discordId = interaction.user.id;

  if (parts[0] === "shop" && parts[1] === "add_custom_modal") {
    await interaction.deferUpdate();
    const productId = Number(parts[2]);
    const qty = parseInt(interaction.fields.getTextInputValue("qty"), 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Quantity", "Enter a positive whole number.")], components: [backRow()] });
      return;
    }
    const existing = db.getCartItems(guildId, discordId).find((c) => c.product_id === productId);
    db.setCartQuantity(guildId, discordId, productId, (existing?.quantity || 0) + qty);
    const product = db.getProduct(guildId, productId);
    await interaction.editReply(buildShopView(guildId, discordId, product.shop_id));
    return;
  }

  if (parts[0] === "shop" && (parts[1] === "deposit_modal" || parts[1] === "withdraw_modal")) {
    await interaction.deferUpdate();
    const currencyId = Number(parts[2]);
    const amount = Number(interaction.fields.getTextInputValue("amount"));
    if (!Number.isFinite(amount) || amount <= 0) {
      await interaction.editReply({ embeds: [dangerEmbed("Invalid Amount", "Enter a positive number.")], components: [backRow("shop:savings")] });
      return;
    }

    const isDeposit = parts[1] === "deposit_modal";
    const wallet = db.getWallet(guildId, discordId, currencyId);
    const savings = db.getSavings(guildId, discordId, currencyId);
    const source = isDeposit ? wallet.balance : savings.balance;
    if (amount > source) {
      await interaction.editReply({ embeds: [dangerEmbed("Insufficient Balance", `You only have **${source}** available for this.`)], components: [backRow("shop:savings")] });
      return;
    }

    if (isDeposit) {
      db.adjustWallet(guildId, discordId, currencyId, -amount);
      db.adjustSavings(guildId, discordId, currencyId, amount);
    } else {
      db.adjustSavings(guildId, discordId, currencyId, -amount);
      db.adjustWallet(guildId, discordId, currencyId, amount);
    }

    await interaction.editReply(buildSavingsCurrencyView(guildId, discordId, currencyId));
    return;
  }
}

module.exports = { buildHub, handleComponent, handleModal };

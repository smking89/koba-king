import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import PricingCard from "./PricingCard";
import chestBasic from "../../assets/chest-green-basic.webp";
import chestPro from "../../assets/chest-gold-pro.webp";
import chestMax from "../../assets/chest-purple-max.webp";

/**
 * PlanGrid — lays out the four KOBA Bot plans.
 * `.bb-grid` is single-column by default (mobile), `.bb-grid--2` brings it
 * to 2 columns at 768px, and `.bb-grid--4` takes it to a full 4-column
 * desktop grid at the 1024px breakpoint — same tokens preview.html uses,
 * no extra CSS needed.
 *
 * Checkout URLs are fetched from /api/site-settings (admin/server.js) -
 * the same real Tip4Serv product links configured on /admin/settings, not
 * hardcoded here, so an admin can update pricing/checkout links with no
 * redeploy. Basic has no checkout at all (it's free) - its CTA goes
 * straight to the Discord invite instead of Tip4Serv.
 */
export default function PlanGrid({ onSelectPlan }) {
  const [links, setLinks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLinks(data);
      })
      .catch(() => {
        // network hiccup or API not reachable (e.g. local dev without the
        // Express backend running) - CTAs below fall back to "#" rather
        // than throwing, so the page still renders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function hrefFor(planKey) {
    if (!links) return undefined;
    if (planKey === "basic") return links.discordInviteUrl || undefined;
    if (planKey === "pro") return links.tip4servProUrl || links.tip4servShopUrl || undefined;
    if (planKey === "max") return links.tip4servMaxUrl || links.tip4servShopUrl || undefined;
    return undefined;
  }
  const plans = [
    {
      key: "basic",
      variant: "basic",
      image: chestBasic,
      imageAlt: "KOBA Bot Basic tier chest",
      badge: { label: "Free Forever", variant: "bb-badge--green" },
      eyebrow: "Server Plan",
      title: "KOBA Bot Basic",
      priceMain: "$0",
      priceSuffix: "/forever",
      description: "For new servers, small communities, and testing.",
      features: [
        "3 Kits",
        "Shop (1 currency, 1 shop)",
        "Economy (single-currency only)",
        "Clans (core clan features only)",
        "LFG (full system — same for all plans)",
        "Universal Dashboard (modules appear based on plan)",
        "Templates (full access for all plans)",
        "Bonus: Free Server Directory Listing",
      ],
      limitations: [
        "No marketplace",
        "No auctions",
        "No multi-currency",
        "No minting",
        "No vault interest",
        "No clan wars",
        "No advanced kits",
        "No advanced shops",
        "No staff recruitment network",
        "No Boom Coin bonuses",
      ],
      note: "KOBA Bot Basic = connected + visible, but limited.",
      ctaLabel: "Start Free",
      ctaVariant: "bb-btn--outline",
    },
    {
      key: "pro",
      variant: "pro",
      image: chestPro,
      imageAlt: "KOBA Bot Pro tier chest",
      badge: { label: "Most Popular", variant: "bb-badge--solid" },
      eyebrow: "Server Plan",
      title: "KOBA Bot Pro",
      priceMain: links?.proPriceMain || "$10.95",
      priceSuffix: links?.proPriceSuffix || "/month per server",
      description: "For active servers and medium-large communities.",
      features: [
        "Everything in Basic",
        "Advanced Economy & Marketplace",
        "Auction System & Loot Tables",
        "Clan Wars",
      ],
      ctaLabel: "Get Pro",
      ctaVariant: "bb-btn--primary",
    },
    {
      key: "max",
      variant: "max",
      image: chestMax,
      imageAlt: "KOBA Bot Max tier chest",
      badge: { label: "Best Annual Value", variant: "bb-badge--purple" },
      eyebrow: "Server Plan",
      title: "KOBA Bot Max",
      priceMain: links?.maxPriceMain || "$149.95",
      priceSuffix: links?.maxPriceSuffix || "/year per server",
      priceNote: links?.maxPriceNote || "≈17% savings vs. paying monthly",
      description: "Same full feature set as Pro, billed annually.",
      features: [
        "Everything in Pro",
        "Multi-Server Management",
        "Advanced Templates & Customization",
        "Staff Recruitment Network",
      ],
      ctaLabel: "Get Max",
      ctaVariant: "bb-btn--purple",
    },
  ];

  function handleCtaClick(planKey) {
    onSelectPlan && onSelectPlan(planKey);
    const href = hrefFor(planKey);
    if (href) window.location.href = href;
  }

  return (
    <div className="bb-grid bb-grid--2 bb-grid--4">
      {plans.map((plan) => (
        <PricingCard
          key={plan.key}
          {...plan}
          ctaLabel={links === null ? "Loading…" : plan.ctaLabel}
          onCtaClick={() => handleCtaClick(plan.key)}
        />
      ))}
    </div>
  );
}

PlanGrid.propTypes = {
  onSelectPlan: PropTypes.func,
};

PlanGrid.defaultProps = {
  onSelectPlan: undefined,
};

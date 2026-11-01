import PropTypes from "prop-types";
import Icon from "../icons/Icon";

/**
 * PricingCard — single plan card used across the Pricing page.
 * Purely presentational: every visual decision comes from a `bb-*` class,
 * variant selection just picks which classes get applied.
 */
export default function PricingCard({
  variant,
  image,
  imageAlt,
  badge,
  eyebrow,
  title,
  priceMain,
  priceSuffix,
  priceNote,
  description,
  features,
  limitations,
  note,
  ctaLabel,
  ctaVariant,
  onCtaClick,
}) {
  const cardClassName = `bb-card bb-card--${variant} bb-card--interactive`;
  const ctaClassName = `bb-btn ${ctaVariant} bb-btn--block`;

  return (
    <div className={cardClassName}>
      {badge && (
        <span className={`bb-badge ${badge.variant || ""} bb-ribbon`}>
          {badge.label}
        </span>
      )}

      {image && (
        <img src={image} alt={imageAlt} className="mx-auto h-28 w-auto" />
      )}

      <span className="bb-eyebrow">{eyebrow}</span>
      <h3 className="bb-h3">{title}</h3>
      <p className="bb-body-sm">{description}</p>

      <p className="bb-h2">
        {priceMain}
        {priceSuffix && <span className="bb-body-sm">{priceSuffix}</span>}
      </p>
      {priceNote && <span className="bb-caption">{priceNote}</span>}

      {features && features.length > 0 && (
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li key={feature} className="bb-body-sm flex items-start gap-2">
              <Icon name="check" className="w-4 h-4 shrink-0 text-bb-green" />
              {feature}
            </li>
          ))}
        </ul>
      )}

      {limitations && limitations.length > 0 && (
        <ul className="flex flex-col gap-2">
          {limitations.map((limitation) => (
            <li key={limitation} className="bb-caption flex items-start gap-2">
              <Icon name="close" className="w-4 h-4 shrink-0 text-bb-text-muted" />
              {limitation}
            </li>
          ))}
        </ul>
      )}

      {note && <p className="bb-caption italic">{note}</p>}

      <button type="button" className={ctaClassName} onClick={onCtaClick}>
        {ctaLabel}
      </button>
    </div>
  );
}

PricingCard.propTypes = {
  variant: PropTypes.oneOf(["basic", "pro", "max"]).isRequired,
  image: PropTypes.string,
  imageAlt: PropTypes.string,
  badge: PropTypes.shape({
    label: PropTypes.string.isRequired,
    variant: PropTypes.string,
  }),
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  priceMain: PropTypes.string.isRequired,
  priceSuffix: PropTypes.string,
  priceNote: PropTypes.string,
  description: PropTypes.string,
  features: PropTypes.arrayOf(PropTypes.string),
  limitations: PropTypes.arrayOf(PropTypes.string),
  note: PropTypes.string,
  ctaLabel: PropTypes.string.isRequired,
  ctaVariant: PropTypes.string,
  onCtaClick: PropTypes.func,
};

PricingCard.defaultProps = {
  image: undefined,
  imageAlt: "",
  badge: undefined,
  eyebrow: undefined,
  priceSuffix: undefined,
  priceNote: undefined,
  description: undefined,
  features: [],
  limitations: [],
  note: undefined,
  ctaVariant: "bb-btn--primary",
  onCtaClick: undefined,
};

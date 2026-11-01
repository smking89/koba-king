interface BrandLockupProps {
  /** Line under the wordmark, e.g. "Business" or the tagline. */
  subtitle?: string;
  large?: boolean;
}

/**
 * The KOBA lockup: the official brush wordmark, which carries the drop mark
 * inside the artwork, so nothing is set in type or drawn twice.
 */
export function BrandLockup({ subtitle, large = false }: BrandLockupProps) {
  return (
    <div className={`brand${large ? ' brand-lg' : ''}`}>
      <div className="brand-text">
        <img className="brand-word" src="/brand/koba-wordmark.png" alt="KOBA" />
        {subtitle && <span className="brand-sub">{subtitle}</span>}
      </div>
    </div>
  );
}

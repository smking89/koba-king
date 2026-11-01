import { useRef, useState, type CSSProperties } from "react";
import { type RoleIcon, type RoleResult, type EarnedRole } from "@/site/badges";
import { rankFor } from "@/site/ranks";

const GLOW: Record<string, [string, string, string]> = {
  gold: ["#111111", "#ffffff", "#8d8d8d"],
  violet: ["#111111", "#ffffff", "#c8c8c8"],
  magenta: ["#111111", "#ffffff", "#c8c8c8"],
  cyan: ["#111111", "#ffffff", "#c8c8c8"],
  ok: ["#111111", "#ffffff", "#c8c8c8"],
  muted: ["#111111", "#8d8d8d", "#c8c8c8"],
};

// Solid color per role tier for the icon-less pill (ok/cyan/muted) - common
// roles read as a plain animated color chip, not an icon tile. Matches the
// theme's own palette tokens (see src/styles.css's @theme block).
const PILL_COLOR: Record<string, string> = {
  ok: "var(--color-ok)",
  cyan: "var(--color-cyan)",
  muted: "var(--color-faint)",
  gold: "var(--color-gold)",
  violet: "var(--color-violet)",
  magenta: "var(--color-magenta)",
};

const FRAME = "M40 3 51 13 67 7 71 23 78 33 70 46 78 59 67 73 51 67 40 77 29 67 13 73 9 59 2 46 10 33 2 23 13 7 29 13Z";
const WELL = "M40 12 49 20 61 16 64 28 70 36 64 48 70 56 61 66 49 62 40 70 31 62 19 66 16 56 10 48 16 36 10 28 19 16 31 20Z";
const VERIFIED_SEAL =
  "M32 2 38.5 7.9 47 6 49.7 14.3 58 17 56.1 25.5 62 32 56.1 38.5 58 47 49.7 49.7 47 58 38.5 56.1 32 62 25.5 56.1 17 58 14.3 49.7 6 47 7.9 38.5 2 32 7.9 25.5 6 17 14.3 14.3 17 6 25.5 7.9Z";

const ART: Record<string, string> = {
  "seal:cyan": "/badges/verified.jpg",
  "seal:ok": "/badges/clear.jpg",
  diamond: "/badges/business.jpg",
  crown: "/badges/founder.jpg",
  laurel: "/rarity/legendary.png",
  wave: "/badges/wake.jpg",
  peak: "/badges/north.jpg",
  spark: "/badges/season.jpg",
  gift: "/badges/gift.jpg",
  clock: "/badges/hours.jpg",
  maps: "/badges/library.jpg",
  chevron: "/badges/rally.jpg",
  hex: "/badges/linked.jpg",
  mark: "/badges/camp.jpg",
};

const PLATE: Record<string, string> = {
  Business: "/badges/earn/merchant.png",
  Founder: "/badges/earn/loyalty.png",
  Officer: "/badges/earn/strategist.png",
  Ranked: "/badges/earn/boss.png",
  Wake: "/badges/earn/night-owl.png",
  North: "/badges/earn/lone-wolf.png",
  Clear: "/badges/earn/survivor.png",
  "Twin camp": "/badges/earn/craftsman.png",
  Linked: "/badges/earn/hopper.png",
  Spark: "/badges/earn/early-bird.png",
  Kindling: "/badges/earn/early-bird.png",
  Flare: "/badges/earn/early-bird.png",
  Beacon: "/badges/earn/early-bird.png",
  Signal: "/badges/earn/early-bird.png",
  Monument: "/badges/earn/early-bird.png",
  Tip: "/badges/earn/treasure.png",
  Backer: "/badges/earn/treasure.png",
  Patron: "/badges/earn/treasure.png",
  Benefactor: "/badges/earn/treasure.png",
  Keeper: "/badges/earn/treasure.png",
  Legend: "/badges/earn/treasure.png",
  Scout: "/badges/earn/streak.png",
  Regular: "/badges/earn/streak.png",
  Devoted: "/badges/earn/streak.png",
  Veteran: "/badges/earn/streak.png",
  Iron: "/badges/earn/streak.png",
  Mythic: "/badges/earn/streak.png",
  Pair: "/badges/earn/map.png",
  Circuit: "/badges/earn/map.png",
  Range: "/badges/earn/map.png",
  Atlas: "/badges/earn/map.png",
  Rally: "/badges/earn/pack.png",
  Banner: "/badges/earn/pack.png",
  Keep: "/badges/earn/pack.png",
};

function artFor(icon: RoleIcon, color: string, name?: string) {
  if (name && PLATE[name]) return PLATE[name];
  if (icon === "seal") return ART[`seal:${color}`] ?? "/badges/earn/survivor.png";
  return ART[icon] ?? "/badges/earn/early-bird.png";
}

/** animation -> CSS class in src/styles.css. "none" intentionally maps to no class - a muted role is the one tier that doesn't move. */
const ANIMATION_CLASS: Record<string, string> = {
  none: "",
  pulse: "role-anim-pulse",
  glow: "role-anim-glow",
  shimmer: "role-anim-shimmer",
  radiant: "role-anim-radiant",
};

/** The icon-less pill for common roles (ok/cyan/muted) - a plain animated color chip instead of icon artwork, per the "harder roles get icons, common ones don't" rule. */
function RolePill({ color, animation, name, size }: { color: string; animation: string; name?: string; size: number }) {
  const dot = Math.max(8, Math.round(size * 0.4));
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${ANIMATION_CLASS[animation] ?? ""}`}
      style={{ width: dot, height: dot, backgroundColor: PILL_COLOR[color] ?? PILL_COLOR.cyan }}
      aria-label={name}
    />
  );
}

export function BadgeIcon({
  icon,
  color = "cyan",
  animation = "none",
  showIcon = true,
  mark,
  name,
  size = 22,
  labeled = false,
}: {
  icon: RoleIcon;
  color?: string;
  animation?: string;
  showIcon?: boolean;
  mark?: string;
  name?: string;
  size?: number;
  labeled?: boolean;
}) {
  if (!showIcon) return <RolePill color={color} animation={animation} name={name} size={size} />;

  if (icon === "seal" && color === "cyan" && !mark && !labeled && size < 36) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${ANIMATION_CLASS[animation] ?? ""}`}>
        <path d={VERIFIED_SEAL} fill="var(--color-fg)" />
        <path d="M22 33.5 29.2 41.2 43.5 23.5" fill="none" stroke="var(--color-bg)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const [well, hot, edge] = GLOW[color] ?? GLOW.cyan;
  if (labeled || size >= 20) {
    const box = labeled ? 72 : size;
    return (
      <span className="inline-grid justify-items-center gap-1" style={{ width: box }}>
        <span className={`medal-ring ${ANIMATION_CLASS[animation] ?? ""}`} style={{ width: box, height: box }}>
          <img src={artFor(icon, color, name)} alt="" className="medal-art" />
        </span>
      </span>
    );
  }
  const height = size;
  return (
    <svg width={size} height={height} viewBox={labeled ? "0 0 80 104" : "0 0 80 80"} aria-hidden className={`shrink-0 ${ANIMATION_CLASS[animation] ?? ""}`}>
      <path d={FRAME} fill="#d4d4d4" />
      <path d={FRAME} fill={edge} opacity="0.55" />
      <path d={WELL} fill="#0b0d12" />
      <path d={WELL} fill={well} />
      <circle cx="40" cy="40" r="16" fill={hot} opacity="0.28" />
      <Scene icon={icon} hot={hot} edge={edge} />
      {mark ? (
        <g>
          <circle cx="62" cy="16" r="8" fill="#0b0d12" stroke={edge} strokeWidth="1.4" />
          <text x="62" y="19" textAnchor="middle" fill="#fff" fontSize="8" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700">
            {mark}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function Scene({ icon, hot, edge }: { icon: RoleIcon; hot: string; edge: string }) {
  if (icon === "seal") {
    return (
      <g fill="none" stroke={edge} strokeWidth="2.4" strokeLinecap="round">
        <path d="M28 40 36 48 54 30" stroke="#fff" strokeWidth="3.2" />
        <circle cx="40" cy="40" r="14" stroke={hot} />
      </g>
    );
  }
  if (icon === "spark") {
    return (
      <g>
        <circle cx="40" cy="42" r="8" fill={hot} />
        <path fill={edge} d="M40 24 43 34 40 32 37 34Zm0 28-3-10 3 2 3-2Zm14-14-10 3 2-3-2-3Zm-28 0 10 3-2-3 2-3Z" />
        <path fill="#111111" d="M30 40c4-6 8-8 10-8s6 2 10 8c-4 2-7 2-10 2s-6 0-10-2Z" />
      </g>
    );
  }
  if (icon === "gift") {
    return (
      <g>
        <path fill="#3a3a3a" d="M26 36h28v18H26Z" />
        <path fill={hot} d="M24 32h32v6H24Z" />
        <path fill={edge} d="M38 32h4v22h-4Z" />
        <path fill={edge} d="M30 28c0-4 4-6 6-2 2-4 6-2 6 2" />
        <path fill="#ffffff" d="M46 42 50 40 48 46 52 48 46 48 44 52 42 46 36 46 40 42Z" />
      </g>
    );
  }
  if (icon === "clock") {
    return (
      <g>
        <circle cx="40" cy="40" r="13" fill="#101820" stroke={edge} strokeWidth="2" />
        <path stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M40 32v9l6 4" />
        <path fill={hot} d="M54 28 62 22 58 34 66 36 54 40 58 30Z" />
      </g>
    );
  }
  if (icon === "maps") {
    return (
      <g>
        <circle cx="40" cy="40" r="13" fill="#102028" stroke={edge} strokeWidth="2" />
        <path fill={hot} d="M40 28 44 40 40 52 36 40Z" />
        <path fill="#fff" d="M28 40 40 36 52 40 40 44Z" opacity="0.8" />
      </g>
    );
  }
  if (icon === "crown") {
    return (
      <g>
        <path fill={hot} d="M24 46h32v6H24Z" />
        <path fill={edge} d="M22 46 28 30l8 8 4-14 4 14 8-8 6 16Z" />
        <path fill="none" stroke="#ffffff" strokeWidth="2" d="M26 52c4 4 8 4 14 0s10-4 14 0" />
      </g>
    );
  }
  if (icon === "diamond") {
    return (
      <g>
        <path fill={edge} d="M28 44h8l2 8h-6Zm16 0h8l-4 8h-6Z" />
        <path fill={hot} d="M24 30h12l-4 10H28Zm20 0h12l-4 10h-4Z" />
        <path stroke={edge} strokeWidth="2" d="M40 22v28M32 28h16" />
      </g>
    );
  }
  if (icon === "laurel") {
    return (
      <g fill={edge}>
        <path d="M40 26c6 4 8 10 8 16s-2 12-8 16c-6-4-8-10-8-16s2-12 8-16Z" />
        <path fill={hot} d="M22 34c4 1 6 4 6 8-4 1-8 0-10-4 1-2 2-3 4-4Zm36 0c-4 1-6 4-6 8 4 1 8 0 10-4-1-2-2-3-4-4Z" />
      </g>
    );
  }
  if (icon === "wave") {
    return (
      <g fill={edge}>
        <path d="M28 48c2-10 6-16 12-16 2 6 2 12-2 18 4 0 8-2 10-6 2 8-4 14-12 14-6 0-10-4-8-10Z" />
        <path fill="#fff" d="M34 34c2 2 2 4 0 6 3-1 5 0 6 2-4-1-5 1-5 3 2-2 1-4-1-5Z" />
      </g>
    );
  }
  if (icon === "peak") {
    return (
      <g>
        <path fill={edge} d="M18 58 34 28l8 14 6-8 16 24Z" />
        <path fill={hot} d="M34 28 40 40 30 40Z" />
        <circle cx="54" cy="26" r="5" fill="#e8eef8" />
      </g>
    );
  }
  if (icon === "hex") {
    return (
      <g fill="none" stroke={hot} strokeWidth="3">
        <path d="M28 32h10a6 6 0 0 1 0 12H28a6 6 0 0 1 0-12Z" />
        <path d="M42 36h8a6 6 0 0 1 0 12h-8" />
      </g>
    );
  }
  if (icon === "chevron") {
    return (
      <g fill={edge}>
        <path d="M24 46c2-8 6-12 8-12s6 4 8 12c-2 2-5 3-8 3s-6-1-8-3Z" />
        <path d="M18 40c2-6 4-8 6-8s4 2 6 8c-2 1-4 2-6 2s-4-1-6-2Zm32 0c-2-6-4-8-6-8s-4 2-6 8c2 1 4 2 6 2s4-1 6-2Z" />
      </g>
    );
  }
  return (
    <g>
      <path fill={hot} d="M26 34h28l-2 16H28Z" />
      <path fill={edge} d="M40 24 46 34H34Z" />
      <path fill="#fff" d="M36 40h8l-1 6h-6Z" />
    </g>
  );
}

export function RankCrest({ score, size = 84 }: { score: number; size?: number }) {
  const rank = rankFor(score);
  return <img src={rank.art} alt={`${rank.name} rank`} width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
}

/** gold/violet/magenta are the hard-to-earn tiers - rendered as shimmering gradient text instead of a flat color, same "harder roles look harder" rule the icon system used. */
const HARD_TIER = new Set(["gold", "violet", "magenta"]);

/**
 * A role reads as its own name in its own color - like a Discord member's
 * name picking up the color of their highest role - not as a pill or badge.
 * Common tiers (muted/ok/cyan) are a flat color, no motion. The three hard
 * tiers get a shimmering gradient sweep through the name text; nothing else
 * animates (no pulse/glow/box-shadow) per "just colors, not effects".
 */
export function RoleChip({ pin, size = "md" }: { pin: EarnedRole; size?: "sm" | "md" }) {
  const hex = PILL_COLOR[pin.color] ?? PILL_COLOR.cyan;
  const textSize = size === "sm" ? "text-[11px]" : "text-sm";
  const label = `${pin.name}. ${pin.permanent ? "Permanent." : "Temporary."} ${pin.detail}`;
  if (HARD_TIER.has(pin.color)) {
    return (
      <span role="img" aria-label={label} className={`role-text-shimmer font-semibold whitespace-nowrap ${textSize}`} style={{ "--role-color": hex } as CSSProperties}>
        {pin.name}
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} className={`font-semibold whitespace-nowrap ${textSize}`} style={{ color: hex }}>
      {pin.name}
    </span>
  );
}

export function RoleChipRow({ pins, size = "md" }: { pins: EarnedRole[]; size?: "sm" | "md" }) {
  if (pins.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
      {pins.map((pin, index) => (
        <span key={pin.id} className="inline-flex items-center gap-2">
          {index > 0 ? <span className="text-faint" aria-hidden>·</span> : null}
          <RoleChip pin={pin} size={size} />
        </span>
      ))}
    </span>
  );
}

export function BadgeRow({ pins, size = 18, enter = false, muted = false }: { pins: EarnedRole[]; size?: number; enter?: boolean; muted?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  if (pins.length === 0) return null;

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 align-middle ${muted ? "origin-left scale-90 grayscale opacity-55" : ""}`} aria-label="Roles">
      {pins.map((pin, index) => {
        const open = openId === pin.id;
        return (
          <span key={pin.id} className="relative" data-badge>
            <span
              className={`badge-pin inline-flex items-center ${enter ? "badge-enter" : ""} ${heldId === pin.id ? "is-held" : ""}`}
              style={enter ? { animationDelay: `${index * 70}ms` } : undefined}
              role="img"
              aria-label={`${pin.name}. ${pin.permanent ? "Permanent." : "Temporary."} ${pin.detail}`}
              onMouseEnter={() => setOpenId(pin.id)}
              onMouseLeave={() => setOpenId((current) => (current === pin.id ? null : current))}
              onPointerDown={(event) => {
                event.stopPropagation();
                held.current = false;
                clearTimer();
                timer.current = window.setTimeout(() => {
                  held.current = true;
                  setHeldId(pin.id);
                  setOpenId(pin.id);
                }, 380);
              }}
              onPointerUp={() => {
                clearTimer();
                window.setTimeout(() => setHeldId(null), 420);
              }}
              onPointerCancel={() => {
                clearTimer();
                setHeldId(null);
              }}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                if (held.current) return;
                setOpenId((current) => (current === pin.id ? null : pin.id));
              }}
            >
              <BadgeIcon icon={pin.icon} color={pin.color} animation={pin.animation} showIcon={pin.showIcon} mark={pin.mark} size={size} />
            </span>
            {open ? (
              <span role="tooltip" className="badge-tip text-xs">
                <span className="block font-medium text-fg">{pin.name}</span>
                <span className="mt-0.5 block text-faint">{pin.permanent ? "Permanent" : "Temporary"}</span>
                <span className="mt-0.5 block text-muted">{pin.detail}</span>
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

export function BadgeBoard({ result }: { result: RoleResult }) {
  const [activeId, setActiveId] = useState<string | null>(result.featured[0]?.id ?? result.earned[0]?.id ?? null);
  const active = result.earned.find((pin) => pin.id === activeId) ?? result.featured[0] ?? null;

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2" data-noswipe>
          {result.earned.filter((pin) => pin.id !== "verified").map((pin) => {
            const on = pin.id === active?.id;
            return (
              <button
                key={pin.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveId(pin.id)}
                className={`rounded-sm underline-offset-4 transition-opacity hover:opacity-80 ${on ? "underline" : ""}`}
              >
                <RoleChip pin={pin} />
              </button>
            );
          })}
        </div>
        {active ? (
          <p className="mt-3 text-sm" role="status">
            <span className="font-medium">{active.name}.</span> <span className="text-faint">{active.permanent ? "Permanent." : "Temporary."}</span> <span className="text-muted">{active.detail}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">No roles on this identity yet.</p>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {result.ladders.map((ladder) => (
          <li key={ladder.id} className="rounded-2xl bg-bg-subtle p-3 transition-colors hover:bg-bg-elevated">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tracking-widest text-faint uppercase">{ladder.label}</p>
                <p className="mt-1 truncate text-sm">{ladder.current ? <RoleChip pin={ladder.current} size="sm" /> : <span className="text-faint">Not started</span>}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">
              {ladder.value.toLocaleString("en-US")} {ladder.unit}
              {ladder.next && ladder.nextAt != null ? `. Next is ${ladder.next.name} at ${ladder.nextAt.toLocaleString("en-US")}.` : ". Top mark."}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-violet transition-[width] duration-500 ease-out"
                style={{ width: ladder.nextAt == null ? "100%" : `${Math.max(8, Math.min(100, Math.round((ladder.value / ladder.nextAt) * 100)))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

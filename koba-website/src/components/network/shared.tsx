import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Chip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Listing } from "@/site/catalog";
import { regionLabel } from "@/site/regions";

/**
 * `impact` plays a landing hit (micro-shake + particle burst) when the roll
 * finishes - reserved for the one or two spotlight numbers on a page (e.g.
 * the dashboard KOBA score), not every CountUp, so it doesn't turn into
 * visual noise.
 */
export function CountUp({ value, from, impact = false }: { value: number; from?: number; impact?: boolean }) {
  const origin = from ?? value;
  const [n, setN] = useState(origin);
  const [landed, setLanded] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const replay = !first.current;
    first.current = false;
    const gap = Math.abs(value - origin);
    if (reduce || replay || origin === value || gap > 80) {
      setN(value);
      return;
    }
    const started = performance.now();
    const duration = 380;
    let frame = 0;
    let land = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - p) ** 3;
      setN(Math.round(origin + (value - origin) * eased));
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else if (impact) {
        setLanded(true);
        land = window.setTimeout(() => setLanded(false), 320);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(land);
    };
  }, [origin, value, impact]);

  if (!impact) return <>{n.toLocaleString("en-US")}</>;

  return (
    <span className={`counter-roll-wrap ${landed ? "counter-impact" : ""}`}>
      {n.toLocaleString("en-US")}
      {landed ? (
        <span className="counter-burst" aria-hidden>
          {Array.from({ length: 6 }).map((_, index) => (
            <i key={index} style={{ "--i": index } as CSSProperties} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function PulseFrame({ live, children, className }: { live: boolean; children: ReactNode; className?: string }) {
  return <div className={cn("pulse-frame rounded-3xl", live && "is-live", className)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-3xl border border-border bg-bg-elevated p-4">
      <p className="font-mono text-xs text-faint">{label}</p>
      <p className="mt-2 text-2xl font-medium tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function ServerFace({ listing }: { listing: Listing }) {
  const wash =
    listing.gameId === "dayz"
      ? "color-mix(in oklab, var(--color-cyan) 16%, var(--color-bg-subtle))"
      : listing.style === "Hardcore"
        ? "color-mix(in oklab, var(--color-danger) 14%, var(--color-bg-subtle))"
        : "color-mix(in oklab, var(--color-ok) 14%, var(--color-bg-subtle))";
  return (
    <div className="flex h-16 items-end rounded-3xl bg-bg px-3 py-2" style={{ background: wash }}>
      <div>
        <p className="font-mono text-xs text-faint">{listing.game}</p>
        <p className="text-sm">{regionLabel(listing.region)}</p>
      </div>
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <Chip>{children}</Chip>;
}

/** Silhouette used wherever a player has no picture of their own. */
export function MysteryPerson({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="currentColor">
      <circle cx="24" cy="17" r="8.5" />
      <path d="M24 29c-9.4 0-17 6-17 15v4h34v-4c0-9-7.6-15-17-15Z" />
    </svg>
  );
}

export function PlayerFace({ name, size = "md", avatarUrl }: { name: string; id: string; size?: "sm" | "md" | "lg"; avatarUrl?: string }) {
  const box = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const silhouette = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-7 w-7";
  if (avatarUrl) {
    // The solid fill matters for transparent PNGs: without it whatever sits
    // behind the circle (a profile banner) shows through the cut-out.
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 rounded-full border border-border bg-bg-subtle object-cover ${box}`}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-bg-subtle text-faint ${box}`}
      role="img"
      aria-label={`${name} (no picture yet)`}
      title={name}
    >
      <MysteryPerson className={`${silhouette} translate-y-[15%]`} />
    </span>
  );
}

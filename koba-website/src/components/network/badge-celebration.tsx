import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { badgeArt } from "@/site/badge-art";
import { clearCelebrations, dismissCelebration, useCelebration } from "@/components/network/badge-events";

const CONFETTI_TONES = ["var(--color-fg)", "var(--color-muted)", "var(--color-faint)", "var(--color-border)"];

function pseudoRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function Confetti({ burst }: { burst: number }) {
  const pieces = Array.from({ length: 76 }, (_, index) => ({
    left: pseudoRandom(index + burst, 1) * 100,
    delay: pseudoRandom(index + burst, 2) * 900,
    duration: 2300 + pseudoRandom(index + burst, 3) * 1800,
    drift: (pseudoRandom(index + burst, 4) - 0.5) * 260,
    spin: 380 + pseudoRandom(index + burst, 5) * 980,
    tone: CONFETTI_TONES[index % CONFETTI_TONES.length]!,
  }));

  return (
    <div className="confetti-layer" aria-hidden>
      {pieces.map((piece, index) => (
        <span
          key={`${burst}-${index}`}
          className="confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              "--confetti-color": piece.tone,
              "--confetti-delay": `${piece.delay}ms`,
              "--confetti-duration": `${piece.duration}ms`,
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-spin": `${piece.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Mounted once by the app shell. Awards reach it through the queue in
 * badge-events, so the celebration follows the player across routes and fires
 * at the action that earned the badge - opening the profile grid is not
 * required, and no longer triggers it on its own.
 */
export function BadgeCelebration({ onView }: { onView?: () => void }) {
  const { badge, serial: burst, remaining } = useCelebration();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    setHost(document.body);
  }, []);

  useEffect(() => {
    if (!badge) {
      if (wasOpen.current) {
        wasOpen.current = false;
        previousFocus.current?.focus?.();
        previousFocus.current = null;
      }
      return;
    }
    if (!wasOpen.current) {
      wasOpen.current = true;
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    dialog.current?.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [badge, burst]);

  useEffect(() => {
    if (!badge) return;
    const timer = window.setTimeout(() => dismissCelebration(), 8000);
    return () => window.clearTimeout(timer);
  }, [badge, burst]);

  if (!host || !badge) return null;

  const close = () => clearCelebrations();
  const next = () => (remaining > 0 ? dismissCelebration() : clearCelebrations());
  const viewCollection = () => {
    clearCelebrations();
    if (onView) onView();
    else void navigate({ to: "/$", params: { _splat: "you" }, search: { tab: "profile" } });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="badge-celebration">
      <button
        type="button"
        aria-label="Dismiss badge celebration"
        className="absolute inset-0 bg-scrim/70 backdrop-blur-[2px]"
        onClick={close}
      />
      <div className="pointer-events-none absolute inset-0 z-10">
        <Confetti burst={burst} />
      </div>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-unlocked-title"
        aria-describedby="badge-unlocked-copy"
        onKeyDown={onKeyDown}
        className="badge-celebration-card relative z-20 max-h-[calc(100dvh-2rem)] w-full max-w-[22rem] overflow-y-auto rounded-3xl border border-border bg-bg-elevated p-6 text-center"
      >
        <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">KOBA · Badge unlocked</p>
        <div className="relative mt-5 grid h-32 place-items-center sm:h-36">
          <span className="badge-celebration-ring" aria-hidden />
          <span
            key={`${badge.badgeId}-${burst}`}
            className="badge-medal relative grid h-28 w-28 place-items-center sm:h-32 sm:w-32"
            data-tier={badge.tier}
            style={{ "--badge-art": `url(${badgeArt(badge.badgeId)})` } as CSSProperties}
          >
            <img src={badgeArt(badge.badgeId)} alt="" className="badge-art badge-rubberband" draggable={false} />
          </span>
        </div>
        <h2 id="badge-unlocked-title" className="mt-3 text-2xl font-semibold tracking-tight text-balance">
          {badge.displayName}
        </h2>
        <p id="badge-unlocked-copy" className="mt-1.5 text-sm leading-relaxed text-muted text-balance">
          {badge.description}
        </p>
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            data-autofocus
            onClick={viewCollection}
            className="brand-gradient h-11 rounded-full text-sm font-semibold text-black"
          >
            View collection
          </button>
          <button type="button" onClick={next} className="h-11 rounded-full text-sm text-muted hover:text-fg">
            {remaining > 0 ? `Next · ${remaining} more` : "Continue"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Saved to your profile · {remaining > 0 ? "more on the way" : "earned just now"}
        </p>
      </section>
    </div>,
    host,
  );
}

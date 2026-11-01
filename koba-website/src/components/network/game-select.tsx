import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { SUPPORTED_GAMES, type SupportedGame } from "@/site/games";

function GameIcon({ game, size = 30 }: { game: SupportedGame; size?: number }) {
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <img
        src={game.icon}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="block rounded-[7px] object-contain"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

/** Neutral tile for the "all games" filter, where no single title is selected. */
function AllGamesIcon({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[7px] border border-border bg-bg-elevated text-muted"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <LayoutGrid size={Math.round(size * 0.5)} />
    </span>
  );
}

/**
 * A launcher-style game picker: one flat list (no connector categories),
 * generous row height, real box art, and a quiet left accent on the active
 * row. Built in-app rather than a native <select> so the open list can carry
 * icons, labels and spacing on every platform.
 */
export function GameSelect({
  value,
  onChange,
  label = "Game",
  className = "",
  compact = false,
  allLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
  /** Tighter trigger for dense staff/business forms. */
  compact?: boolean;
  /** Adds an "all titles" row to the list (for filters such as Rankings). */
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, maxHeight: 416 });
  const root = useRef<HTMLDivElement>(null);
  const current = SUPPORTED_GAMES.find((game) => game.id === value) ?? (allLabel ? null : SUPPORTED_GAMES[0]!);
  const currentLabel = current?.name ?? allLabel ?? "Choose a game";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={root}>
      <button
        type="button"
        aria-label={`${label}: ${currentLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            // The picker sits low in the profile column. Open downward while
            // there is room, otherwise flip above the trigger, and cap the
            // panel to the space that actually exists in that direction.
            const rect = root.current?.getBoundingClientRect();
            if (rect) {
              const below = window.innerHeight - rect.bottom - 16;
              const above = rect.top - 16;
              const up = below < 300 && above > below;
              setPlacement({ up, maxHeight: Math.max(160, Math.min(416, up ? above : below)) });
            }
          }
          setOpen((next) => !next);
        }}
        className={`flex ${compact ? "h-10" : "h-12"} w-full items-center gap-3 rounded-xl border bg-bg px-3 text-left transition-colors ${
          open ? "border-fg/45" : "border-border hover:border-fg/30"
        }`}
      >
        {current ? <GameIcon game={current} size={compact ? 24 : 30} /> : <AllGamesIcon size={compact ? 24 : 30} />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{currentLabel}</span>
        <ChevronDown size={15} aria-hidden className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          style={{ maxHeight: placement.maxHeight }}
          className={`menu-pop game-picker-list absolute left-0 z-50 w-full min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg-elevated p-2 shadow-2xl sm:min-w-[20rem] ${
            placement.up ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"
          }`}
        >
          {allLabel ? (
            <>
              <button
                type="button"
                role="option"
                aria-selected={value === "all"}
                onClick={() => pick("all")}
                className={`flex w-full items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-left transition-colors ${
                  value === "all"
                    ? "border-fg bg-bg-subtle font-semibold text-fg"
                    : "border-transparent font-normal text-fg/80 hover:bg-bg-subtle hover:text-fg"
                }`}
              >
                <AllGamesIcon />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{allLabel}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-muted">Every supported title</span>
                </span>
                {value === "all" ? <Check size={15} aria-hidden className="shrink-0 text-fg" /> : null}
              </button>
              <div className="mx-3 my-1.5 h-px bg-border" />
            </>
          ) : (
            <p className="px-3 pt-1.5 pb-2 font-mono text-[10px] tracking-[0.18em] text-faint uppercase">All games</p>
          )}
          <div className="grid gap-0.5">
            {SUPPORTED_GAMES.map((game) => {
              const active = game.id === value;
              return (
                <button
                  key={game.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(game.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-fg bg-bg-subtle font-semibold text-fg"
                      : "border-transparent font-normal text-fg/80 hover:bg-bg-subtle hover:text-fg"
                  }`}
                >
                  <GameIcon game={game} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{game.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-muted">{game.devices.join(" · ")}</span>
                  </span>
                  {active ? <Check size={15} aria-hidden className="shrink-0 text-fg" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

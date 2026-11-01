import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Single-select dropdown for the Discover filters (Region, Mode), so each
 * category carries its own menu instead of a wrapping row of pills. Picking a
 * row applies it straight away - there is no draft/Apply step. The panel uses
 * the same launcher styling as GameSelect: generous rows, a quiet left accent
 * on the active row, and rounded corners.
 */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, maxHeight: 288 });
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.id === value) ?? options[0];

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

  return (
    <div className={`relative ${className}`} ref={root}>
      <button
        type="button"
        aria-label={`${label}: ${current?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open && root.current) {
            // Open downward when the menu fits, otherwise flip above the
            // trigger, and cap the panel to the space that actually exists -
            // a landscape phone has far less height than a desktop.
            const rect = root.current.getBoundingClientRect();
            const below = window.innerHeight - rect.bottom - 16;
            const above = rect.top - 16;
            const up = below < 300 && above > below;
            setPlacement({ up, maxHeight: Math.max(168, Math.min(320, up ? above : below)) });
          }
          setOpen((next) => !next);
        }}
        className={`flex h-12 w-full items-center gap-2 rounded-xl border bg-bg px-3 text-left transition-colors ${
          open ? "border-fg/45" : "border-border hover:border-fg/30"
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{current?.label}</span>
        <ChevronDown
          size={15}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          style={{ maxHeight: placement.maxHeight }}
          className={`menu-pop game-picker-list absolute right-0 left-0 z-50 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg-elevated p-1.5 shadow-2xl ${
            placement.up ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"
          }`}
        >
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? "border-fg bg-bg-subtle font-semibold text-fg"
                    : "border-transparent font-normal text-fg/80 hover:bg-bg-subtle hover:text-fg"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active ? <Check size={15} aria-hidden className="shrink-0 text-fg" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

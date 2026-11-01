import { forwardRef, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

const HINTS = [
  "Search players, clans, servers…",
  'Try "Rust Solo/Duo"',
  'Try "ARK PvP"',
  'Try "DayZ vanilla"',
];

/**
 * The one search field in the app. It sits in the top bar on every screen, and
 * Discover reads its value directly — no second input lives on the page.
 */
export const GlobalSearch = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (value: string) => void; onSubmit: () => void }
>(function GlobalSearch({ value, onChange, onSubmit }, ref) {
  const [hint, setHint] = useState(0);
  const [focused, setFocused] = useState(false);
  const local = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focused || value) return;
    const timer = window.setInterval(() => setHint((index) => (index + 1) % HINTS.length), 4200);
    return () => window.clearInterval(timer);
  }, [focused, value]);

  return (
    <label
      className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border bg-bg-elevated px-4 transition-colors ${
        focused ? "border-fg/40" : "border-border"
      }`}
    >
      <Search size={16} className="shrink-0 text-muted" aria-hidden />
      <input
        ref={(node) => {
          local.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        type="text"
        enterKeyHint="search"
        placeholder={HINTS[hint]}
        aria-label="Search players, clans and servers"
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint sm:text-sm"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            local.current?.focus();
          }}
          aria-label="Clear search"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:text-fg"
        >
          <X size={15} />
        </button>
      ) : (
        <span className="ml-auto hidden shrink-0 font-mono text-[11px] text-faint lg:inline">Ctrl K</span>
      )}
    </label>
  );
});

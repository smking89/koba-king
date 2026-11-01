import { Monitor, Moon, Sun } from "lucide-react";
import { toggleTheme, useThemeMode, type ThemeMode } from "@/site/theme";

/**
 * One-tap switch for the top bar. The sun/moon glyph is picked by CSS from
 * `data-theme`, so the right icon is visible before hydration.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch between light and dark mode"
      title="Light / dark mode"
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-fg ${className}`}
    >
      <Sun size={18} className="theme-icon-sun" aria-hidden />
      <Moon size={18} className="theme-icon-moon" aria-hidden />
    </button>
  );
}

const OPTIONS: { id: ThemeMode; label: string; detail: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", detail: "Bright canvas, ink type.", icon: Sun },
  { id: "dark", label: "Dark", detail: "The KOBA default.", icon: Moon },
  { id: "system", label: "System", detail: "Follow this device.", icon: Monitor },
];

/** Appearance card inside Settings - offers all three modes, not just a flip. */
export function ThemeChoice() {
  const [mode, setMode] = useThemeMode();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(option.id)}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
              active ? "border-fg bg-fg text-bg" : "border-border bg-bg text-fg hover:border-fg/40"
            }`}
          >
            <Icon size={17} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className={`block text-xs ${active ? "text-bg/70" : "text-muted"}`}>{option.detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

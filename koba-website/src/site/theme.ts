import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "koba-theme";
export const THEME_EVENT = "koba:theme";

const ORDER: ThemeMode[] = ["light", "dark", "system"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? systemTheme() : mode;
}

/** Relative luminance of a CSS colour (hex or rgb[a]), or null when unparseable. */
export function paletteLuminance(color: string): number | null {
  const value = color.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const raw = hex[1]!.length === 3 ? hex[1]!.split("").map((c) => c + c).join("") : hex[1]!;
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16) / 255);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (!rgb) return null;
  const [r, g, b] = rgb[1]!.split(",").map((part) => parseFloat(part) / 255);
  if ([r, g, b].some((part) => Number.isNaN(part))) return null;
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const THEME_REPAIR_KEY = "koba-theme-repair";

/**
 * A tab can outlive the stylesheet it loaded: a long-lived tab or a dev-server
 * restart leaves the old CSS in place, so flipping `data-theme` to light keeps
 * painting the dark palette however often it is clicked. Compare what the
 * palette actually resolves to against the theme that was just asked for, and
 * reload once (guarded per session) so the browser fetches current CSS.
 *
 * Dev only: production assets are content-hashed and immutable, so a mismatch
 * there would mean a real styling bug, not a stale tab - never reload at users.
 */
export function repairThemeStyles(resolved: ResolvedTheme = resolveTheme(readThemeMode())) {
  if (typeof window === "undefined") return;
  if (!import.meta.env?.DEV) return;
  requestAnimationFrame(() => {
    const canvas = getComputedStyle(document.documentElement).getPropertyValue("--color-bg");
    const luminance = paletteLuminance(canvas);
    if (luminance === null) return; // palette not parsed yet - nothing to judge
    const paintsLight = luminance > 0.6;
    if (paintsLight === (resolved === "light")) return;
    try {
      if (window.sessionStorage.getItem(THEME_REPAIR_KEY) === resolved) return;
      window.sessionStorage.setItem(THEME_REPAIR_KEY, resolved);
    } catch {
      return;
    }
    window.location.reload();
  });
}

/** Paints the document and tells every mounted control the resolved theme changed. */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "light" ? "#ffffff" : "#000000");
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { mode, resolved } }));
  repairThemeStyles(resolved);
}

export function setThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private mode / blocked storage - the theme still applies for this page.
  }
  applyTheme(mode);
}

/** Flips between the two explicit themes. Used by the one-tap header toggle. */
export function toggleTheme() {
  const current = typeof document === "undefined" ? "dark" : document.documentElement.dataset.theme;
  setThemeMode(current === "light" ? "dark" : "light");
}

/** Resolved theme for the current page, kept in sync with toggles and OS changes. */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const read = () => {
      const value = document.documentElement.dataset.theme;
      setTheme(value === "light" ? "light" : "dark");
    };
    read();
    window.addEventListener(THEME_EVENT, read);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onMedia = () => {
      if (readThemeMode() === "system") applyTheme("system");
      read();
    };
    media.addEventListener("change", onMedia);
    repairThemeStyles();
    return () => {
      window.removeEventListener(THEME_EVENT, read);
      media.removeEventListener("change", onMedia);
    };
  }, []);

  return theme;
}

/** Mode (not resolved theme) for controls that offer Light / Dark / System. */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    setMode(readThemeMode());
    repairThemeStyles();
    const read = () => setMode(readThemeMode());
    window.addEventListener(THEME_EVENT, read);
    return () => window.removeEventListener(THEME_EVENT, read);
  }, []);

  return [mode, setThemeMode];
}

export function nextTheme(mode: ThemeMode): ThemeMode {
  return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
}

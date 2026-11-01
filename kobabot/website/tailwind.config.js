/**
 * KOBABOT DESIGN SYSTEM — Tailwind mapping
 * Mirrors tokens.css 1:1 so both systems stay in sync. Import tokens.css in
 * your global stylesheet (for the CSS-variable values) and this config in
 * tailwind.config.js (for the utility classes: bg-bb-green, shadow-bb-glow-md…).
 */

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{html,js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    screens: {
      sm: "480px",   // large phones
      md: "768px",   // tablets / nav-collapse prep
      lg: "1024px",  // desktop nav + multi-column
      xl: "1280px",  // desktop max width
      "2xl": "1536px", // wide monitors
    },
    extend: {
      colors: {
        bb: {
          green: "#39FF6A",
          "green-strong": "#14FF72",
          "green-dim": "#1FAE52",
          purple: "#B14CFF",
          "purple-strong": "#D24CFF",
          "purple-dim": "#7B2FB8",
          gold: "#FFC93C",
          "gold-strong": "#FFDD6B",

          void: "#05070A",
          base: "#0A0F0D",
          raised: "#0D1512",
          "raised-2": "#101A16",

          "text-primary": "#F3FFF6",
          "text-secondary": "#9FB8AC",
          "text-muted": "#5E7368",
          "text-on-accent": "#04140A",

          danger: "#FF4C5E",
          info: "#4CD3FF",
        },
      },
      borderColor: {
        "bb-subtle": "rgba(57, 255, 106, 0.14)",
        "bb-default": "rgba(57, 255, 106, 0.32)",
        "bb-strong": "rgba(57, 255, 106, 0.60)",
        "bb-purple": "rgba(177, 76, 255, 0.45)",
        "bb-gold": "rgba(255, 201, 60, 0.45)",
      },
      fontFamily: {
        display: ["Rajdhani", "Orbitron", "Sora", "sans-serif"],
        body: ["Inter", "Sora", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        md: "1.125rem",
        lg: "1.375rem",
        xl: "1.75rem",
        "2xl": "2.25rem",
        "3xl": "3rem",
        "4xl": "4rem",
      },
      letterSpacing: {
        tightbb: "-0.01em",
        wide: "0.04em",
        widest: "0.12em",
      },
      borderRadius: {
        sm: "8px",
        md: "14px",
        lg: "20px",
        xl: "28px",
        pill: "999px",
      },
      boxShadow: {
        "bb-sm": "0 2px 8px rgba(0,0,0,0.35)",
        "bb-md": "0 8px 24px rgba(0,0,0,0.45)",
        "bb-lg": "0 16px 48px rgba(0,0,0,0.55)",
        "bb-glow-green-sm": "0 0 8px rgba(57,255,106,0.35)",
        "bb-glow-green-md": "0 0 20px rgba(57,255,106,0.45), 0 0 2px rgba(57,255,106,0.8) inset",
        "bb-glow-green-lg": "0 0 40px rgba(57,255,106,0.55)",
        "bb-glow-purple-sm": "0 0 8px rgba(177,76,255,0.40)",
        "bb-glow-purple-md": "0 0 20px rgba(177,76,255,0.50), 0 0 2px rgba(177,76,255,0.85) inset",
        "bb-glow-gold-sm": "0 0 8px rgba(255,201,60,0.40)",
        "bb-glow-gold-md": "0 0 20px rgba(255,201,60,0.50)",
      },
      backgroundImage: {
        "bb-hero": "radial-gradient(120% 120% at 20% 0%, #10231A 0%, #05070A 55%)",
        "bb-card": "linear-gradient(180deg, rgba(16,26,22,0.9) 0%, rgba(8,12,10,0.9) 100%)",
        "bb-cta-green": "linear-gradient(180deg, #4CFF82 0%, #21D65E 100%)",
        "bb-cta-purple": "linear-gradient(180deg, #CE6BFF 0%, #9B33E6 100%)",
        "bb-badge-gold": "linear-gradient(180deg, #FFE08A 0%, #FFC93C 60%, #C98B12 100%)",
      },
      spacing: {
        18: "4.5rem",
      },
      transitionTimingFunction: {
        "bb-out": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      animation: {
        "bb-pulse": "bbPulse 2.4s infinite",
      },
      keyframes: {
        bbPulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(57,255,106,0.55)" },
          "70%": { boxShadow: "0 0 0 8px rgba(57,255,106,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(57,255,106,0)" },
        },
      },
      zIndex: {
        nav: "100",
        dropdown: "200",
        modal: "300",
        toast: "400",
      },
    },
  },
  // No addComponents plugin here on purpose: components.css is the single
  // source of truth for bb-* component classes (bb-btn, bb-card, bb-panel…).
  // This config only supplies Tailwind *utility* classes (bg-bb-green,
  // shadow-bb-glow-md, lg:, etc.) — duplicating components here previously
  // drifted out of sync with components.css (missing bb-card--pro/--max).
  plugins: [],
};

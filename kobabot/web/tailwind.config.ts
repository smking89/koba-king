import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#05080E",
        panel: "rgba(13, 20, 32, 0.75)",
        "panel-solid": "#0D1420",
        line: "rgba(0, 255, 127, 0.16)",
        lime: {
          DEFAULT: "#00FF7F",
          dim: "#0F5C3A",
        },
        cyan: {
          DEFAULT: "#00E5FF",
        },
        magenta: {
          DEFAULT: "#D946EF",
        },
        ink: "#F2F6F5",
        "ink-dim": "#8FA0A8",
      },
      fontFamily: {
        display: ["var(--font-display)", "Arial Black", "Impact", "sans-serif"],
        body: ["var(--font-body)", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-lime": "0 0 25px rgba(0, 255, 127, 0.55)",
        "glow-lime-sm": "0 0 14px rgba(0, 255, 127, 0.4)",
        "glow-magenta": "0 0 25px rgba(217, 70, 239, 0.55)",
        "glow-cyan": "0 0 20px rgba(0, 229, 255, 0.5)",
      },
      keyframes: {
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        "trace-dash": {
          to: { "stroke-dashoffset": "0" },
        },
        "dash-flow": {
          from: { "stroke-dashoffset": "0" },
          to: { "stroke-dashoffset": "-20" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 200%" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "spin-slow": "spin-slow 20s linear infinite",
        float: "float 3.5s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.2, 0.7, 0.4, 1) infinite",
        trace: "trace-dash 1.2s linear forwards",
        shimmer: "shimmer 3s linear infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;

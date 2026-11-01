"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, CheckCheck, Loader2, ChevronRight, Zap, Crown } from "lucide-react";
import type { Plan } from "@/lib/mock-data";
import { GlowFrame } from "./GlowFrame";

const TIER_STYLE = {
  basic: {
    frame: "#00FF7F" as const,
    nameClass: "text-ink",
    glow: "drop-shadow(0 0 4px rgba(0,255,127,0.15))",
    glowHover: "drop-shadow(0 0 25px #00FF7F)",
    chestColor: "#00FF7F", // matches the green chest art
    button:
      "border border-lime/30 text-lime bg-transparent hover:bg-lime/10 hover:border-lime/60 disabled:opacity-40 disabled:hover:bg-transparent",
    badgeBg: "",
  },
  pro: {
    // The reference's Pro card border is a green->cyan gradient, not a
    // flat color like Basic/Max - a flat stroke here read noticeably less
    // vibrant than the actual mockup.
    frame: { from: "#00FF7F", to: "#00E5FF" },
    nameClass: "text-lime text-glow-lime",
    glow: "drop-shadow(0 0 8px rgba(0,255,127,0.35))",
    glowHover: "drop-shadow(0 0 25px #00FF7F)",
    chestColor: "#FFD24C", // matches the gold chest art, not the green brand accent
    button: "bg-lime text-[#05080E] font-bold shadow-glow-lime hover:shadow-[0_0_35px_rgba(0,255,127,0.8)] disabled:opacity-40",
    badgeBg: "bg-magenta text-white",
  },
  max: {
    frame: "#D946EF" as const,
    nameClass: "text-magenta text-glow-magenta",
    glow: "drop-shadow(0 0 8px rgba(217,70,239,0.35))",
    glowHover: "drop-shadow(0 0 25px #D946EF)",
    chestColor: "#D946EF", // matches the purple chest art
    button: "border border-magenta text-magenta bg-transparent hover:bg-magenta/10 hover:shadow-glow-magenta disabled:opacity-40",
    badgeBg: "bg-magenta text-white",
  },
} as const;

/** Small decorative coin cluster behind the chest art - a cheap stand-in for
    the reference's rendered coin-pile graphic, since no such asset exists
    in this repo yet (see the PR notes on asset gaps). */
function CoinCluster({ color }: { color: string }) {
  const coins = [
    { x: "8%", y: "62%", s: 22 },
    { x: "78%", y: "58%", s: 26 },
    { x: "20%", y: "78%", s: 18 },
    { x: "66%", y: "80%", s: 20 },
    { x: "45%", y: "86%", s: 16 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none">
      {coins.map((c, i) => (
        <span
          key={i}
          className="absolute rounded-full border-2"
          style={{ left: c.x, top: c.y, width: c.s, height: c.s, borderColor: color, background: `${color}33` }}
        />
      ))}
    </div>
  );
}

/**
 * Animated lightning behind each chest - a pulsing radial glow plus 2-3
 * flickering bolt strokes, colored to match THAT chest's own art (gold
 * behind the gold chest, purple behind the purple chest) rather than a
 * single brand color reused everywhere.
 */
function ChestLightning({ color }: { color: string }) {
  const bolts = [
    { path: "M52 8 L38 46 L54 46 L44 92", x: 18, y: 4, delay: 0 },
    { path: "M52 8 L38 46 L54 46 L44 92", x: 74, y: 10, delay: 0.35, scale: -1 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none">
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: color }}
        animate={{ opacity: [0.15, 0.4, 0.15] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      {bolts.map((b, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 100 100"
          className="absolute h-10 w-6"
          style={{ left: b.x, top: b.y, transform: b.scale ? `scaleX(${b.scale})` : undefined }}
          animate={{ opacity: [0, 1, 0.2, 1, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: b.delay, ease: "linear" }}
        >
          <path d={b.path} fill="none" stroke={color} strokeWidth="8" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </motion.svg>
      ))}
    </div>
  );
}

export function PricingCard({ plan, disabled = false }: { plan: Plan; disabled?: boolean }) {
  const style = TIER_STYLE[plan.id];
  const [pending, setPending] = useState(false);

  function handleSelect() {
    if (disabled || pending) return;
    // No checkout backend wired up yet (see lib/mock-data.ts header) - this
    // simulates the Loading state the real flow will need so the button's
    // states are all styled/demoable now instead of only in the abstract.
    setPending(true);
    setTimeout(() => setPending(false), 1200);
  }

  return (
    <GlowFrame
      color={style.frame}
      className={`glass border border-white/10 p-6 ${plan.badge ? "pt-10" : ""} flex flex-col ${plan.id === "pro" ? "lg:scale-105 lg:z-10" : ""}`}
    >
      {plan.badge && (
        <span className={`absolute top-4 left-6 z-30 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${style.badgeBg}`}>
          <Crown size={12} className="fill-current" /> {plan.badge}
        </span>
      )}

      <div className="mb-3 relative z-10">
        <h3 className={`font-display font-black uppercase text-3xl tracking-tight ${style.nameClass}`}>{plan.name}</h3>
        <p className="text-ink-dim text-sm mt-1">{plan.tagline}</p>
      </div>

      <motion.div
        className="relative mx-auto my-2 h-32 w-32 z-10"
        variants={{ rest: { y: 0, filter: style.glow }, hover: { y: -8, filter: style.glowHover } }}
        transition={{ duration: 0.35 }}
      >
        <ChestLightning color={style.chestColor} />
        <CoinCluster color={style.chestColor} />
        <Image src={plan.chestImage} alt="" fill className="object-contain relative z-10" sizes="128px" />
        <motion.span
          className="absolute -top-1 -right-1 z-20"
          variants={{ rest: { opacity: 0.4, scale: 0.9 }, hover: { opacity: 1, scale: 1.15 } }}
          transition={{ duration: 0.25 }}
        >
          <Zap size={20} className="drop-shadow-[0_0_6px_currentColor]" style={{ color: style.chestColor }} fill={style.chestColor} />
        </motion.span>
      </motion.div>

      <div className="mb-1 flex items-baseline gap-1 relative z-10">
        <span className="font-display font-black text-3xl">{plan.price}</span>
        <span className="text-ink-dim text-sm">{plan.period}</span>
      </div>
      <div className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-lime/10 border border-lime/30 px-2.5 py-1 text-xs font-bold text-lime relative z-10">
        {plan.coins}
      </div>

      <ul className="mb-6 flex-1 space-y-2.5 text-sm relative z-10">
        {plan.inherits && (
          <li className="flex items-start gap-2 text-ink font-semibold">
            <CheckCheck size={16} className={plan.id === "max" ? "text-magenta shrink-0 mt-0.5" : "text-cyan shrink-0 mt-0.5"} />
            {plan.inherits}
          </li>
        )}
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-ink-dim">
            <Check size={16} className="text-lime shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={disabled || pending}
        onClick={handleSelect}
        className={`relative z-10 rounded-full w-full py-3 text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${style.button}`}
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Processing…
          </>
        ) : (
          <>
            {plan.cta} <ChevronRight size={16} />
          </>
        )}
      </button>
    </GlowFrame>
  );
}

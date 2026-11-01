"use client";

import { motion } from "framer-motion";
import { ReactNode, useId } from "react";

type FrameColor = string | { from: string; to: string };

/**
 * The ONE animated-border treatment used everywhere a "frame" appears
 * (pricing cards) - previously each spot had its own slightly different
 * version of this, which read as inconsistent. Three coordinated layers:
 *  1. an always-on animated dashed "current" tracing the perimeter
 *  2. a solid glow line that brightens on hover
 *  3. a brief bright flash + scale pop on click/tap (whileTap), so
 *     selecting a card visibly "activates" its frame instead of nothing
 *     happening until the page navigates.
 *
 * `color` accepts either a flat hex (Basic/Max, matching the reference's
 * single-tone borders) or a {from,to} pair for a real gradient stroke
 * (Pro, matching the reference's green->cyan two-tone border - a flat
 * color there read as visually flatter than the actual mockup).
 */
export function GlowFrame({ color, className = "", children }: { color: FrameColor; className?: string; children: ReactNode }) {
  const gradId = useId();
  const isGradient = typeof color !== "string";
  const stroke = isGradient ? `url(#${gradId})` : color;
  const solidColor = isGradient ? color.to : color;

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      initial="rest"
      whileHover="hover"
      whileTap="tap"
      animate="rest"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full rounded-[inherit] z-20" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
        {isGradient && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.from} />
              <stop offset="100%" stopColor={color.to} />
            </linearGradient>
          </defs>
        )}
        <rect
          x="0.5"
          y="0.5"
          width="99"
          height="99"
          rx="4"
          stroke={stroke}
          strokeWidth="0.6"
          strokeDasharray="6 4"
          className="animate-[dash-flow_1.4s_linear_infinite]"
          opacity="0.6"
        />
        <motion.rect
          x="0.5"
          y="0.5"
          width="99"
          height="99"
          rx="4"
          stroke={stroke}
          strokeWidth="1.4"
          variants={{ rest: { opacity: 0.4 }, hover: { opacity: 1 }, tap: { opacity: 1, strokeWidth: 2.4 } }}
          transition={{ duration: 0.2 }}
          style={{ filter: `drop-shadow(0 0 6px ${solidColor})` }}
        />
      </svg>
      <motion.div
        className="absolute inset-0 z-10 pointer-events-none"
        variants={{ rest: { opacity: 0 }, hover: { opacity: 0.12 }, tap: { opacity: 0.28 } }}
        transition={{ duration: 0.2 }}
        style={{ background: solidColor }}
      />
      {children}
    </motion.div>
  );
}

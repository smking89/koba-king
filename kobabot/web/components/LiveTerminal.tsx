"use client";

import { motion } from "framer-motion";
import { liveLogs } from "@/lib/mock-data";

export function LiveTerminal({ compact = false }: { compact?: boolean }) {
  const lines = compact ? liveLogs.slice(-6) : liveLogs;
  return (
    <div className="glass scanlines overflow-hidden glow-border-lime">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-xs text-ink-dim">
        <span className="flex items-center gap-2 text-lime">
          <span className="h-2 w-2 rounded-full bg-lime shadow-glow-lime-sm" /> Server Logs (Live)
        </span>
        <span className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink-dim/40" />
          <span className="h-2 w-2 rounded-full bg-ink-dim/40" />
          <span className="h-2 w-2 rounded-full bg-ink-dim/40" />
        </span>
      </div>
      <div className={`p-4 font-mono text-[12.5px] leading-relaxed ${compact ? "max-h-[180px]" : "max-h-[260px]"} overflow-hidden`}>
        {lines.map((line, i) => (
          <motion.div
            key={line.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="flex gap-2"
          >
            <span className="text-ink-dim/60">[{line.kind.toUpperCase()}]</span>
            {/* Alternating cyan/lime per line, matching the reference's
                rhythm - not colored by message "kind" as before. */}
            <span className={i % 2 === 0 ? "text-cyan" : "text-lime"}>{line.text}</span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: lines.length * 0.08 + 0.2 }}
          className="mt-1 text-lime"
        >
          &gt; Server running<span className="animate-pulse">_</span>
        </motion.div>
      </div>
    </div>
  );
}

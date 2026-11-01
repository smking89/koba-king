"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";

/**
 * Mobile-only sub-page header (back chevron + title + optional right-side
 * icon) - the reference shows this on every screen except Home, which
 * gets the hamburger+bell treatment instead (see MobileHomeTopBar). This
 * is IN ADDITION to the persistent bottom nav (see BottomNav), not a
 * replacement for it - the bottom nav already never disappears on any
 * screen, including this one.
 */
export function MobileHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <div className="lg:hidden flex items-center gap-3 mb-4">
      <Link href="/" className="shrink-0 rounded-full border border-line p-2 text-ink-dim hover:text-ink">
        <ChevronLeft size={18} />
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-ink-dim truncate">{eyebrow}</p>
        <h1 className="font-display font-black uppercase text-lg leading-none">{title}</h1>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * Fixed 5-icon bottom nav - persistent on EVERY primary screen, including
 * /support (the screen that used to strand users behind a top-left back
 * arrow instead of real nav). Visible up to `lg`, where TopNav takes over.
 * The active item gets a bordered pill/box around it, matching the
 * reference (not just a color change on bare icon+label).
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-[var(--bottomnav-h)] glass rounded-none border-t border-line border-x-0 border-b-0 flex items-center justify-around px-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl mx-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              active ? "text-lime border border-lime/40 bg-lime/10" : "text-ink-dim border border-transparent hover:text-ink"
            }`}
          >
            <item.icon size={20} strokeWidth={2.2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Link2, Users } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { StatusDot } from "./StatusDot";
import { serverStatus } from "@/lib/mock-data";

/**
 * Desktop-only persistent top bar - hidden below `lg` where BottomNav (a
 * fixed 5-icon strip, also persistent on every page including Support)
 * takes over as the primary nav. Never a sidebar, per explicit direction.
 * Matches the reference layout: icon-over-label nav items (not inline),
 * two separate status pill chips, a bordered "Connect WebRCON" CTA.
 */
export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="hidden lg:flex fixed top-0 left-0 right-0 z-50 h-[var(--topbar-h)] items-center gap-6 px-8 glass rounded-none border-b border-line border-x-0 border-t-0">
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <Image src="/brand/icon-mark.png" alt="" width={36} height={36} className="h-9 w-9" style={{ width: "auto" }} />
        <span className="leading-tight">
          <span className="block font-display font-black uppercase text-lg tracking-tight">
            Kobabot<span className="text-gradient-brand">.store</span>
          </span>
          <span className="block text-[10px] uppercase tracking-widest text-ink-dim">Rust Console Edition | Server Tools | Unlock More</span>
        </span>
      </Link>

      <nav className="flex items-center gap-7 text-[11px] font-bold uppercase tracking-wide ml-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 transition-colors ${active ? "text-lime" : "text-ink-dim hover:text-ink"}`}
            >
              <item.icon size={18} strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="hidden xl:flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[11px] font-mono">
        <span className="text-ink-dim uppercase tracking-wider">Server Status</span>
        <span className="flex items-center gap-1.5 font-bold text-lime">
          <StatusDot online={serverStatus.online} />
          {serverStatus.online ? "Online" : "Offline"}
        </span>
      </div>
      <div className="hidden xl:flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[11px] font-mono text-ink-dim">
        <Users size={13} className="text-cyan" />
        Rust Console Edition
        <span className="h-3 w-px bg-line" />
        <span className="text-ink font-bold">{serverStatus.players.toLocaleString()}</span> Players
      </div>

      <button className="flex items-center gap-2 rounded-full border border-lime/50 text-lime font-bold text-xs uppercase tracking-wide px-5 py-2.5 hover:bg-lime/10 transition-colors glow-border-lime">
        <Link2 size={14} /> Connect WebRCON
      </button>
    </header>
  );
}

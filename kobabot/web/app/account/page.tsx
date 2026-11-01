import Image from "next/image";
import { Server, Receipt, Crown, Settings, HelpCircle, ChevronRight, Lock } from "lucide-react";
import { StatusDot } from "@/components/StatusDot";
import { MobileHeader } from "@/components/MobileHeader";
import { account } from "@/lib/mock-data";

const ROWS = [
  { icon: Server, label: "My Servers" },
  { icon: Receipt, label: "Purchase History" },
  { icon: Crown, label: "VIP Perks" },
  { icon: Settings, label: "Settings" },
  { icon: HelpCircle, label: "Help & Support" },
];

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 lg:px-8 space-y-6">
      <MobileHeader eyebrow="Manage your profile" title="Account" right={<Lock size={16} className="text-ink-dim" />} />
      <section className="glass p-6">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden border border-magenta/40">
            <Image src="/assets/mascot-discord.png" alt="" fill sizes="64px" className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-lg">
              {account.name} <span className="text-ink-dim font-normal text-sm">{account.tag}</span>
            </p>
            <p className="flex items-center gap-1.5 text-xs text-lime">
              <StatusDot online={account.online} /> Online
            </p>
          </div>
          <span className="ml-auto rounded-xl bg-magenta/15 border border-magenta/40 text-magenta text-[11px] font-bold uppercase px-3 py-1.5">
            {account.tier}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-3 divide-x divide-line text-center">
          {[
            { label: "Servers", value: account.stats.servers },
            { label: "Active", value: account.stats.active },
            { label: "Total Players", value: account.stats.totalPlayers },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center justify-center px-2">
              <p className="font-mono font-black text-xl lg:text-2xl text-lime">{s.value}</p>
              <p className="text-[11px] uppercase tracking-wide text-ink-dim">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl divide-y divide-line">
        {ROWS.map((r) => (
          <button key={r.label} className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition-colors">
            <span className="rounded-xl bg-lime/10 border border-lime/30 p-2.5 text-lime shrink-0">
              <r.icon size={16} />
            </span>
            <span className="flex-1 text-sm font-bold">{r.label}</span>
            <ChevronRight size={16} className="text-ink-dim" />
          </button>
        ))}
      </section>

      <div className="text-center py-4">
        <p className="font-display font-black uppercase text-lg">
          Kobabot<span className="text-gradient-brand">.store</span>
        </p>
        <p className="text-[11px] uppercase tracking-widest text-ink-dim mt-1">Rust Console Edition</p>
      </div>
    </div>
  );
}

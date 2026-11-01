import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Ticket, HelpCircle, MessageSquare } from "lucide-react";
import { MobileHeader } from "@/components/MobileHeader";
import { supportChannels } from "@/lib/mock-data";

const ICONS = { chat: MessageCircle, ticket: Ticket, faq: HelpCircle, discord: MessageSquare } as const;

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 lg:px-8 space-y-6">
      <MobileHeader eyebrow="We're here to help" title="Support" />
      <section className="glass p-6 flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <Image src="/assets/mascot.png" alt="" fill sizes="112px" className="object-contain" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">We&apos;re here to help</p>
          <h1 className="font-display font-black uppercase text-xl lg:text-2xl mt-1 text-lime text-glow-lime">Need Help?</h1>
          <p className="text-ink-dim text-sm mt-1">Our team is here 24/7 to assist you.</p>
        </div>
      </section>

      <section className="glass rounded-2xl divide-y divide-line">
        {supportChannels.map((c) => {
          const Icon = ICONS[c.icon];
          return (
            <button key={c.title} className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition-colors">
              <span className="rounded-xl bg-lime/10 border border-lime/30 p-2.5 text-lime shrink-0">
                <Icon size={18} />
              </span>
              <span className="flex-1">
                <p className="text-sm font-bold">{c.title}</p>
                <p className="text-xs text-ink-dim">{c.blurb}</p>
              </span>
            </button>
          );
        })}
      </section>

      <Link
        href="https://discord.gg"
        className="flex items-center justify-center gap-2 rounded-2xl border border-magenta text-magenta font-bold text-sm uppercase tracking-wide py-3.5 hover:bg-magenta/10 hover:shadow-glow-magenta transition-all"
      >
        <MessageSquare size={16} /> Join Our Discord
      </Link>

      <div className="text-center py-4">
        <p className="font-display font-black uppercase text-lg">
          Kobabot<span className="text-gradient-brand">.store</span>
        </p>
        <p className="text-[11px] uppercase tracking-widest text-ink-dim mt-1">Built for Rust. Powered by You.</p>
      </div>
    </div>
  );
}

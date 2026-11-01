import Image from "next/image";
import Link from "next/link";
import { Menu, Bell, Zap, TrendingUp, Users, Crown, Layers, Wrench, Headset, Gamepad2, ShoppingBag, Server, LifeBuoy, User } from "lucide-react";
import { LiveTerminal } from "@/components/LiveTerminal";
import { PricingCard } from "@/components/PricingCard";
import { StatusDot } from "@/components/StatusDot";
import { plans, serverStatus } from "@/lib/mock-data";

const FEATURE_STRIP = [
  { icon: Zap, label: "Automate", sub: "Save Time", color: "text-lime bg-lime/10 border-lime/30" },
  { icon: TrendingUp, label: "Grow", sub: "Your Community", color: "text-cyan bg-cyan/10 border-cyan/30" },
  { icon: Users, label: "Engage", sub: "Your Players", color: "text-magenta bg-magenta/10 border-magenta/30" },
  { icon: Crown, label: "Level Up", sub: "Your Server", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
];

const QUICK_ACCESS = [
  { href: "/shop", icon: ShoppingBag, label: "Shop" },
  { href: "/servers", icon: Server, label: "Servers" },
  { href: "/support", icon: LifeBuoy, label: "Support" },
  { href: "/account", icon: User, label: "Account" },
];

const SIDE_ACTIONS = [
  { label: "AutoKit", color: "text-lime border-lime/40" },
  { label: "Economy", color: "text-cyan border-cyan/40" },
  { label: "Marketplace", color: "text-lime border-lime/40" },
  { label: "Auction", color: "text-cyan border-cyan/40" },
  { label: "Clan Wars", color: "text-magenta border-magenta/40" },
  { label: "+ More", color: "text-ink-dim border-line" },
];

const WHY_STRIP = [
  { icon: Layers, title: "Full Modular System", sub: "Everything you need in one platform." },
  { icon: Wrench, title: "Easy Setup", sub: "Get running in minutes." },
  { icon: Headset, title: "24/7 Support", sub: "We're here when you need us." },
  { icon: Gamepad2, title: "Built for Rust", sub: "Optimized for Console Edition." },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-8 space-y-6 lg:space-y-8">
      {/* ---------- MOBILE-only top row: hamburger + wordmark + bell ---------- */}
      <div className="lg:hidden flex items-center justify-between">
        <button className="rounded-full border border-line p-2 text-ink-dim" aria-label="Menu">
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/brand/icon-mark.png" alt="" width={28} height={28} className="h-7 w-7" style={{ width: "auto" }} />
          <span className="leading-tight">
            <span className="block font-display font-black uppercase text-sm">
              Kobabot<span className="text-gradient-brand">.store</span>
            </span>
            <span className="block text-[9px] uppercase tracking-widest text-ink-dim">Rust Console Edition</span>
          </span>
        </div>
        <button className="relative rounded-full border border-line p-2 text-ink-dim" aria-label="Notifications">
          <Bell size={18} />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-magenta text-[9px] font-bold flex items-center justify-center text-white">1</span>
        </button>
      </div>

      {/* ---------- MOBILE hero ---------- */}
      <section className="lg:hidden glass p-5 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full bg-lime/10 border border-lime/30 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-lime">
          <StatusDot online={serverStatus.online} />
          Server Status: Online
          <span className="text-ink-dim font-normal normal-case">· {serverStatus.players.toLocaleString()} players</span>
        </div>

        <div className="relative mx-auto mb-4 h-64 w-64">
          <div className="absolute inset-0 -z-10 rounded-full bg-lime/25 blur-3xl" />
          <Image src="/assets/mascot.png" alt="KOBA Bot mascot" fill sizes="256px" className="object-contain" />
        </div>

        <h1 className="font-display font-black uppercase text-2xl leading-tight">Work smarter with</h1>
        <p className="font-marker text-4xl text-gradient-brand -rotate-1 mt-1">Kobabot Pro</p>
        <p className="mt-3 text-sm text-ink-dim">The ultimate server management platform for Rust Console Edition.</p>

        <Link
          href="/shop"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 font-bold uppercase tracking-wide text-[#05080E] shadow-glow-lime"
        >
          <Crown size={16} /> 30-Day Free Trial
        </Link>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {FEATURE_STRIP.map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1.5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${f.color}`}>
                <f.icon size={16} />
              </span>
              <span className="text-[10px] font-bold text-ink">{f.label}</span>
              <span className="text-[9px] text-ink-dim">{f.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- MOBILE Quick Access ---------- */}
      <section className="lg:hidden glass p-4">
        <p className="text-[10px] uppercase tracking-widest text-ink-dim mb-3 px-1">Quick Access</p>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACCESS.map((q) => (
            <Link key={q.label} href={q.href} className="flex flex-col items-center gap-1.5 rounded-xl border border-lime/25 py-3 hover:bg-lime/5 transition-colors">
              <q.icon size={18} className="text-lime" />
              <span className="text-[10px] font-bold">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="lg:hidden">
        <LiveTerminal compact />
      </section>

      {/* ---------- DESKTOP hero ---------- */}
      <section className="hidden lg:grid grid-cols-[1fr_1.3fr] gap-10 items-center py-4">
        <div>
          <h1 className="font-display font-black uppercase text-5xl leading-[1.05] tracking-tight">Work smarter with</h1>
          <p className="font-marker text-6xl text-gradient-brand -rotate-1 -mt-1">Kobabot Pro</p>
          <p className="mt-4 max-w-lg text-ink-dim text-lg">
            The ultimate server management platform for <span className="text-ink font-semibold">Rust Console Edition</span>.
          </p>
          <div className="mt-6 flex gap-6 text-xs text-ink-dim">
            {FEATURE_STRIP.map((f) => (
              <div key={f.label} className="flex flex-col gap-1.5">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${f.color}`}>
                  <f.icon size={16} />
                </span>
                <span className="font-bold text-ink">{f.label}</span>
                <span>{f.sub}</span>
              </div>
            ))}
          </div>
          <Link
            href="/shop"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-lime px-8 py-3.5 font-bold uppercase tracking-wide text-[#05080E] shadow-glow-lime hover:shadow-[0_0_35px_rgba(0,255,127,0.8)] transition-shadow"
          >
            <Crown size={18} /> 30-Day Free Trial
          </Link>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="relative flex-1">
            <div className="absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 -translate-y-14 rounded-full bg-lime/25 blur-3xl" />
            <div className="relative mx-auto mb-[-56px] h-64 w-64">
              <Image src="/assets/mascot.png" alt="KOBA Bot mascot" fill sizes="256px" className="object-contain" />
            </div>
            <LiveTerminal />
          </div>
          <div className="hidden xl:flex flex-col gap-2 w-40 shrink-0">
            {SIDE_ACTIONS.map((a) => (
              <span key={a.label} className={`rounded-full border px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide ${a.color}`}>
                {a.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="pt-2">
        <div className="mb-6">
          <h2 className="font-display font-black uppercase text-2xl lg:text-3xl tracking-tight">Pricing &amp; Shop</h2>
          <p className="text-ink-dim text-sm mt-1">Choose your plan. Unlock more. Get ahead.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      {/* ---------- Why KOBA Bot strip ---------- */}
      <section className="glass p-6 flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="shrink-0">
          <h3 className="font-display font-black uppercase text-lg">
            Why <span className="text-lime">Kobabot.store</span>?
          </h3>
          <p className="text-ink-dim text-xs mt-1 max-w-[16ch]">Powerful tools. Stronger communities.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          {WHY_STRIP.map((w) => (
            <div key={w.title} className="glass p-3.5 flex items-start gap-2.5">
              <w.icon size={18} className="text-lime shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">{w.title}</p>
                <p className="text-[11px] text-ink-dim">{w.sub}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="hidden lg:flex items-start gap-1.5 font-marker text-2xl text-lime/90 shrink-0 -rotate-1">
          <Crown size={20} className="text-yellow-400 fill-current mt-1 shrink-0" />
          <span>
            More Players.
            <br />
            More Fun.
          </span>
        </p>
      </section>
    </div>
  );
}

import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { Tabs } from "@/components/Tabs";
import { PricingCard } from "@/components/PricingCard";
import { MobileHeader } from "@/components/MobileHeader";
import { plans } from "@/lib/mock-data";

function ItemsGrid() {
  const items = [
    { name: "Starter Pack", image: "/assets/starter-pack.png", price: "$2.99" },
    { name: "Medium Pack", image: "/assets/medium-pack.png", price: "$6.99" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.name} className="glass rounded-2xl p-4 flex flex-col items-center text-center">
          <div className="relative h-24 w-24 mb-3">
            <Image src={item.image} alt="" fill sizes="96px" className="object-contain" />
          </div>
          <p className="text-sm font-bold">{item.name}</p>
          <p className="text-lime font-mono text-sm mt-1">{item.price}</p>
          <button className="mt-3 w-full rounded-xl border border-lime/30 text-lime text-xs font-bold uppercase py-2 hover:bg-lime/10 transition-colors">
            Buy
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ShopPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-8 space-y-6">
      <MobileHeader eyebrow="Rust Console Edition" title="Shop" right={<ShoppingCart className="text-lime" size={20} />} />
      <header className="hidden lg:flex glass p-6 items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">Rust Console Edition</p>
          <h1 className="font-display font-black uppercase text-2xl lg:text-3xl mt-1">
            Choose your <span className="text-lime text-glow-lime">plan</span>
          </h1>
          <p className="text-ink-dim text-sm mt-1">More tools. More players. More fun.</p>
        </div>
        <ShoppingCart className="text-lime" size={28} />
      </header>

      <Tabs
        tabs={[
          {
            label: "Servers",
            content: (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                {plans.map((plan) => (
                  <PricingCard key={plan.id} plan={plan} />
                ))}
              </div>
            ),
          },
          { label: "Items", content: <ItemsGrid /> },
        ]}
      />
    </div>
  );
}

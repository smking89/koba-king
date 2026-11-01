import { useMemo, useState } from "react";
import { usePlatform } from "@/platform/store";

type Status = "Active" | "Paused";

interface Campaign {
  id: string;
  name: string;
  game: string;
  objective: string;
  status: Status;
  spend: number;
  budget: number;
  impressions: number;
  clicks: number;
}

const GAMES = ["Rust Console", "DayZ", "Minecraft", "ARK", "Multi-game"];

function money(value: number) {
  return `${value.toLocaleString("en-US")} KOBA coins`;
}

export function AdsMark({ size = 28 }: { size?: number }) {
  return <img src="/brand/koba-ads.png" alt="KOBA Ads" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
}

export function AdsStudio({ identityId }: { identityId: string }) {
  const balance = usePlatform((state) => state.identities.find((identity) => identity.id === identityId)?.coins ?? 0);
  const spendCoins = usePlatform((state) => state.spendCoins);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [game, setGame] = useState(GAMES[0]);
  const [objective, setObjective] = useState("Shop");
  const [budget, setBudget] = useState("80");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const rows = useMemo(
    () =>
      campaigns.filter((campaign) => {
        const statusOk = filter === "All" || campaign.status === filter;
        const q = query.trim().toLowerCase();
        return statusOk && (!q || campaign.name.toLowerCase().includes(q) || campaign.game.toLowerCase().includes(q));
      }),
    [campaigns, filter, query],
  );

  const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const impressions = campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0);
  const clicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
  const active = campaigns.filter((campaign) => campaign.status === "Active").length;

  const create = () => {
    const trimmed = name.trim();
    const purse = Number(budget);
    if (trimmed.length < 3) {
      setError("Name the campaign.");
      return;
    }
    if (!Number.isInteger(purse) || purse < 1) {
      setError("Budget is a KOBA coin amount.");
      return;
    }
    if (purse > balance) {
      setError("Not enough KOBA coins.");
      return;
    }
    const paid = spendCoins(identityId, purse, `${trimmed} funded`, `${purse} KOBA coins`);
    if (!paid) {
      setError("Not enough KOBA coins.");
      return;
    }
    setCampaigns((current) => [
      { id: `ad-${Date.now()}`, name: trimmed, game, objective, status: "Paused", spend: 0, budget: purse, impressions: 0, clicks: 0 },
      ...current,
    ]);
    setName("");
    setBudget("80");
    setStep(0);
    setError("");
    setNote(`${trimmed} is funded with ${purse.toLocaleString("en-US")} KOBA coins. It stays paused until you run it.`);
  };

  return (
    <div className="grid gap-4">
      <section className="flex items-center gap-2">
        <AdsMark size={22} />
        <p className="text-xs tracking-[0.16em] text-white uppercase">KOBA Ads</p>
        <span className="ml-auto text-xs text-muted">{balance.toLocaleString("en-US")} KOBA coins</span>
      </section>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ["Active", String(active)],
          ["Spend", money(spend)],
          ["Impressions", impressions.toLocaleString("en-US")],
          ["Clicks", clicks.toLocaleString("en-US")],
        ].map(([label, value]) => (
          <section key={label} className="rounded-[10px] border border-[#2a2a2a] bg-black p-4">
            <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
          </section>
        ))}
      </div>
      <section className="overflow-hidden rounded-[11px] border border-[#2a2a2a] bg-black">
        <header className="flex flex-wrap items-center gap-2 border-b border-[#2a2a2a] px-4 py-3">
          <h3 className="text-sm font-medium">Campaigns</h3>
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search campaigns" placeholder="Search" className="h-9 min-w-0 flex-1 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 text-sm outline-none" />
          {(["All", "Active", "Paused"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`tab-plain ${filter === item ? "is-on" : ""}`}>
              {item}
            </button>
          ))}
        </header>
        <ul>
          {rows.map((campaign) => (
            <li key={campaign.id} className="grid items-center gap-3 border-t border-[#2a2a2a] px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto]">
              <span className="flex min-w-0 items-center gap-3">
                <AdsMark size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{campaign.name}</span>
                  <span className="block truncate text-xs text-muted">{campaign.objective} · {campaign.game}</span>
                </span>
              </span>
              <span className={`justify-self-start rounded-full px-2 py-1 text-[11px] ${campaign.status === "Active" ? "bg-white text-black" : "bg-[#1a1a1a] text-white"}`}>{campaign.status}</span>
              <span className="text-xs text-muted">{money(campaign.spend)} / {money(campaign.budget)}</span>
              <button
                type="button"
                className="h-9 rounded-md border border-[#2a2a2a] px-3 text-xs"
                onClick={() =>
                  setCampaigns((current) =>
                    current.map((item) => (item.id === campaign.id ? { ...item, status: item.status === "Active" ? "Paused" : "Active" } : item)),
                  )
                }
              >
                {campaign.status === "Active" ? "Pause" : "Run"}
              </button>
            </li>
          ))}
          {rows.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No campaigns match.</li> : null}
        </ul>
      </section>
      <form
        className="grid gap-3 rounded-xl border border-[#2a2a2a] bg-[#101010] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 2) {
            if (step === 0 && name.trim().length < 3) {
              setError("Name the campaign.");
              return;
            }
            setError("");
            setStep((value) => value + 1);
            return;
          }
          create();
        }}
      >
        <div className="flex gap-2 text-xs">
          {["Name", "Game", "Budget"].map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} className={index === step ? "text-white" : "text-faint"}>
              {index + 1}. {label}
            </button>
          ))}
        </div>
        {step === 0 ? (
          <label className="grid gap-1 text-sm">
            Campaign
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-lg border border-[#2a2a2a] bg-[#111] px-3" />
          </label>
        ) : null}
        {step === 1 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Game
              <select value={game} onChange={(event) => setGame(event.target.value)} className="h-11 rounded-lg border border-[#2a2a2a] bg-[#111] px-3">
                {GAMES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Objective
              <select value={objective} onChange={(event) => setObjective(event.target.value)} className="h-11 rounded-lg border border-[#2a2a2a] bg-[#111] px-3">
                {["Shop", "Server", "Brand"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {step === 2 ? (
          <label className="grid gap-1 text-sm">
            Budget in KOBA coins
            <input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="numeric" className="h-11 rounded-lg border border-[#2a2a2a] bg-[#111] px-3" />
          </label>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {note ? <p className="text-sm text-white">{note}</p> : null}
        <button type="submit" className="h-11 rounded-lg bg-white px-4 text-sm font-semibold text-black">
          {step < 2 ? "Continue" : "Create campaign"}
        </button>
      </form>
    </div>
  );
}

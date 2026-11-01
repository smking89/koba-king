"use client";

import { useState } from "react";
import { RefreshCw, ChevronRight, TerminalSquare } from "lucide-react";
import { StatusDot } from "@/components/StatusDot";
import { LiveTerminal } from "@/components/LiveTerminal";
import { MobileHeader } from "@/components/MobileHeader";
import { directoryServers } from "@/lib/mock-data";

const DETAIL_TABS = ["Console", "Players", "Settings"] as const;

export default function ServersPage() {
  const [selectedId, setSelectedId] = useState(directoryServers[0].id);
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number]>("Console");
  const selected = directoryServers.find((s) => s.id === selectedId) ?? directoryServers[0];

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-8 space-y-6">
      <MobileHeader
        eyebrow="Manage your Rust servers"
        title="Servers"
        right={
          <button className="rounded-full border border-lime/30 text-lime p-2 hover:bg-lime/10 transition-colors" aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
        }
      />
      <header className="hidden lg:flex glass p-6 items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">Manage your Rust servers</p>
          <h1 className="font-display font-black uppercase text-2xl lg:text-3xl mt-1">Servers</h1>
        </div>
        <button className="rounded-full border border-lime/30 text-lime p-2.5 hover:bg-lime/10 transition-colors" aria-label="Refresh">
          <RefreshCw size={18} />
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-3">
          {directoryServers.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left glass rounded-2xl p-4 flex items-center gap-3 transition-colors ${
                selectedId === s.id ? "border-lime/60" : "hover:border-lime/30"
              }`}
            >
              <div className="h-12 w-12 shrink-0 rounded-xl bg-lime/10 flex items-center justify-center text-lime">
                <TerminalSquare size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{s.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-ink-dim">
                  <StatusDot online={s.online} /> {s.online ? "Online" : "Offline"}
                </p>
                <p className="text-[11px] text-ink-dim mt-0.5">
                  {s.game} · {s.map} · {s.players}/{s.maxPlayers}
                </p>
              </div>
              <ChevronRight size={16} className="text-ink-dim shrink-0" />
            </button>
          ))}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot online={selected.online} />
            <h2 className="font-display font-black uppercase text-lg">{selected.name}</h2>
          </div>
          <p className="text-ink-dim text-xs mb-5">
            {selected.game} · {selected.map} · Players: {selected.players}/{selected.maxPlayers}
          </p>

          <div className="flex gap-2 mb-5">
            {DETAIL_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  tab === t ? "bg-lime text-[#05080E]" : "glass text-ink-dim hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "Console" && <LiveTerminal />}
          {tab === "Players" && (
            <div className="text-sm text-ink-dim py-10 text-center">
              Player list isn&apos;t wired to live RCON data in this preview yet.
            </div>
          )}
          {tab === "Settings" && (
            <div className="text-sm text-ink-dim py-10 text-center">Server settings management isn&apos;t wired up in this preview yet.</div>
          )}

          <button className="mt-5 w-full flex items-center justify-center gap-2 rounded-full border border-lime/50 text-lime font-bold text-sm uppercase tracking-wide py-3 hover:bg-lime/10 transition-colors glow-border-lime">
            <TerminalSquare size={16} /> Open WebRCON <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

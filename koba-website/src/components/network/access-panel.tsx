import { useState } from "react";
import { ChoiceSheet } from "@/components/ui";
import { GameSelect } from "@/components/network/game-select";
import { usePlatform, type DeskGrant } from "@/platform/store";
import type { GameScope } from "@/platform/engine";
import { PLATFORM_ROLES, platformLabel } from "@/site/roles";
import { SUPPORTED_GAMES } from "@/site/games";

function mask(value: string) {
  if (!value) return "revoked";
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}

export function AccessPanel() {
  const identities = usePlatform((state) => state.identities);
  const grants = usePlatform((state) => state.grants);
  const credentials = usePlatform((state) => state.credentials);
  const servers = usePlatform((state) => state.servers);
  const rotateCredential = usePlatform((state) => state.rotateCredential);
  const revokeCredential = usePlatform((state) => state.revokeCredential);
  const rotateServerKey = usePlatform((state) => state.rotateServerKey);
  const rotateHostKey = usePlatform((state) => state.rotateHostKey);
  const setServerLicense = usePlatform((state) => state.setServerLicense);
  const addServer = usePlatform((state) => state.addServer);
  const removeServer = usePlatform((state) => state.removeServer);
  const assignGrant = usePlatform((state) => state.assignGrant);
  const [tab, setTab] = useState<"credentials" | "apis">("credentials");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [name, setName] = useState("");
  const [game, setGame] = useState<GameScope>("RUST_CONSOLE");
  const [fault, setFault] = useState("");

  const copy = async (id: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
    } catch {
      setCopied("");
      setFault("Copy is blocked in this browser. The key is still on the row.");
    }
  };

  return (
    <section className="dash-card min-w-0 p-4 xl:col-span-12">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm">Access</h2>
        <button type="button" aria-pressed={tab === "credentials"} onClick={() => setTab("credentials")} className="tab-plain">
          Credentials
        </button>
        <button type="button" aria-pressed={tab === "apis"} onClick={() => setTab("apis")} className="tab-plain">
          APIs
        </button>
      </div>
      {fault ? <p className="mt-3 text-sm text-danger">{fault}</p> : null}
      {tab === "credentials" ? (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {identities.map((identity) => {
            const secret = credentials[identity.id] ?? "";
            const grant = grants[identity.id] ?? "player";
            const shown = open === identity.id;
            return (
              <li key={identity.id} className="grid gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{identity.name}</span>
                    <span className="block font-mono text-xs text-faint">{platformLabel(grant)}</span>
                  </span>
                  <span className="truncate font-mono text-xs">{shown ? secret || "revoked" : mask(secret)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ChoiceSheet
                    label="Role"
                    value={grant}
                    options={PLATFORM_ROLES.map((role) => ({ id: role.id, label: role.label }))}
                    onChange={(id) => assignGrant(identity.id, id as DeskGrant)}
                  />
                  <button type="button" className="h-9 border border-border px-2 text-xs" onClick={() => setOpen(shown ? null : identity.id)}>
                    {shown ? "Hide" : "Reveal"}
                  </button>
                  <button type="button" className="h-9 border border-border px-2 text-xs" onClick={() => void copy(identity.id, secret)}>
                    {copied === identity.id ? "Copied" : "Copy"}
                  </button>
                  <button type="button" className="h-9 border border-border px-2 text-xs" onClick={() => rotateCredential(identity.id)}>
                    {secret ? "Rotate" : "Issue"}
                  </button>
                  <button type="button" className="h-9 border border-border px-2 text-xs" disabled={!secret} onClick={() => revokeCredential(identity.id)}>
                    Revoke
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 grid gap-3">
          <ul className="divide-y divide-border border-y border-border">
            {servers.map((server) => (
              <li key={server.id} className="grid gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{server.name}</span>
                    <span className="block text-xs text-faint">{SUPPORTED_GAMES.find((game) => game.id === server.game)?.name ?? server.game} · {server.license}</span>
                  </span>
                  <button type="button" className="h-9 border border-border px-2 text-xs" onClick={() => setServerLicense(server.id, server.license === "active" ? "expired" : "active")}>
                    {server.license === "active" ? "Disconnect" : "Connect"}
                  </button>
                </div>
                <KeyRow label="Host" value={server.hostKey} id={`${server.id}-host`} open={open} copied={copied} onOpen={setOpen} onCopy={copy} onRotate={() => rotateHostKey(server.id)} />
                <KeyRow label="Plugin" value={server.pluginKey} id={`${server.id}-plugin`} open={open} copied={copied} onOpen={setOpen} onCopy={copy} onRotate={() => rotateServerKey(server.id)} />
                <button
                  type="button"
                  className="h-9 w-fit border border-danger px-2 text-xs text-danger"
                  onClick={() => {
                    const result = removeServer(server.id);
                    setFault(result.ok ? "" : result.reason);
                  }}
                >
                  Remove API
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addServer({ name, game });
              setName("");
            }}
          >
            <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted">
              Connection name
              <input value={name} onChange={(event) => setName(event.target.value)} className="h-9 border border-border bg-bg px-2 text-sm text-fg" placeholder="Server name" />
            </label>
            <div className="grid gap-1 text-xs text-muted">
              Game
              <GameSelect compact value={game} onChange={(id) => setGame(id as GameScope)} label="Game" className="w-[15rem]" />
            </div>
            <button type="submit" className="h-9 bg-fg px-3 text-sm text-bg">
              Add API
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function KeyRow({
  label,
  value,
  id,
  open,
  copied,
  onOpen,
  onCopy,
  onRotate,
}: {
  label: string;
  value: string;
  id: string;
  open: string | null;
  copied: string;
  onOpen: (id: string | null) => void;
  onCopy: (id: string, value: string) => void;
  onRotate: () => void;
}) {
  const shown = open === id;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{shown ? value : mask(value)}</span>
      <button type="button" className="h-8 border border-border px-2 text-xs" onClick={() => onOpen(shown ? null : id)}>
        {shown ? "Hide" : "Reveal"}
      </button>
      <button type="button" className="h-8 border border-border px-2 text-xs" onClick={() => onCopy(id, value)}>
        {copied === id ? "Copied" : "Copy"}
      </button>
      <button type="button" className="h-8 border border-border px-2 text-xs" onClick={onRotate}>
        Rotate
      </button>
    </div>
  );
}

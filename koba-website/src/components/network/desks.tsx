import { useState } from "react";
import { Button, Chip, ChoiceSheet, ConfirmDialog, FadeNote } from "@/components/ui";
import { PlayerFace } from "@/components/network/shared";
import { VerifiedMark } from "@/components/network/shop";
import { AdsMark, AdsStudio } from "@/components/network/ads";
import { cn } from "@/lib/cn";
import { AccessPanel } from "@/components/network/access-panel";
import { ACTIONS, type ActionId } from "@/engine/types";
import { usePulse } from "@/state/pulse";
import { usePlatform, type DeskGrant } from "@/platform/store";
import type { AuditRow, DisciplineStatus, Embed, FeedRow, Identity, ServerAdapter } from "@/platform/engine";
import { gameLabel } from "@/platform/engine";
import { accountFor, formatCoins, quote, specFor, type AstroAccount, type ShopProduct } from "@/site/astro";
import { canAssignPlatform, canAssignShop, platformLabel, PLATFORM_ROLES, SHOP_ROLES, type PlatformRole, type ShopRole } from "@/site/roles";
import { useSite, type Desk } from "@/site/ui";

function AdminFrame({
  title,
  items,
  active,
  onPick,
  children,
}: {
  title: string;
  items: { id: string; label: string }[];
  active: string;
  onPick?: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-app">
      <nav className="admin-nav" aria-label={title}>
        <p className="admin-brand">KOBA</p>
        <p className="admin-kicker">{title}</p>
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => onPick?.(item.id)} className={`admin-link flex items-center gap-2 ${active === item.id ? "is-on" : ""}`}>
            {item.id === "ads" ? <AdsMark size={18} /> : null}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="admin-main">{children}</div>
    </div>
  );
}

const STATUS: Record<DisciplineStatus, string> = {
  clear: "Clear",
  warned: "Warned",
  struck: "Struck",
  under_review: "Review",
  blacklisted: "Banned",
};

export function DeskPage({
  desk,
  viewer,
  identities,
  groups,
  servers,
  feed,
  audit,
  products,
  opened,
  account,
  onAct,
  onOpenBusiness,
  onOpenPlayer,
  onShop,
  onReset,
  seller,
}: {
  desk: Exclude<Desk, "play">;
  viewer: Identity;
  identities: Identity[];
  groups: { id: string; name: string; tag: string; ownerId: string }[];
  servers: ServerAdapter[];
  feed: FeedRow[];
  audit: AuditRow[];
  products: ShopProduct[];
  opened: Record<string, string>;
  account: AstroAccount;
  onAct: (line: string) => Embed;
  onOpenBusiness: (name: string) => void;
  onOpenPlayer: (id: string) => void;
  onShop: () => void;
  onReset: () => void;
  seller?: React.ReactNode;
}) {
  if (desk === "business") {
    return (
      <BusinessDesk
        viewer={viewer}
        account={account}
        products={products.filter((product) => product.sellerId === viewer.id)}
        feed={feed}
        onOpenBusiness={onOpenBusiness}
        onShop={onShop}
        seller={seller}
      />
    );
  }
  if (desk === "mod") {
    return <ModDesk identities={identities} products={products} onAct={onAct} onOpenPlayer={onOpenPlayer} />;
  }
  if (desk === "admin") {
    return (
      <AdminDesk
        identities={identities}
        groups={groups}
        servers={servers}
        products={products}
        feed={feed}
        onAct={onAct}
        onOpenPlayer={onOpenPlayer}
      />
    );
  }
  if (desk === "support" || desk === "trainee") {
    return <SupportDesk trainee={desk === "trainee"} />;
  }
  return (
    <SuperDesk
      identities={identities}
      opened={opened}
      audit={audit}
      onAct={onAct}
      onOpenPlayer={onOpenPlayer}
      onReset={onReset}
    />
  );
}

function BusinessDesk({
  viewer,
  account,
  products,
  feed,
  onOpenBusiness,
  onShop,
  seller,
}: {
  viewer: Identity;
  account: AstroAccount;
  products: ShopProduct[];
  feed: FeedRow[];
  onOpenBusiness: (name: string) => void;
  onShop: () => void;
  seller?: React.ReactNode;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"overview" | "ads" | "staff">("overview");
  const fee = quote(100, account.verified);
  const sales = feed.filter((row) => row.title.includes("bought") && row.detail.startsWith(viewer.name));

  return (
    <AdminFrame
      title="Shop"
      items={[
        { id: "overview", label: "Overview" },
        { id: "staff", label: "Shop staff" },
        { id: "ads", label: "Ads" },
      ]}
      active={panel}
      onPick={(id) => setPanel(id === "ads" ? "ads" : id === "staff" ? "staff" : "overview")}
    >
      {panel === "ads" ? <AdsStudio identityId={viewer.id} /> : null}
      {panel === "staff" ? <ShopStaff shopId={viewer.id} /> : null}
      {panel === "overview" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DeskIntro
            kicker="Shop owner"
            title={account.business ? account.businessName || "Shop" : "No shop yet"}
            body="You control this shop. KOBA staff roles are a different ladder."
            className="xl:col-span-7"
          />
          <section className="dash-card min-w-0 p-4 xl:col-span-5">
            <p className="font-mono text-xs tracking-widest text-faint uppercase">Seller fee</p>
            <div className="mt-3">
              <VerifiedMark verified={account.verified} />
            </div>
            <p className="mt-3 text-3xl font-medium tabular-nums text-ok">{fee.label}</p>
            <p className="mt-1 text-sm text-muted">Verified sellers pay 2.5%. Unverified sellers pay 3.5%.</p>
          </section>
          {account.business ? (
            <section className="dash-card min-w-0 p-4 md:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-xs tracking-widest text-faint uppercase">Listings</h2>
                <button type="button" onClick={onShop} className="min-h-11 rounded-full px-2 text-sm text-cyan">
                  Official shop
                </button>
              </div>
              {products.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing listed under this shop yet.</p> : null}
              <ul className="mt-2 grid gap-2">
                {products.map((product) => {
                  const sale = quote(product.price, account.verified);
                  return (
                    <li key={product.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-bg-subtle px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{product.title}</span>
                        <span className="block truncate font-mono text-xs text-faint">{specFor(product.kind).name}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-xs text-fg">{formatCoins(product.price)}</span>
                        <span className="block font-mono text-xs text-ok">You {formatCoins(sale.payout)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {seller}
              <p className="mt-3 text-xs text-muted">{sales.length} sales on this shop.</p>
            </section>
          ) : (
            <form
              className="dash-card grid min-w-0 gap-3 p-4 md:col-span-2"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = name.trim();
                if (trimmed.length < 2 || trimmed.length > 32) {
                  setError("Use 2–32 characters.");
                  return;
                }
                setError("");
                onOpenBusiness(trimmed);
              }}
            >
              <h2 className="font-mono text-xs tracking-widest text-faint uppercase">Open a shop</h2>
              <p className="text-sm text-muted">This makes you the shop owner. The fee stays {fee.label}.</p>
              <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-lg border border-border bg-bg px-3 text-sm" />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" variant="primary">
                Open shop
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </AdminFrame>
  );
}

function ShopStaff({ shopId }: { shopId: string }) {
  const identities = usePlatform((state) => state.identities);
  const staff = usePlatform((state) => state.shopStaff[shopId] ?? {});
  const assignShopRole = usePlatform((state) => state.assignShopRole);
  const others = identities.filter((identity) => identity.id !== shopId);
  return (
    <section className="dash-card min-w-0 p-4">
      <h2 className="text-sm">Shop staff</h2>
      <p className="mt-1 text-sm text-muted">These roles cover this shop only. They cannot change KOBA staff, payouts outside this shop, or delete the shop.</p>
      <ul className="mt-3">
        {others.map((identity) => {
          const current = staff[identity.id] ?? "";
          return (
            <li key={identity.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-border">
              <span className="truncate text-sm">{identity.name}</span>
              <ChoiceSheet
                label="Shop role"
                value={current || "none"}
                options={[
                  { id: "none", label: "No shop role" },
                  ...SHOP_ROLES.filter((role) => role.id !== "owner" && canAssignShop("owner", role.id)).map((role) => ({ id: role.id, label: role.label })),
                ]}
                onChange={(id) => assignShopRole(shopId, identity.id, id === "none" ? null : (id as ShopRole))}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ModDesk({
  identities,
  products,
  onAct,
  onOpenPlayer,
}: {
  identities: Identity[];
  products: ShopProduct[];
  onAct: (line: string) => Embed;
  onOpenPlayer: (id: string) => void;
}) {
  const pullProduct = useSite((state) => state.pullProduct);
  return (
    <AdminFrame title="Moderator" items={[{ id: "queue", label: "Reports" }, { id: "items", label: "Items" }]} active="queue">
      <div className="grid gap-3">
        <DeskIntro kicker="Moderator" title="Enforcement" body="Ban a user or pull an item. Payouts, staff roles, and root tools stay off this desk." />
        <Discipline identities={identities} canWarn canStrike={false} canClear={false} canBan onAct={onAct} onOpenPlayer={onOpenPlayer} />
        <section className="dash-card min-w-0 p-4">
          <h2 className="text-sm">Items</h2>
          <ul className="mt-2">
            {products.map((product) => (
              <li key={product.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-border">
                <span className="truncate text-sm">{product.title}</span>
                <button type="button" className="h-9 text-sm" onClick={() => pullProduct(product.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminFrame>
  );
}

function AdminDesk({
  identities,
  groups,
  servers,
  products,
  feed,
  onAct,
  onOpenPlayer,
}: {
  identities: Identity[];
  groups: { id: string; name: string; tag: string; ownerId: string }[];
  servers: ServerAdapter[];
  products: ShopProduct[];
  feed: FeedRow[];
  onAct: (line: string) => Embed;
  onOpenPlayer: (id: string) => void;
}) {
  const setServerLicense = usePlatform((state) => state.setServerLicense);
  const open = identities.filter((identity) => identity.status !== "clear").length;
  return (
    <AdminFrame title="Admin" items={[{ id: "overview", label: "Overview" }, { id: "network", label: "Network" }]} active="overview">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DeskIntro
          kicker="Admin"
          title="Operations"
          body="Suspend a shop's server, review disputes, and see transactions. You cannot demote the owner or reset the network."
          className="md:col-span-2"
        />
        <Stat label="Players" value={String(identities.length)} />
        <Stat label="Open cases" value={String(open)} />
        <Stat label="Servers" value={String(servers.length)} />
        <section className="dash-card min-w-0 p-4">
          <h2 className="text-sm">Groups</h2>
          <ul className="mt-2">
            {groups.map((group) => (
              <li key={group.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm">
                <span>{group.name}</span>
                <span className="font-mono text-xs text-muted">{group.tag}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="dash-card min-w-0 p-4">
          <h2 className="text-sm">Servers</h2>
          <ul className="mt-2">
            {servers.map((server) => (
              <li key={server.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-border">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{server.name}</span>
                  <span className="font-mono text-xs text-faint">{gameLabel(server.game)}</span>
                </span>
                <button type="button" className="h-9 text-sm" onClick={() => setServerLicense(server.id, server.license === "active" ? "expired" : "active")}>
                  {server.license === "active" ? "Suspend" : "Restore"}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-xs text-muted">{products.length} listings · {feed.length} notes</p>
        </section>
        <div className="md:col-span-2">
          <Discipline identities={identities} canWarn={false} canStrike canClear={false} canBan={false} onAct={onAct} onOpenPlayer={onOpenPlayer} />
        </div>
      </div>
    </AdminFrame>
  );
}

function SuperDesk({
  identities,
  opened,
  audit,
  onAct,
  onOpenPlayer,
  onReset,
}: {
  identities: Identity[];
  opened: Record<string, string>;
  audit: AuditRow[];
  onAct: (line: string) => Embed;
  onOpenPlayer: (id: string) => void;
  onReset: () => void;
}) {
  const grants = usePlatform((state) => state.grants);
  const assignGrant = usePlatform((state) => state.assignGrant);
  const removeIdentity = usePlatform((state) => state.removeIdentity);
  const viewerId = usePlatform((state) => state.viewerId);
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState<{ title: string; body: string; confirm: string; run: () => void } | null>(null);
  const [tab, setTab] = useState<"overview" | "staff" | "engine" | "keys" | "audit">("overview");
  const tabs = [
    ["overview", "Overview"],
    ["staff", "Staff"],
    ["engine", "Engine"],
    ["keys", "Keys"],
    ["audit", "Audit"],
  ] as const;
  return (
    <AdminFrame title="Owner" items={tabs.map(([id, label]) => ({ id, label }))} active={tab} onPick={(id) => setTab(id as typeof tab)}>
      {tab === "overview" ? (
        <div className="grid gap-3">
          <DeskIntro kicker="Owner" title="Root" body="You can promote or demote anyone, delete an asset, and override a lower desk. Shop roles do not grant this seat." />
          <Button variant="ghost" onClick={onReset}>
            Reset network
          </Button>
        </div>
      ) : null}
      {tab === "staff" ? (
        <section className="dash-card min-w-0 p-4">
          <h2 className="text-sm">Platform staff</h2>
          <p className="mt-1 text-xs text-muted">Owner can change every platform role. Admin cannot reach this list.</p>
          {note ? <p className="mt-3 text-sm">{note}</p> : null}
          <ul className="mt-3">
            {identities.map((identity) => {
              const grant = grants[identity.id] ?? "player";
              const standing = accountFor(identity.id, opened);
              return (
                <li key={identity.id} className="grid gap-2 border-b border-border py-3">
                  <button type="button" onClick={() => onOpenPlayer(identity.id)} className="flex items-center gap-3 text-left">
                    <PlayerFace name={identity.name} id={identity.id} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{identity.name}</span>
                      <span className="block font-mono text-xs text-faint">{platformLabel(grant)}{standing.business ? " · shop owner" : ""}</span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <ChoiceSheet
                      label="Role"
                      value={grant}
                      options={PLATFORM_ROLES.map((role) => ({ id: role.id, label: role.label }))}
                      onChange={(id) => {
                        const next = id as PlatformRole;
                        if (!canAssignPlatform("super", grant, next)) {
                          setNote("That change is not allowed.");
                          return;
                        }
                        assignGrant(identity.id, next as DeskGrant);
                        setNote(`${identity.name} is ${platformLabel(next)}.`);
                      }}
                    />
                    <button
                      type="button"
                      className="h-12 text-sm"
                      disabled={identity.status === "blacklisted"}
                      onClick={() =>
                        setAsk({
                          title: `Blacklist ${identity.name}`,
                          body: `${identity.name} is locked out of KOBA, official servers, and bot commands.`,
                          confirm: "Blacklist",
                          run: () => onAct(`/globalban ${identity.handle}`),
                        })
                      }
                    >
                      Blacklist
                    </button>
                    <button
                      type="button"
                      className="h-12 text-sm"
                      disabled={identity.id === viewerId}
                      onClick={() =>
                        setAsk({
                          title: `Delete ${identity.name}`,
                          body: `${identity.name} and that account's place on the board are removed.`,
                          confirm: "Delete",
                          run: () => {
                            const result = removeIdentity(identity.id);
                            setNote(result.ok ? `${identity.name} was deleted.` : result.reason);
                          },
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <ConfirmDialog
            open={ask != null}
            title={ask?.title ?? ""}
            body={ask?.body ?? ""}
            confirm={ask?.confirm ?? "Confirm"}
            onClose={() => setAsk(null)}
            onConfirm={() => {
              ask?.run();
              setAsk(null);
            }}
          />
        </section>
      ) : null}
      {tab === "engine" ? <EngineConsole /> : null}
      {tab === "keys" ? <AccessPanel /> : null}
      {tab === "audit" ? (
        <ul className="grid gap-2">
          {audit.map((row) => (
            <li key={row.id} className="border-b border-border py-2 text-sm">
              <span className="text-muted">{row.actor} · {row.action}</span>
              <span className="mt-1 block">{row.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminFrame>
  );
}

function EngineConsole() {
  const weights = usePulse((state) => state.weights);
  const setWeight = usePulse((state) => state.setWeight);
  const resetWeights = usePulse((state) => state.resetWeights);
  return (
    <section className="dash-card p-4">
      <h2 className="text-sm">Engine weights</h2>
      <p className="mt-1 text-sm text-muted">Owner only. These weights change how the board ranks a join, a challenge, and a sponsor.</p>
      <ul className="mt-3 grid gap-3">
        {ACTIONS.map((action) => (
          <li key={action.id}>
            <label className="flex items-center justify-between gap-3 text-sm">
              {action.label}
              <span className="font-mono text-xs">{weights[action.id]}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={weights[action.id]}
              onChange={(event) => setWeight(action.id as ActionId, Number(event.target.value))}
              className="mt-1 w-full"
            />
          </li>
        ))}
      </ul>
      <button type="button" className="mt-3 h-9 text-sm" onClick={() => resetWeights()}>
        Reset weights
      </button>
    </section>
  );
}

function SupportDesk({ trainee }: { trainee: boolean }) {
  const [sent, setSent] = useState("");
  const tickets: { id: string; from: string; text: string; risk: "low" | "high" }[] = [];
  const presets = ["We have the ticket.", "Open the shop order and try the item again.", "A senior agent will take anything about a payout."];
  return (
    <AdminFrame title={trainee ? "Support trainee" : "Support"} items={[{ id: "tickets", label: "Tickets" }]} active="tickets">
      <DeskIntro
        kicker={trainee ? "Trainee" : "Support"}
        title="Tickets"
        body={trainee ? "Reply to low-risk tickets with a preset. Payouts, bans, and item edits stay closed." : "Reply to tickets and delivery issues. You cannot ban, edit items, or open payouts."}
      />
      <ul className="mt-3 grid gap-3">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="border-b border-border py-3">
            <p className="text-sm">{ticket.from}</p>
            {trainee && ticket.risk === "high" ? <p className="mt-1 text-sm text-muted">This ticket is with a senior agent.</p> : <p className="mt-1 text-sm text-muted">{ticket.text}</p>}
            {ticket.risk === "low" || !trainee ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {presets.map((line) => (
                  <button key={line} type="button" className="h-9 text-sm" onClick={() => setSent(`${ticket.from}: ${line}`)}>
                    {line}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {tickets.length === 0 ? <p className="mt-3 text-sm text-muted">No open tickets. Player reports will appear here.</p> : null}
      {sent ? <FadeNote text={sent} /> : null}
    </AdminFrame>
  );
}

function Discipline({
  identities,
  canWarn,
  canStrike,
  canClear,
  canBan,
  onAct,
  onOpenPlayer,
}: {
  identities: Identity[];
  canWarn: boolean;
  canStrike: boolean;
  canClear: boolean;
  canBan: boolean;
  onAct: (line: string) => Embed;
  onOpenPlayer: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState<{ title: string; body: string; confirm: string; run: () => void } | null>(null);
  const act = (line: string) => {
    const embed = onAct(line);
    setNote(`${embed.title}. ${embed.description}`);
  };
  return (
    <section className="dash-card min-w-0 p-4">
      <h2 className="text-sm">Players</h2>
      {note ? <FadeNote text={note} /> : null}
      <ul className="mt-2 grid gap-2">
        {identities.map((identity) => (
          <li key={identity.id} className="rounded-2xl bg-bg-subtle p-3">
            <button type="button" onClick={() => onOpenPlayer(identity.id)} className="flex min-h-11 items-center gap-3 text-left">
              <PlayerFace name={identity.name} id={identity.id} size="sm" />
              <span>
                <span className="block text-sm">{identity.name}</span>
                <span className="font-mono text-xs text-faint">@{identity.handle}</span>
              </span>
              <Chip tone={identity.status === "clear" ? "ok" : identity.status === "warned" ? "warn" : "danger"}>{STATUS[identity.status]}</Chip>
            </button>
            <p className="mt-2 font-mono text-xs text-muted">
              {identity.warnings} warning · {identity.strikes}/3 strikes
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {canWarn ? (
                <Button variant="ghost" disabled={identity.warnings >= 1} onClick={() => act(`/mod warning ${identity.handle}`)}>
                  Warn
                </Button>
              ) : null}
              {canStrike ? (
                <Button
                  variant="ghost"
                  disabled={identity.strikes >= 3 || identity.status === "blacklisted"}
                  onClick={() => {
                    if (identity.strikes === 2) {
                      setAsk({
                        title: `3rd strike on ${identity.name}`,
                        body: `${identity.name} goes under review. The shop and events lock.`,
                        confirm: "Apply 3rd strike",
                        run: () => act(`/mod strike ${identity.handle}`),
                      });
                      return;
                    }
                    act(`/mod strike ${identity.handle}`);
                  }}
                >
                  Strike
                </Button>
              ) : null}
              {canClear ? (
                <Button variant="ghost" disabled={identity.strikes <= 0} onClick={() => act(`/mod clear ${identity.handle}`)}>
                  Clear strike
                </Button>
              ) : null}
              {canBan ? (
                <Button
                  variant="ghost"
                  disabled={identity.status === "blacklisted"}
                  onClick={() =>
                    setAsk({
                      title: `Ban ${identity.name}`,
                      body: `${identity.name} is locked out of KOBA, official servers, and bot commands.`,
                      confirm: "Ban",
                      run: () => act(`/globalban ${identity.handle}`),
                    })
                  }
                >
                  Ban
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={ask != null}
        title={ask?.title ?? ""}
        body={ask?.body ?? ""}
        confirm={ask?.confirm ?? "Confirm"}
        onClose={() => setAsk(null)}
        onConfirm={() => {
          ask?.run();
          setAsk(null);
        }}
      />
    </section>
  );
}

function DeskIntro({ kicker, title, body, className }: { kicker: string; title: string; body: string; className?: string }) {
  return (
    <section className={cn("dash-card min-w-0 p-4", className)}>
      <p className="font-mono text-xs tracking-widest text-faint uppercase">{kicker}</p>
      <h2 className="mt-1 text-lg">{title}</h2>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <section className="dash-card p-4">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </section>
  );
}

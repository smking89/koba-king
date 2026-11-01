import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChoiceSheet, FadeNote, Switch } from "@/components/ui";
import { ThemeChoice } from "@/components/theme-toggle";
import type { Identity } from "@/platform/engine";
import { PUBLIC_REGIONS, regionLabel, type PublicRegion } from "@/site/regions";
import type { DmPolicy, FollowPolicy, InvitePolicy } from "@/lib/social/social.server";

/** Real signed-in account info - federated sign-in only (no app-local email/password), so this is read-only. */
export interface SessionView {
  name: string;
  email: string | null;
  provider: string;
}
import { getStripeConnectStatus, startStripeOnboarding, refreshStripeConnectStatus, disconnectStripe } from "@/lib/stripe/api";
import type { ConnectStatus } from "@/lib/stripe/connect.server";

function verdict(value: string, self: string, taken: Set<string>): "empty" | "ok" | "bad" {
  const next = value.trim().toLowerCase();
  if (!next) return "empty";
  if (!/^[a-z][a-z0-9_]{2,15}$/.test(next)) return "bad";
  if (next !== self && taken.has(next)) return "bad";
  return "ok";
}

type Provider = "discord" | "xbox";

const SECTIONS = [
  { id: "id", label: "KOBAid" },
  { id: "username", label: "Username" },
  { id: "region", label: "Region" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
  { id: "accounts", label: "Connected accounts" },
  { id: "payouts", label: "Payouts" },
  { id: "follow", label: "Privacy & safety" },
  { id: "friends", label: "Friends" },
  { id: "blocked", label: "Blocked" },
  { id: "danger", label: "Data & account" },
];

function Card({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section id={`set-${id}`} className="grid gap-3 rounded-3xl border border-border bg-bg-elevated p-5 scroll-mt-20">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsPage({
  viewer,
  identities,
  session,
  follows,
  blocked,
  friendRequestPolicy,
  groupInvitePolicy,
  dmPolicy,
  onSave,
  onRegion,
  onFollow,
  onBlock,
  onUnblock,
  onPolicy,
  onLink,
  onExportData,
  onDeleteAccount,
}: {
  viewer: Identity;
  identities: Identity[];
  session: SessionView;
  follows: string[];
  blocked: string[];
  friendRequestPolicy: FollowPolicy;
  groupInvitePolicy: InvitePolicy;
  dmPolicy: DmPolicy;
  onSave: (handle: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  onRegion: (region: PublicRegion) => Promise<{ ok: true } | { ok: false; reason: string }>;
  onFollow: (id: string) => void;
  onBlock: (id: string) => void;
  onUnblock: (id: string) => void;
  onPolicy: (policy: { friendRequestPolicy?: FollowPolicy; groupInvitePolicy?: InvitePolicy; dmPolicy?: DmPolicy }) => void;
  onLink: (provider: Provider, on: boolean) => { ok: true } | { ok: false; reason: string };
  onExportData: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [value, setValue] = useState(viewer.handle);
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkNote, setLinkNote] = useState("");
  const [alerts, setAlerts] = useState(true);
  const [section, setSection] = useState("id");
  const [stripeStatus, setStripeStatus] = useState<ConnectStatus | null>(null);
  const [stripeNote, setStripeNote] = useState("");
  const [stripeBusy, setStripeBusy] = useState(false);

  useEffect(() => {
    setValue(viewer.handle);
    setSaved("");
  }, [viewer.id, viewer.handle]);

  useEffect(() => {
    // Returning from Stripe's hosted onboarding - re-sync our stored status
    // from Stripe's own account object before rendering (see
    // connect.server.ts's refreshConnectStatus header for why this is
    // needed instead of relying on a webhook here).
    const fromStripe = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("stripe");
    const load = fromStripe === "return"
      ? refreshStripeConnectStatus({ data: { playerId: viewer.id } })
      : getStripeConnectStatus({ data: { playerId: viewer.id } });
    load.then((result) => {
      if ("error" in result) {
        setStripeNote(result.error);
        return;
      }
      setStripeStatus(result);
    });
    if (fromStripe && typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [viewer.id]);

  const taken = useMemo(() => new Set(identities.filter((identity) => identity.id !== viewer.id).map((identity) => identity.handle.toLowerCase())), [identities, viewer.id]);
  const state = verdict(value, viewer.handle.toLowerCase(), taken);
  const changed = value.trim().toLowerCase() !== viewer.handle.toLowerCase();
  const others = identities.filter((identity) => identity.id !== viewer.id);
  const friends = others.filter((identity) => follows.includes(identity.id));
  const blockedPeople = others.filter((identity) => blocked.includes(identity.id));
  const canBlock = others.filter((identity) => !blocked.includes(identity.id));
  const links: { id: Provider; label: string; on: boolean; detail: string }[] = [
    { id: "discord", label: "Discord", on: Boolean(viewer.discordId), detail: viewer.discordId ?? "Not linked" },
    { id: "xbox", label: "Xbox", on: Boolean(viewer.xboxId), detail: viewer.xboxId ?? "Not linked" },
  ];

  const jumpTo = (id: string) => {
    setSection(id);
    document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight">Your account</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your KOBAid, connections, privacy and appearance. The username is what people type; the display name stays {viewer.name}.
        </p>
      </div>

      <div className="lg:hidden">
        <ChoiceSheet label="Open" value={section} options={SECTIONS} onChange={jumpTo} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden content-start gap-1 lg:sticky lg:top-20 lg:grid lg:self-start">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => jumpTo(item.id)}
              className={`flex min-h-10 items-center rounded-xl px-3 text-left text-sm font-medium transition-colors ${
                section === item.id ? "bg-fg text-bg" : "text-fg/75 hover:bg-bg-subtle hover:text-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="grid min-w-0 gap-4">
          <Card id="id" title="KOBAid">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate font-mono text-lg font-bold tracking-wider">{viewer.kobaTag ?? viewer.id}</p>
              <button
                type="button"
                className="h-9 rounded-full border border-border px-3 text-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(viewer.kobaTag ?? viewer.id).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  });
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </Card>

          <Card id="username" title="Username">
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (state !== "ok" || !changed) return;
                void onSave(value).then((result) => setSaved(result.ok ? "Username saved." : result.reason));
              }}
            >
              <label className="grid gap-2 text-sm" htmlFor="username">
                <span className="sr-only">Username</span>
                <span className="flex h-12 items-center gap-2 rounded-xl border border-border bg-bg px-3">
                  <span className="text-muted">@</span>
                  <input
                    id="username"
                    value={value}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setSaved("");
                      setValue(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                    }}
                    className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
                  />
                  {state === "ok" ? <Mark ok /> : null}
                  {state === "bad" ? <Mark ok={false} /> : null}
                </span>
              </label>
              <p className={`text-sm ${state === "bad" ? "text-danger" : "text-muted"}`} role="status">
                {state === "empty" ? "3 to 16 characters. Start with a letter." : null}
                {state === "ok" && !changed ? "This is your username." : null}
                {state === "ok" && changed ? "Available." : null}
                {state === "bad" ? (taken.has(value.trim().toLowerCase()) ? "Taken." : "Use letters, numbers, or underscore. 3 to 16.") : null}
              </p>
              <button
                type="submit"
                disabled={state !== "ok" || !changed}
                className="h-11 w-fit rounded-full bg-fg px-5 text-sm font-medium text-bg disabled:bg-bg-subtle disabled:text-muted"
              >
                Save username
              </button>
              {saved ? <FadeNote text={saved} /> : null}
            </form>
          </Card>

          <Card id="region" title="Region" subtitle="Used for regional leaderboards and server discovery.">
            <RegionPicker viewer={viewer} onRegion={onRegion} />
          </Card>

          <Card id="appearance" title="Appearance" subtitle="Light, dark, or whatever this device is set to. The choice is saved on this browser.">
            <ThemeChoice />
          </Card>

          <Card id="account" title="Account">
            <p className="text-sm text-muted">
              Signed in as {session.name}
              {session.email ? ` · ${session.email}` : ""} via {session.provider}.
            </p>
            <p className="text-sm text-muted">Email and password are managed by {session.provider}, not here.</p>
          </Card>

          <Card id="accounts" title="Connected accounts">
            <ul className="grid gap-1">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{link.label}</span>
                    <span className="block truncate font-mono text-xs text-muted">{link.detail}</span>
                  </span>
                  <button
                    type="button"
                    className="h-9 shrink-0 rounded-full border border-border px-3 text-sm"
                    onClick={() => {
                      const result = onLink(link.id, !link.on);
                      setLinkNote(result.ok ? "" : result.reason);
                    }}
                  >
                    {link.on ? "Disconnect" : "Connect"}
                  </button>
                </li>
              ))}
            </ul>
            {linkNote ? <p className="text-sm text-muted">{linkNote}</p> : null}
          </Card>

          <Card id="payouts" title="Payouts" subtitle="Connect a Stripe account to receive payouts from sales, sponsorships, and reward fulfillment.">
            {stripeStatus?.connected ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bg px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{stripeStatus.chargesEnabled ? "Connected" : "Connected - setup incomplete"}</span>
                  <span className="block truncate font-mono text-xs text-muted">{stripeStatus.accountId}</span>
                </span>
                <button
                  type="button"
                  className="h-9 rounded-full border border-border px-3 text-sm"
                  disabled={stripeBusy}
                  onClick={() => {
                    setStripeBusy(true);
                    setStripeNote("");
                    const origin = window.location.origin + window.location.pathname;
                    void startStripeOnboarding({
                      data: { playerId: viewer.id, returnUrl: `${origin}?stripe=return`, refreshUrl: `${origin}?stripe=refresh` },
                    }).then((result) => {
                      setStripeBusy(false);
                      if ("error" in result) {
                        setStripeNote(result.error);
                        return;
                      }
                      window.location.href = result.url;
                    });
                  }}
                >
                  Finish setup
                </button>
                <button
                  type="button"
                  className="h-9 rounded-full px-3 text-sm text-muted"
                  disabled={stripeBusy}
                  onClick={() => {
                    setStripeBusy(true);
                    void disconnectStripe({ data: { playerId: viewer.id } }).then((result) => {
                      setStripeBusy(false);
                      if ("error" in result) {
                        setStripeNote(result.error);
                        return;
                      }
                      setStripeStatus({ connected: false, accountId: null, detailsSubmitted: false, chargesEnabled: false });
                    });
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="h-11 w-fit rounded-full bg-fg px-5 text-sm font-medium text-bg disabled:bg-bg-subtle disabled:text-muted"
                disabled={stripeBusy}
                onClick={() => {
                  setStripeBusy(true);
                  setStripeNote("");
                  const origin = window.location.origin + window.location.pathname;
                  void startStripeOnboarding({
                    data: { playerId: viewer.id, returnUrl: `${origin}?stripe=return`, refreshUrl: `${origin}?stripe=refresh` },
                  }).then((result) => {
                    setStripeBusy(false);
                    if ("error" in result) {
                      setStripeNote(result.error);
                      return;
                    }
                    window.location.href = result.url;
                  });
                }}
              >
                {stripeBusy ? "Redirecting..." : "Connect Stripe"}
              </button>
            )}
            {stripeNote ? <p className="text-sm text-muted">{stripeNote}</p> : null}
          </Card>

          <Card id="follow" title="Privacy & safety">
            <Switch label="Notifications" on={alerts} onChange={setAlerts} />
            <PolicySelect
              label="Who can send you friend requests"
              value={friendRequestPolicy}
              options={[
                { id: "everyone", label: "Everyone", detail: "Any player can find your KOBAid and send an invite." },
                { id: "friends_of_friends", label: "Friends of friends", detail: "Only players who share at least one mutual contact." },
                { id: "no_one", label: "No one", detail: "Incoming requests are disabled." },
              ]}
              onChange={(friendRequestPolicy) => void onPolicy({ friendRequestPolicy })}
            />
            <PolicySelect
              label="Who can invite you to clans and matches"
              value={groupInvitePolicy}
              options={[
                { id: "everyone", label: "Everyone", detail: "Anyone in open lobbies or leaderboards can invite you." },
                { id: "friends_only", label: "Friends only", detail: "Only players on your friends list." },
                { id: "no_one", label: "No one", detail: "Clan invites are disabled." },
              ]}
              onChange={(groupInvitePolicy) => void onPolicy({ groupInvitePolicy })}
            />
            <PolicySelect
              label="Who can send you direct chat messages"
              value={dmPolicy}
              options={[
                { id: "everyone", label: "Everyone", detail: "Open messaging with anyone on the platform." },
                { id: "friends_only", label: "Friends only", detail: "Only players on your friends list." },
              ]}
              onChange={(dmPolicy) => void onPolicy({ dmPolicy })}
            />
          </Card>

          <Card id="friends" title="Friends">
            {friends.length === 0 ? <p className="text-sm text-muted">No one yet.</p> : null}
            <ul className="grid gap-1">
              {friends.map((identity) => (
                <li key={identity.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {identity.name} <span className="text-muted">@{identity.handle}</span>
                  </span>
                  <button type="button" onClick={() => onFollow(identity.id)} className="h-9 shrink-0 rounded-full border border-border px-3 text-sm text-muted">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card id="blocked" title="Blocked">
            {blockedPeople.length === 0 ? <p className="text-sm text-muted">No one blocked.</p> : null}
            <ul className="grid gap-1">
              {blockedPeople.map((identity) => (
                <li key={identity.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{identity.name}</span>
                  <button type="button" onClick={() => onUnblock(identity.id)} className="h-9 shrink-0 rounded-full border border-border px-3 text-sm">
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
            {canBlock.length > 0 ? (
              <label className="grid gap-1.5 text-sm">
                Block a player
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) onBlock(event.target.value);
                    event.target.value = "";
                  }}
                  className="h-11 rounded-xl border border-border bg-bg px-3 text-base text-fg outline-none sm:text-sm"
                >
                  <option value="">Choose</option>
                  {canBlock.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identity.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </Card>

          <DangerZone onExportData={onExportData} onDeleteAccount={onDeleteAccount} />
        </div>
      </div>
    </div>
  );
}

function PolicySelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; detail: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${
              value === option.id ? "border-violet/50 bg-violet/10" : "border-border bg-bg hover:bg-bg-subtle"
            }`}
          >
            <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${value === option.id ? "border-violet bg-violet" : "border-border"}`} aria-hidden />
            <span>
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted">{option.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DangerZone({ onExportData, onDeleteAccount }: { onExportData: () => Promise<void>; onDeleteAccount: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  return (
    <Card id="danger" title="Data & account">
      <div className="grid gap-2">
        <p className="text-sm font-medium">Request data archive</p>
        <p className="text-sm text-muted">Download a .txt file with your profile, per-game scores, badges, clans, and message history.</p>
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            setExporting(true);
            void onExportData().finally(() => setExporting(false));
          }}
          className="h-11 w-fit rounded-full border border-border px-5 text-sm font-medium disabled:opacity-50"
        >
          {exporting ? "Preparing…" : "Request data archive"}
        </button>
      </div>

      <div className="mt-2 grid gap-2 border-t border-border pt-5">
        <p className="text-sm font-medium text-danger">Delete account</p>
        <p className="text-sm text-muted">Permanently removes your profile and KOBAid from the database. This cannot be undone.</p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="btn-danger h-11 w-fit rounded-full bg-danger px-5 text-sm font-semibold text-bg"
        >
          Delete account
        </button>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-bg-elevated p-6">
            <h3 className="text-lg font-semibold text-danger">Delete your account?</h3>
            <p className="mt-2 text-sm text-muted">
              This permanently deletes your profile, scores, badges, clans you own, and message history. Your gamertag cannot be recovered. Type DELETE to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              className="mt-4 h-11 w-full rounded-xl border border-border bg-bg px-3 text-base outline-none sm:text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="h-11 flex-1 rounded-full border border-border text-sm font-medium">
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmText !== "DELETE" || deleting}
                onClick={() => {
                  setDeleting(true);
                  void onDeleteAccount();
                }}
                className="btn-danger h-11 flex-1 rounded-full bg-danger text-sm font-semibold text-bg disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function RegionPicker({
  viewer,
  onRegion,
}: {
  viewer: Identity;
  onRegion: (region: PublicRegion) => Promise<{ ok: true } | { ok: false; reason: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PUBLIC_REGIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onRegion(item.id).then((result) => {
                setBusy(false);
                setNote(result.ok ? "Region saved." : result.reason);
              });
            }}
            className={`h-9 rounded-full px-3.5 text-xs font-semibold ${viewer.region === item.id ? "bg-fg text-bg" : "bg-bg text-muted"}`}
          >
            {regionLabel(item.id)}
          </button>
        ))}
      </div>
      {note ? <FadeNote text={note} /> : null}
    </div>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-label={ok ? "Available" : "Not available"}
      className={`shrink-0 ${ok ? "text-ok" : "text-muted"}`}
    >
      {ok ? (
        <path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M7 7 17 17M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

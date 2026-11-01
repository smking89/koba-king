import { useState } from "react";
import { Button } from "@/components/ui";
import { SiteFooter } from "@/components/site-footer";

export type AuthProvider = "email" | "steam" | "xbox" | "discord";

export interface KobaAccount {
  provider: AuthProvider;
  name: string;
  email?: string;
  viewerId: string;
}

const KEY = "koba-account";
const USERS = "koba-users";

interface StoredUser {
  email: string;
  name: string;
  salt: string;
  hash: string;
}

const OAUTH: {
  id: Exclude<AuthProvider, "email">;
  label: string;
  viewerId: string;
  name: string;
  scopes: string[];
  fill: string;
}[] = [
  { id: "steam", label: "Steam", viewerId: "koba_steam", name: "Steam player", scopes: ["openid", "profile"], fill: "#171a21" },
  { id: "xbox", label: "Xbox", viewerId: "koba_xbox", name: "Xbox player", scopes: ["XboxLive.signin", "Gamertag"], fill: "#107C10" },
  { id: "discord", label: "Discord", viewerId: "koba_discord", name: "Discord player", scopes: ["identify"], fill: "#5865F2" },
];

export function readAccount(): KobaAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as KobaAccount) : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: KobaAccount | null) {
  if (typeof window === "undefined") return;
  if (!account) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, JSON.stringify(account));
}

function users(): StoredUser[] {
  try {
    const raw = window.localStorage.getItem(USERS);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

export async function changeEmail(currentEmail: string | undefined, nextEmail: string, password: string) {
  const mail = nextEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false as const, reason: "Use a real email address." };
  if (password.length < 8) return { ok: false as const, reason: "Password needs at least 8 characters." };
  const list = users();
  if (list.some((user) => user.email === mail && user.email !== currentEmail)) return { ok: false as const, reason: "That email is already registered." };
  const found = currentEmail ? list.find((user) => user.email === currentEmail) : undefined;
  if (found) {
    const hash = await digest(found.salt, password);
    if (hash !== found.hash) return { ok: false as const, reason: "That password does not match." };
    window.localStorage.setItem(USERS, JSON.stringify(list.map((user) => (user.email === found.email ? { ...user, email: mail } : user))));
    return { ok: true as const, email: mail };
  }
  const salt = crypto.randomUUID();
  const hash = await digest(salt, password);
  window.localStorage.setItem(USERS, JSON.stringify([...list, { email: mail, name: mail.split("@")[0], salt, hash }]));
  return { ok: true as const, email: mail };
}

export async function changePassword(email: string | undefined, currentPassword: string, nextPassword: string) {
  if (!email) return { ok: false as const, reason: "Add an email before setting a password." };
  if (nextPassword.length < 8) return { ok: false as const, reason: "Password needs at least 8 characters." };
  const list = users();
  const found = list.find((user) => user.email === email);
  if (!found) return changeEmail(undefined, email, nextPassword).then((result) => (result.ok ? { ok: true as const } : result));
  const hash = await digest(found.salt, currentPassword);
  if (hash !== found.hash) return { ok: false as const, reason: "That password does not match." };
  const salt = crypto.randomUUID();
  const next = await digest(salt, nextPassword);
  window.localStorage.setItem(USERS, JSON.stringify(list.map((user) => (user.email === email ? { ...user, salt, hash: next } : user))));
  return { ok: true as const };
}

async function digest(salt: string, password: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function AuthScreen({ onEnter }: { onEnter: (account: KobaAccount) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauth, setOauth] = useState<(typeof OAUTH)[number] | null>(null);

  const submit = async () => {
    setError("");
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("Use a real email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const list = users();
      if (mode === "up") {
        const display = name.trim();
        if (display.length < 2) {
          setError("Name needs at least 2 characters.");
          return;
        }
        if (list.some((user) => user.email === mail)) {
          setError("That email is already registered. Sign in instead.");
          return;
        }
        const salt = crypto.randomUUID();
        const hash = await digest(salt, password);
        const next = [...list, { email: mail, name: display, salt, hash }];
        window.localStorage.setItem(USERS, JSON.stringify(next));
        onEnter({ provider: "email", name: display, email: mail, viewerId: `koba_${mail.split("@")[0]!.replace(/[^a-z0-9_]/g, "").slice(0, 16)}` });
        return;
      }
      const found = list.find((user) => user.email === mail);
      if (!found) {
        setError("No account for that email. Register first.");
        return;
      }
      const hash = await digest(found.salt, password);
      if (hash !== found.hash) {
        setError("That password does not match.");
        return;
      }        onEnter({ provider: "email", name: found.name, email: mail, viewerId: `koba_${mail.split("@")[0]!.replace(/[^a-z0-9_]/g, "").slice(0, 16)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-28 text-fg">
      <div className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-md">
        <div className="mb-2 flex flex-col items-center gap-1 text-center">
          <img
            src="/brand/koba-wordmark-tight.png"
            alt="KOBA"
            className="mx-auto block h-12 w-auto max-w-[220px] object-contain"
          />
          <span className="block text-[10px] tracking-[0.16em] text-violet">PLAY · COMPETE · CONNECT</span>
        </div>
        <p className="mt-3 text-center text-sm text-muted">Same way you sign in everywhere else. Email stays here. Steam, Xbox, and Discord do the rest.</p>
        <div className="mt-6 rounded-3xl border border-border bg-bg-elevated p-4">
          {oauth ? (
            <div className="grid gap-4">
              <div className="flex items-center gap-3">
                <ProviderMark id={oauth.id} />
                <div>
                  <p className="text-sm font-medium">Authorize {oauth.label}</p>
                  <p className="text-sm text-muted">KOBA is requesting these scopes. No password is stored.</p>
                </div>
              </div>
              <ul className="grid gap-1">
                {oauth.scopes.map((scope) => (
                  <li key={scope} className="font-mono text-xs text-muted">
                    {scope}
                  </li>
                ))}
              </ul>
              <p className="text-sm">Continue as {oauth.name}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="ghost" onClick={() => setOauth(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    window.setTimeout(() => {
                      onEnter({ provider: oauth.id, name: oauth.name, viewerId: oauth.viewerId });
                    }, 420);
                  }}
                >
                  {busy ? "Authorizing…" : "Authorize"}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={mode === "in"} onClick={() => setMode("in")} className="tab-plain">
                  Sign in
                </button>
                <button type="button" aria-pressed={mode === "up"} onClick={() => setMode("up")} className="tab-plain">
                  Register
                </button>
              </div>
              {mode === "up" ? (
                <label className="grid gap-1 text-sm">
                  Name
                  <input suppressHydrationWarning value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-11 rounded-xl border border-border bg-bg px-3" />
                </label>
              ) : null}
              <label className="grid gap-1 text-sm">
                Email
                <input suppressHydrationWarning value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="h-11 rounded-xl border border-border bg-bg px-3" />
              </label>
              <label className="grid gap-1 text-sm">
                Password
                <input suppressHydrationWarning value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} className="h-11 rounded-xl border border-border bg-bg px-3" />
              </label>
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? "Checking…" : mode === "up" ? "Create account" : "Sign in"}
              </Button>
              <p className="text-center font-mono text-xs tracking-widest text-faint uppercase">Or</p>
              <div className="grid gap-2">
                {OAUTH.map((provider) => (
                  <button key={provider.id} type="button" onClick={() => setOauth(provider)} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-bg px-3 text-left text-sm">
                    <ProviderMark id={provider.id} />
                    Continue with {provider.label}
                  </button>
                ))}
              </div>
            </form>
          )}
        </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function ProviderMark({ id }: { id: Exclude<AuthProvider, "email"> }) {
  return <img src={`/brand/logo-${id}.svg`} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0" />;
}

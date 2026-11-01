import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authClient, signIn } from "@/lib/auth/client";
import { loadSignInOptions } from "@/lib/auth/api";
import type { SignInOptions } from "@/lib/auth/status.server";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/login")({ component: LoginPage });

function PlatformButton({ onClick, icon, label }: { onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-border px-4 text-sm font-medium hover:bg-bg-subtle"
    >
      <img src={icon} alt="" className="platform-logo h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetNote, setResetNote] = useState("");
  const [options, setOptions] = useState<SignInOptions | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSignInOptions()
      .then((value) => {
        if (!cancelled) setOptions(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const xboxReady = Boolean(options?.authEnabled && options?.xbox);

  const startXbox = () => {
    if (!xboxReady) {
      setError("Xbox sign-in needs this build's Xbox client id and secret before it can start.");
      return;
    }
    void signIn("xbox", { callbackURL: "/" });
  };

  if (isPending) return null;
  if (user) return <Navigate to="/" />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email: email.trim().toLowerCase(), password, name: name.trim() || email.trim() })
          : await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (result.error) setError(result.error.message ?? "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg pb-28 text-fg">
      <div className="absolute top-3 right-3 z-10">
        <ThemeToggle />
      </div>
      <div className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-2 flex flex-col items-center gap-1 text-center">
            <img
              src="/brand/koba-wordmark-tight.png"
              alt="KOBA"
              className="mx-auto block h-12 w-auto max-w-[220px] object-contain"
            />
            <span className="text-[10px] tracking-[0.16em] text-violet">PLAY · COMPETE · CONNECT</span>
          </div>
          <p className="mt-3 text-center text-sm text-muted">{mode === "up" ? "Create your account" : "Sign in"}</p>
          <div className="mt-6 grid gap-3 rounded-3xl border border-border bg-bg-elevated p-4">
            <PlatformButton onClick={startXbox} icon="/brand/logo-xbox.svg" label="Continue with Xbox" />
            {options && (!options.authEnabled || !options.xbox) ? (
              <p className="text-center text-[11px] text-faint">
                {!options.authEnabled
                  ? "External sign-in is off in this preview."
                  : "Xbox turns on once its keys are configured for this build."}
              </p>
            ) : null}
            <div className="flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <form className="grid gap-3" onSubmit={submit}>
              {mode === "up" ? (
                <label className="grid gap-1 text-sm">
                  Name
                  <input value={name} onChange={(event) => setName(event.target.value)} type="text" autoComplete="name" className="h-11 rounded-xl border border-border bg-bg px-3 outline-none" />
                </label>
              ) : null}
              <label className="grid gap-1 text-sm">
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="h-11 rounded-xl border border-border bg-bg px-3 outline-none" />
              </label>
              <label className="grid gap-1 text-sm">
                Password
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  className="h-11 rounded-xl border border-border bg-bg px-3 outline-none"
                />
              </label>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              {resetNote ? <p className="text-sm text-ok">{resetNote}</p> : null}
              <button type="submit" disabled={busy} className="brand-gradient h-11 rounded-full text-sm font-semibold text-black disabled:opacity-60">
                {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
              </button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setMode(mode === "up" ? "in" : "up")} className="text-sm text-muted underline-offset-4 hover:underline">
                  {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
                </button>
                {mode === "in" ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setError("");
                      setResetNote("");
                      if (!email.trim()) {
                        setError("Enter your email above first.");
                        return;
                      }
                      setBusy(true);
                      try {
                        await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: "/login" });
                        setResetNote("If that email exists, a reset link is on its way.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="text-sm text-muted underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

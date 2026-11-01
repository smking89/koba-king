import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Briefcase, Check, Gamepad2, Layers, Monitor, X } from "lucide-react";
import { checkHandleAvailable, completeOnboarding } from "@/lib/profile/api";
import { authEnabled, signIn } from "@/lib/auth/client";
import { loadSignInOptions } from "@/lib/auth/api";
import type { SignInOptions } from "@/lib/auth/status.server";
import type { BadgeView } from "@/lib/badges/badges.server";
import type { MyProfile } from "@/lib/profile/profile.server";
import { PUBLIC_REGIONS, type PublicRegion } from "@/site/regions";

type Availability = "idle" | "checking" | "available" | "taken";

const STEPS = ["Account", "Platform", "Interests", "Profile"] as const;

const ACCOUNT_TYPES = [
  {
    id: "player",
    label: "Player",
    blurb: "Compete, track your stats, join clans and climb the boards.",
    icon: Gamepad2,
  },
  {
    id: "business",
    label: "Business",
    blurb: "Run servers, sell in the marketplace and advertise to players.",
    icon: Briefcase,
  },
] as const;

const PLAY_PLATFORMS = [
  { id: "pc", label: "PC", blurb: "Steam, Epic and desktop servers.", icon: Monitor },
  { id: "console", label: "Console", blurb: "PlayStation and Xbox titles.", icon: Gamepad2 },
  { id: "both", label: "Both", blurb: "I play across PC and console.", icon: Layers },
] as const;

const INTERESTS = [
  { id: "rust", label: "Rust" },
  { id: "dayz", label: "DayZ" },
  { id: "ark", label: "ARK" },
  { id: "minecraft", label: "Minecraft" },
  { id: "pvp", label: "PvP" },
  { id: "survival", label: "Survival" },
  { id: "raiding", label: "Raiding" },
  { id: "roleplay", label: "Roleplay" },
  { id: "basebuilding", label: "Base building" },
  { id: "clans", label: "Clans" },
  { id: "trading", label: "Trading" },
  { id: "esports", label: "Esports" },
] as const;

const MIN_INTERESTS = 4;

function ProviderButton({
  label,
  logo,
  onClick,
}: {
  label: string;
  logo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border bg-bg px-4 text-sm font-medium hover:bg-bg-subtle"
    >
      <img src={logo} alt="" className="platform-logo h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

export function OnboardingGate({
  kobaTag,
  onDone,
}: {
  kobaTag: string | null;
  onDone: (profile: MyProfile, awarded: BadgeView[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [handle, setHandle] = useState("");
  const [region, setRegion] = useState<PublicRegion | null>(null);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signInOptions, setSignInOptions] = useState<SignInOptions>({ xbox: false, authEnabled });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadSignInOptions()
      .then((options) => {
        if (!cancelled) setSignInOptions(options);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleaned = handle.trim().toLowerCase();
    window.clearTimeout(timer.current);
    if (!cleaned) {
      setAvailability("idle");
      return;
    }
    if (!/^[a-z][a-z0-9_]{2,15}$/.test(cleaned)) {
      setAvailability("taken");
      return;
    }
    setAvailability("checking");
    timer.current = window.setTimeout(() => {
      void checkHandleAvailable({ data: { handle: cleaned } }).then((result) => {
        setAvailability(result.available ? "available" : "taken");
      });
    }, 320);
    return () => window.clearTimeout(timer.current);
  }, [handle]);

  const toggleInterest = (id: string) => {
    setInterests((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setNote("");
  };

  const startProvider = (provider: "xbox") => {
    setNote("");
    if (!authEnabled) {
      setNote("Xbox sign-in is off in this preview. Pick a username below to finish your account.");
      return;
    }
    if (!signInOptions.xbox) {
      setNote("Xbox sign-in needs this build's Xbox client id and secret before it can start.");
      return;
    }
    void signIn("xbox", { callbackURL: "/" });
  };

  const canContinue =
    (step === 0 && accountType !== null) ||
    (step === 1 && platform !== null) ||
    (step === 2 && interests.length >= MIN_INTERESTS) ||
    step === 3;
  const canSubmit = step === 3 && availability === "available" && region !== null && !submitting;

  const next = () => {
    setNote("");
    if (step === 2 && interests.length < MIN_INTERESTS) {
      setNote(`Pick at least ${MIN_INTERESTS} interests.`);
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const submit = () => {
    if (!accountType || !platform || !region) return;
    setSubmitting(true);
    setNote("");
    void completeOnboarding({
      data: {
        handle: handle.trim().toLowerCase(),
        region,
        accountType,
        platform,
        interests,
      },
    })
      .then((result) => {
        if ("error" in result) {
          setNote(result.error);
          return;
        }
        onDone(result, result.awarded);
      })
      .catch(() => setNote("Couldn't create that account. Try again."))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between gap-3">
          <img src="/brand/koba-wordmark-tight.png" alt="KOBA" className="block h-8 w-auto max-w-[160px] object-contain" />
          <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        <div className="mt-4 flex gap-1.5" aria-hidden>
          {STEPS.map((label, index) => (
            <span key={label} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-fg" : "bg-border"}`} />
          ))}
        </div>

        <div className="mt-6 grid flex-1 content-center">
          {step === 0 ? (
            <section aria-labelledby="signup-account">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-violet uppercase">Create your account</p>
              <h1 id="signup-account" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                What are you here for?
              </h1>
              <p className="mt-1 text-sm text-muted">This sets up your workspace. You can change it later in settings.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {ACCOUNT_TYPES.map((option) => {
                  const Icon = option.icon;
                  const active = accountType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setAccountType(option.id);
                        setNote("");
                      }}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        active ? "border-fg bg-bg-subtle" : "border-border bg-bg-elevated hover:border-fg/40"
                      }`}
                    >
                      <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? "bg-fg text-bg" : "bg-bg-subtle text-fg"}`}>
                        <Icon size={19} aria-hidden />
                      </span>
                      <span className="mt-3 flex items-center gap-2 text-base font-semibold">
                        {option.label}
                        {active ? <Check size={16} className="text-fg" aria-hidden /> : null}
                      </span>
                      <span className="mt-1 block text-sm text-muted">{option.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="signup-platform">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-violet uppercase">Where you play</p>
              <h1 id="signup-platform" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                PC or console?
              </h1>
              <p className="mt-1 text-sm text-muted">We use this to show the right lobbies, servers and rankings.</p>
              <div className="mt-5 grid gap-3">
                {PLAY_PLATFORMS.map((option) => {
                  const Icon = option.icon;
                  const active = platform === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setPlatform(option.id);
                        setNote("");
                      }}
                      className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                        active ? "border-fg bg-bg-subtle" : "border-border bg-bg-elevated hover:border-fg/40"
                      }`}
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-fg text-bg" : "bg-bg-subtle text-fg"}`}>
                        <Icon size={19} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold">{option.label}</span>
                        <span className="block text-sm text-muted">{option.blurb}</span>
                      </span>
                      {active ? <Check size={18} aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="signup-interests">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-violet uppercase">Your feed</p>
              <h1 id="signup-interests" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pick at least four interests
              </h1>
              <p className="mt-1 text-sm text-muted">
                Hashtags tune Discover, Compete and your home feed. {interests.length} of {MIN_INTERESTS} picked.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {INTERESTS.map((interest) => {
                  const active = interests.includes(interest.id);
                  return (
                    <button
                      key={interest.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={`#${interest.label}`}
                      onClick={() => toggleInterest(interest.id)}
                      className={`inline-flex h-11 items-center gap-1 rounded-full border px-4 text-sm font-medium transition-colors ${
                        active ? "border-fg bg-fg text-bg" : "border-border bg-bg text-fg hover:border-fg/40"
                      }`}
                    >
                      <span className="text-faint">#</span>
                      {interest.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="signup-profile" className="grid gap-5">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-violet uppercase">Almost there</p>
                <h1 id="signup-profile" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Claim your KOBA ID
                </h1>
                <p className="mt-1 text-sm text-muted">This is the name other players see. You can change it later.</p>
              </div>

              {kobaTag ? (
                <div className="rounded-2xl border border-border bg-bg-elevated p-3">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Your KOBA ID</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-wider text-fg">{kobaTag}</p>
                </div>
              ) : null}

              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  Username
                  <span className="flex h-11 items-center gap-2 rounded-full border border-border bg-bg px-4">
                    <span className="text-muted">@</span>
                    <input
                      value={handle}
                      onChange={(event) => setHandle(event.target.value)}
                      placeholder="yourname"
                      aria-label="Username"
                      autoComplete="username"
                      className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                    {availability === "checking" ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden /> : null}
                    {availability === "available" ? <Check size={18} className="shrink-0 text-ok" aria-label="Available" /> : null}
                    {availability === "taken" && handle.trim() ? <X size={18} className="shrink-0 text-danger" aria-label="Not available" /> : null}
                  </span>
                  {availability === "taken" && handle.trim() ? <span className="text-xs text-danger">That username isn't available.</span> : null}
                </label>

                <div className="grid gap-1.5 text-sm">
                  Region
                  <div className="flex flex-wrap gap-1.5">
                    {PUBLIC_REGIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setRegion(item.id);
                          setNote("");
                        }}
                        aria-pressed={region === item.id}
                        className={`h-9 rounded-full px-3.5 text-xs font-semibold ${region === item.id ? "bg-fg text-bg" : "bg-bg text-muted"}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 rounded-2xl border border-border bg-bg-elevated p-3">
                  <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Or use a platform account</p>
                  <ProviderButton label="Continue with Xbox" logo="/brand/logo-xbox.svg" onClick={() => startProvider("xbox")} />
                </div>
              </div>
            </section>
          ) : null}

          {note ? (
            <p role="status" className="mt-4 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-muted">
              {note}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setNote("");
                setStep((current) => Math.max(0, current - 1));
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium hover:bg-bg-subtle"
            >
              <ArrowLeft size={15} aria-hidden /> Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={next}
              className="brand-gradient ml-auto inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue <ArrowRight size={15} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="brand-gradient ml-auto h-11 flex-1 rounded-full px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              {submitting ? "Creating…" : "Create my account"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

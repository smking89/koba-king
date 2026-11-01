import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Gamepad2,
  Globe,
  Server,
  ShieldCheck,
  Terminal,
  Trophy,
  Users,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SUPPORTED_GAMES } from "@/site/games";
import { PUBLIC_REGIONS } from "@/site/regions";

const NAV = [
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/developers", label: "Developers" },
  { to: "/apps", label: "App store" },
] as const;

const FEATURES = [
  {
    icon: Trophy,
    title: "One profile, every server",
    body: "Your KOBA score follows you across every linked server and every title. No per-server accounts, no starting over.",
  },
  {
    icon: Globe,
    title: "PC and console, side by side",
    body: "Link an Xbox or PlayStation identity, then play where your friends are. Boards stay separate per platform.",
  },
  {
    icon: Users,
    title: "Clans that actually run",
    body: "Recruit, set roles, track member activity and take your clan's name onto the regional boards.",
  },
  {
    icon: ShieldCheck,
    title: "Verified matches only",
    body: "Every event passes signature, clock and shape checks before it moves a rank. Cheated scores never reach the board.",
  },
  {
    icon: Server,
    title: "Built for server owners",
    body: "Register a host, watch population in real time, and push wipes, events and announcements straight to your players.",
  },
  {
    icon: Terminal,
    title: "An API you can ship on",
    body: "Player profiles, leaderboards, match results and webhooks — documented, sandboxed, and ready for your plugin.",
  },
];

/**
 * Public homepage. Signed-out visitors land here: the pitch, the proof, and
 * the two doors in (create an account, or browse the boards read-only).
 */
export function LandingPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  // Auth-off builds always resolve to the dev user, so "already in" has to win
  // over "sign in" — otherwise this button bounces straight back off /login.
  const signedIn = Boolean(user);
  const enterLabel = signedIn ? "Open KOBA" : "Get started";
  const enter = () => {
    // /home is the splat route's home screen, not a registered top-level path.
    if (signedIn) void navigate({ to: "/$", params: { _splat: "home" } });
    else void navigate({ to: "/login" });
  };
  const browse = () => void navigate({ to: "/leaderboard" });

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-8">
          <Link to="/" aria-label="KOBA home" className="shrink-0">
            <img
              src="/brand/koba-wordmark-tight.png"
              alt="KOBA"
              className="h-8 w-auto object-contain sm:h-9"
            />
          </Link>

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-bg-subtle hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {!signedIn ? (
              <button
                type="button"
                onClick={enter}
                className="hidden h-10 rounded-full px-4 text-sm font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-fg sm:inline-flex sm:items-center"
              >
                Sign in
              </button>
            ) : null}
            <button
              type="button"
              onClick={enter}
              className="brand-gradient inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
            >
              {enterLabel}
            </button>
          </div>
        </div>
      </header>

      {/* Hero ---------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <img src="/brand/hero-background.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/60" />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 text-white sm:px-8 sm:py-24">
          <img
            src="/brand/koba-mark-tight.png"
            alt=""
            aria-hidden
            className="brand-mark-slant mb-4 h-12 w-12 object-contain sm:h-16 sm:w-16"
          />
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/80 uppercase">
            Competitive gaming, one home
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Every rank you earn,
            <br />
            on every server you play.
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/75 sm:text-lg">
            KOBA links your PC and console accounts into a single profile, scores the matches
            your servers report, and puts you on boards your rivals can't argue with.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={enter}
              className="brand-gradient inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
            >
              {signedIn ? "Open KOBA" : "Create your account"}
              <ArrowRight size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={browse}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/10"
            >
              Browse the leaderboard
            </button>
          </div>

          <p className="mt-6 text-xs text-white/55">
            Free for players. No card required.
          </p>
        </div>
      </section>

      {/* Stats --------------------------------------------------------- */}
      <section className="border-b border-border bg-bg-elevated">
        <dl className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px px-4 sm:px-8 lg:grid-cols-4">
          {[
            { term: "Titles supported", value: String(SUPPORTED_GAMES.length) },
            { term: "Regions covered", value: String(PUBLIC_REGIONS.length) },
            { term: "Platforms", value: "PC · Console" },
            { term: "Event checks", value: "Signature · Clock · Shape" },
          ].map((item) => (
            <div key={item.term} className="py-6 sm:py-8">
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                {item.term}
              </dt>
              <dd className="mt-1.5 text-xl font-bold tabular-nums text-fg sm:text-2xl">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Features ------------------------------------------------------ */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
          What you get
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          The platform underneath your community
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-3xl border border-border bg-bg-elevated p-6 transition-colors hover:border-fg/30"
              >
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-bg-subtle text-fg">
                  <Icon size={18} aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-fg">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Games --------------------------------------------------------- */}
      <section className="border-y border-border bg-bg-elevated">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-8 sm:py-16">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
            Works with the games you already run
          </p>
          <ul className="mt-6 flex flex-wrap gap-3">
            {SUPPORTED_GAMES.map((game) => (
              <li
                key={game.id}
                className="flex items-center gap-2.5 rounded-full border border-border bg-bg px-3 py-2"
              >
                <img
                  src={game.icon}
                  alt=""
                  aria-hidden
                  className="h-6 w-6 rounded-md object-cover"
                  loading="lazy"
                />
                <span className="text-sm font-medium text-fg">{game.name}</span>
                <span className="text-[10px] font-semibold tracking-wider text-fg/45 uppercase">
                  {game.devices.join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-center gap-2 text-sm text-muted">
            <Gamepad2 size={15} aria-hidden />
            Server owners connect a title through the KOBA connector — no custom backend required.
          </p>
        </div>
      </section>

      {/* Leaderboard teaser -------------------------------------------- */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
              The proof
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              Ranks the whole community can see
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
              Every score on the public board comes from a match a server actually reported and the
              gates actually accepted. Filter by region, follow a rival, then go take the spot.
            </p>
            <button
              type="button"
              onClick={browse}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg transition-transform hover:scale-[1.02]"
            >
              View the leaderboard
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>

          <ul className="grid gap-3">
            {[
              "Sync Xbox and PlayStation identities into one profile",
              "Clan boards, regional boards and per-server boards",
              "Live match events with anti-cheat verification",
              "Follow, message and challenge players across titles",
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-2xl border border-border bg-bg-elevated px-4 py-3.5 text-sm text-muted"
              >
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA ----------------------------------------------------- */}
      <section className="border-t border-border bg-bg-elevated">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="max-w-xl text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Your next match is already being counted.
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted">
              {signedIn
                ? "You're already in — jump back into your feed, your clans and your boards."
                : "Create a KOBA account, link the platforms you play on, and put your name on the board."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={enter}
              className="brand-gradient inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
            >
              {signedIn ? "Open KOBA" : "Get started free"}
              <ArrowRight size={16} aria-hidden />
            </button>
            <Link
              to="/developers"
              className="inline-flex h-12 items-center rounded-full border border-border px-6 text-sm font-semibold text-fg transition-colors hover:border-fg/50"
            >
              Read the API docs
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

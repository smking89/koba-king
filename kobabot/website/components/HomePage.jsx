import RootLayout from "./RootLayout";
import Icon from "../src/icons/Icon";
import PlanGrid from "../src/components/PlanGrid";
import kobabotLogo from "../assets/kobabot-logo.png";
import frankMascot from "../assets/frank-mascot.webp";

const FEATURES = [
  { icon: "bolt", label: "Automate", caption: "Save Time" },
  { icon: "shield", label: "Grow", caption: "Your Community" },
  { icon: "users", label: "Engage", caption: "Your Players" },
  { icon: "crown", label: "Level Up", caption: "Your Server" },
];

// Real module names KOBA Bot actually ships (AutoKit, Economy, Marketplace,
// Auction) - no currency claim here since the in-game economy runs on each
// server's OWN named currencies (set up via /shop-panel), never real-money
// fiat like USD/EUR/BTC. This is a decorative preview of the real WebRCON
// dashboard panel players see in Discord, not a live log.
const SERVER_LOG = [
  { level: "INFO", text: "KOBABOT v3.8.2 | Server Connected" },
  { level: "INFO", text: "Players Online: 24/100" },
  { level: "INFO", text: "AutoKit: Ready" },
  { level: "INFO", text: "Economy: Loaded" },
  { level: "INFO", text: "Marketplace: Active" },
  { level: "INFO", text: "Auction System: Running" },
];

const MODULES = ["AutoKit", "Economy", "Marketplace", "Auction", "Clan Wars", "+ More"];

const WHY = [
  { icon: "grid", title: "Full Modular System", caption: "Everything you need in one platform." },
  { icon: "bolt", title: "Easy Setup", caption: "Get running in minutes." },
  { icon: "support", title: "24/7 Support", caption: "We're here when you need us." },
  { icon: "gamepad", title: "Built for Rust", caption: "Optimized for Console Edition." },
];

function HomePage() {
  return (
    <div className="bb-grid">
      <section className="relative overflow-hidden rounded-2xl bg-[url('/assets/hero-bg.jpg')] bg-cover bg-center">
        <div className="absolute inset-0 bg-gradient-to-r from-bb-void/90 via-bb-void/70 to-bb-void/40" />

        <div className="bb-grid bb-grid--2 relative z-10 p-[var(--bb-space-6)] lg:p-[var(--bb-space-10)]">
          <div className="flex flex-col justify-center gap-[var(--bb-space-6)]">
            <div>
              <h1 className="bb-h1 bb-graffiti normal-case">
                Work Smarter with{" "}
                <span className="bb-gradient-text">KOBA Bot Pro</span>
              </h1>
              <p className="bb-body-sm mt-[var(--bb-space-4)] max-w-md">
                The ultimate server management platform for Rust Console Edition.
              </p>
            </div>

            <div className="bb-grid bb-grid--4">
              {FEATURES.map((feature) => (
                <div key={feature.label} className="flex flex-col items-start gap-[var(--bb-space-1)]">
                  <Icon name={feature.icon} className="bb-anim-icon w-6 h-6 text-bb-green" />
                  <span className="bb-body-sm font-bold text-bb-text-primary">{feature.label}</span>
                  <span className="bb-caption">{feature.caption}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <a href="/trial" className="bb-btn bb-btn--primary bb-btn--lg bb-anim-press w-fit">
                <Icon name="crown" className="bb-anim-icon w-5 h-5" />
                30-Day Free Trial
                <Icon name="chevronRight" className="bb-anim-icon w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center gap-[var(--bb-space-6)] lg:flex-row lg:items-center lg:justify-end">
            <img
              src={frankMascot}
              alt="Frank, the KOBA Bot mascot, giving a thumbs up"
              className="bb-anim-pulse max-h-72 w-auto shrink-0 lg:max-h-80"
            />

            <div
              className="bb-terminal bb-console-tilt bb-anim-slide-in bb-anim-pulse bb-anim-lift hidden w-80 shrink-0 lg:block"
              style={{ transform: "perspective(1600px) rotateY(-6deg) rotateX(2deg)", transformOrigin: "center" }}
            >
              <div className="bb-terminal__header">
                <span className="bb-terminal__dot bb-terminal__dot--red" />
                <span className="bb-terminal__dot bb-terminal__dot--yellow" />
                <span className="bb-terminal__dot bb-terminal__dot--green" />
                <span className="bb-terminal__title">Server Logs (Live)</span>
              </div>
              <div className="bb-terminal__body">
                {SERVER_LOG.map((line, i) => (
                  <p key={i}>
                    <span className="text-bb-text-muted">[14:32:{String(17 + i).padStart(2, "0")}]</span>{" "}
                    <span className="text-bb-gold">[{line.level}]</span> {line.text}
                  </p>
                ))}
              </div>
              <div className="bb-terminal__footer">
                {MODULES.map((mod) => (
                  <span key={mod} className="bb-badge bb-badge--purple">
                    {mod}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bb-terminal bb-anim-slide-in lg:hidden">
            <div className="bb-terminal__header">
              <span className="bb-terminal__dot bb-terminal__dot--red" />
              <span className="bb-terminal__dot bb-terminal__dot--yellow" />
              <span className="bb-terminal__dot bb-terminal__dot--green" />
              <span className="bb-terminal__title">Server Logs (Live)</span>
            </div>
            <div className="bb-terminal__body">
              {SERVER_LOG.map((line, i) => (
                <p key={i}>
                  <span className="text-bb-text-muted">[14:32:{String(17 + i).padStart(2, "0")}]</span>{" "}
                  <span className="text-bb-gold">[{line.level}]</span> {line.text}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <span className="bb-eyebrow">Pricing</span>
        <h2 className="bb-h2 mb-[var(--bb-space-4)]">Choose your plan. Unlock more.</h2>
        <PlanGrid />
      </section>

      <footer className="bb-card bb-card--flat flex flex-col items-center gap-[var(--bb-space-4)] text-center">
        <img src={kobabotLogo} alt="KOBA Bot" className="h-[var(--bb-space-10)] w-auto" />
        <span className="bb-eyebrow block">Why KOBA Bot.Store?</span>
        <span className="bb-body-sm">Powerful tools. Stronger communities.</span>

        <div className="bb-grid bb-grid--4">
          {WHY.map((item) => (
            <div key={item.title} className="flex flex-col items-center gap-[var(--bb-space-1)]">
              <Icon name={item.icon} className="bb-anim-icon w-5 h-5 text-bb-green" />
              <span className="bb-body-sm font-bold text-bb-text-primary">{item.title}</span>
              <span className="bb-caption">{item.caption}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

export default function HomeRoute() {
  return (
    <RootLayout>
      <HomePage />
    </RootLayout>
  );
}

export { HomePage };

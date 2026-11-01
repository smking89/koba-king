import { GAMES, getGame } from '../data/games';
import { BrandLockup } from './Brand';
import { BoltIcon, CheckIcon, CodeIcon, GameLogo, SwordsIcon, TargetIcon } from './ui';
import './landing.css';

const FEATURES = [
  {
    title: 'A deck, not a directory',
    copy: 'Every card is a real player: their rank, their region, the hours they actually play, and how reliably they show up.',
    icon: <SwordsIcon size={18} />,
  },
  {
    title: 'Rivals, not friends',
    copy: 'A mutual pass opens a rivalry with a kill-tier challenge attached — Skirmish, Vendetta or Execution.',
    icon: <TargetIcon size={18} />,
  },
  {
    title: 'Callouts when you are short',
    copy: 'Post a time window and a kill tier, and let the board fill the roster instead of spamming a Discord.',
    icon: <BoltIcon size={18} />,
  },
  {
    title: 'Built for the people who run servers',
    copy: 'Featured arenas, sponsored cards, campaign reporting and a REST API for everything else.',
    icon: <CodeIcon size={18} />,
  },
];

const GAME_STRIP = GAMES.slice(0, 10);

export function LandingPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a href="/" className="lp-brand" aria-label="KOBA home">
          <BrandLockup />
        </a>
        <nav className="lp-links" aria-label="Site">
          <a href="#how">How it works</a>
          <a href="#business">For business</a>
          <a href="#developers">Developers</a>
        </nav>
        <div className="lp-nav-actions">
          <a className="btn btn-text" href="/?business">
            Console
          </a>
          <a className="btn btn-gradient" href="/?app=1">
            Open the app
          </a>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-kicker">
              <i /> Competitive matchmaking · console &amp; PC
            </span>
            <h1>
              Swipe once.
              <br />
              <span>Find your rival.</span>
            </h1>
            <p className="lp-lede">
              KOBA replaces the group-finding slog with a deck of players who match your game, rank,
              region and schedule. Match back and you get a rivalry with something on the line.
            </p>
            <div className="lp-cta">
              <a className="btn btn-gradient btn-lg" href="/?app=1">
                Open the app
              </a>
              <a className="btn btn-outline btn-lg" href="/?business">
                Business console
              </a>
            </div>
            <ul className="lp-proof">
              <li>
                <CheckIcon size={13} /> 18 games
              </li>
              <li>
                <CheckIcon size={13} /> Rank &amp; region verified
              </li>
              <li>
                <CheckIcon size={13} /> Free for players
              </li>
            </ul>
          </div>

          <div className="lp-hero-art">
            <div className="phone">
              <div className="phone-notch" />
              <div className="phone-screen">
                <div className="lp-mock-top">
                  <BrandLockup />
                </div>
                <div
                  className="lp-mock-banner"
                  style={{
                    background: `radial-gradient(120% 90% at 78% 12%, ${getGame('valorant').accent[0]} 0%, ${getGame('valorant').accent[1]} 80%)`,
                  }}
                >
                  <span className="lp-mock-word">VAL</span>
                  <span className="lp-mock-ribbon">Immortal 2</span>
                  <div className="lp-mock-avatar" />
                  <span className="lp-mock-name">@nyx_ops</span>
                </div>
                <div className="lp-mock-body">
                  <div className="lp-mock-stats">
                    <div>
                      <strong>2,610</strong>
                      <span>RP</span>
                    </div>
                    <div>
                      <strong>94%</strong>
                      <span>reliable</span>
                    </div>
                    <div>
                      <strong>NA-E</strong>
                      <span>region</span>
                    </div>
                  </div>
                  <div className="lp-mock-actions">
                    <span className="lp-mock-pass">✕</span>
                    <span className="lp-mock-pass is-rival">⚔</span>
                  </div>
                </div>
                <div className="lp-mock-tabs">
                  <span className="is-active">Discover</span>
                  <span>Board</span>
                  <span>Rivals</span>
                  <span>You</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-games" aria-label="Supported games">
          {GAME_STRIP.map((game) => (
            <span className="lp-game" key={game.id} title={game.name}>
              <GameLogo game={game} />
            </span>
          ))}
        </section>

        <section className="lp-section" id="how">
          <header className="lp-section-head">
            <span className="lp-eyebrow">How it works</span>
            <h2>Three swipes to a locked challenge.</h2>
          </header>
          <div className="lp-steps">
            <article>
              <span className="lp-step">01</span>
              <h3>Set your card</h3>
              <p>
                Your ranks per game, platform, region and the windows you actually play. Upload your
                own avatar and banner so people recognise you.
              </p>
            </article>
            <article>
              <span className="lp-step">02</span>
              <h3>Swipe the deck</h3>
              <p>
                Cards are ranked by rank proximity, schedule overlap and reliability. Pass, or call them
                out as a rival.
              </p>
            </article>
            <article>
              <span className="lp-step">03</span>
              <h3>Lock it in</h3>
              <p>
                A mutual pass opens the arena lobby. Pick 3, 5 or 10 kills, agree a window, and the
                result settles RP for both of you.
              </p>
            </article>
          </div>
        </section>

        <section className="lp-section">
          <header className="lp-section-head">
            <span className="lp-eyebrow">Why it feels different</span>
            <h2>Matchmaking with a memory.</h2>
          </header>
          <div className="lp-feature-grid">
            {FEATURES.map((feature) => (
              <article className="lp-feature" key={feature.title}>
                <span className="lp-feature-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-business" id="business">
          <div className="lp-business-copy">
            <span className="lp-eyebrow is-light">For server owners &amp; advertisers</span>
            <h2>Your arena, in the deck.</h2>
            <p>
              Register servers, verify RCON, feature a placement and run self-serve campaigns that land
              as clearly labelled sponsored cards. Reporting, wallet and spend live in one console.
            </p>
            <div className="lp-business-actions">
              <a className="btn btn-brand" href="/?business">
                Open business console
              </a>
              <a className="btn btn-ghost" href="/?business">
                See ad portal
              </a>
            </div>
          </div>
          <div className="lp-business-stats">
            <div>
              <strong>12,480</strong>
              <span>app-driven joins a month</span>
            </div>
            <div>
              <strong>1,842</strong>
              <span>rivalries hosted</span>
            </div>
            <div>
              <strong>68%</strong>
              <span>bookmark the arena after a challenge</span>
            </div>
          </div>
        </section>

        <section className="lp-section" id="developers">
          <div className="lp-dev">
            <div className="lp-dev-copy">
              <span className="lp-eyebrow">Developers</span>
              <h2>An API that resolves the match.</h2>
              <p>
                Scoped keys, signed webhooks and a sandbox that never moves points. Call the same
                endpoints the portal documents, in the browser or from your orchestrator.
              </p>
              <ul className="lp-dev-list">
                <li>Bearer keys with per-scope permissions</li>
                <li>rivalry.formed · challenge.locked · match.resolved</li>
                <li>Idempotent resolution, 5 retries with backoff</li>
              </ul>
              <a className="btn btn-outline" href="/?business">
                Open the developer portal
              </a>
            </div>
            <pre className="lp-code">{`curl "https://api.koba.gg/v1/matches?status=locked" \\
  -H "Authorization: Bearer koba_live_***"

{
  "object": "list",
  "data": [
    { "id": "mt_4410", "kills": 5, "status": "locked" }
  ]
}`}</pre>
          </div>
        </section>

        <section className="lp-final">
          <h2>Somebody at your rank is online right now.</h2>
          <p>Swipe until you find the one who will actually review the loss.</p>
          <a className="btn btn-gradient btn-lg" href="/?app=1">
            Open the app
          </a>
          <span className="lp-final-note">Mobile first · the app opens in a phone frame on desktop</span>
        </section>
      </main>

      <footer className="lp-foot">
        <BrandLockup />
        <p>KOBA · matchmaking for people who take the rematch seriously.</p>
        <div className="lp-foot-links">
          <a href="#how">How it works</a>
          <a href="#business">Business</a>
          <a href="#developers">Developers</a>
        </div>
      </footer>
    </div>
  );
}

/** Desktop wrapper that presents the mobile-only product inside a phone. */
export function AppFrame() {
  return (
    <div className="frame">
      <header className="frame-bar">
        <a className="frame-home" href="/">
          <BrandLockup />
        </a>
        <span className="frame-note">The app is built for phones — desktop shows the site</span>
        <a className="btn btn-soft" href="/?business">
          Business console
        </a>
      </header>
      <div className="frame-body">
        <div className="phone phone-large">
          <div className="phone-notch" />
          <iframe className="phone-frame" src="/?embed=1" title="KOBA app" />
        </div>
        <div className="frame-copy">
          <h1>Mobile screens only.</h1>
          <p>
            The deck, the board and your rival card are designed for a thumb. This is the real app
            running at phone width — drag a card, post a callout, lock a challenge.
          </p>
          <ul>
            <li>Drag or use the pass / rival buttons</li>
            <li>Board replies raise the unread badge</li>
            <li>Everything saves to this browser</li>
          </ul>
          <a className="btn btn-outline" href="/">
            Back to the site
          </a>
        </div>
      </div>
    </div>
  );
}

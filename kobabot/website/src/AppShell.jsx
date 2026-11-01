import { useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import NavBar from "../components/NavBar";
import MobileTabBar from "../components/MobileTabBar";
import Icon from "./icons/Icon";

// This site no longer has a login system - Pricing/Shop/Marketplace/Team/
// LFG/Referral/Settings/Dashboard/Onboarding/Messages all depended on it
// and nobody actually used it (every one of those features already lives
// in Discord itself: the guild shop/marketplace panels, the Team Panel,
// LFG posts, /referral, /link). The public /servers directory browse page
// was removed the same way - it stays a real, usable Discord feature,
// just not mirrored on the website. What's left is just the marketing
// homepage and a support-ticket form, so the nav is just those two.
const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/support", label: "Support" },
];

const TAB_ITEMS = [
  { href: "/", label: "Home", icon: <Icon name="home" className="w-5 h-5" /> },
  { href: "/support", label: "Support", icon: <Icon name="support" className="w-5 h-5" /> },
];

/**
 * AppShell — dev-only stand-in for RootLayout.jsx.
 *
 * RootLayout.jsx renders <html>/<body>, which is correct for a Next.js
 * App Router layout but invalid inside a client-mounted Vite SPA (the
 * document shell already exists in index.html). This shell reproduces the
 * exact same structure/classes with a <div> root purely so the design
 * system can be exercised in the browser locally — RootLayout.jsx itself
 * is left untouched for the real Next.js integration.
 */
export default function AppShell({ children }) {
  const location = useLocation();

  return (
    <div className="bb-theme">
      <NavBar links={NAV_LINKS} activeHref={location.pathname} />

      <main className="bb-container">
        <div className="bb-spacer-bottom">
          {children}

          <footer className="bb-site-footer">
            <span className="bb-caption">
              &copy; {new Date().getFullYear()} KOBA Bot.Store. All rights reserved.
            </span>
            <nav className="bb-site-footer__links">
              <a href="/legal/terms" className="bb-caption">Terms of Service</a>
              <a href="/legal/privacy" className="bb-caption">Privacy Policy</a>
              <a href="/support" className="bb-caption">Support</a>
            </nav>
          </footer>
        </div>
      </main>

      <MobileTabBar items={TAB_ITEMS} activeHref={location.pathname} />
    </div>
  );
}

AppShell.propTypes = {
  children: PropTypes.node,
};

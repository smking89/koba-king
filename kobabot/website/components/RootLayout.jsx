import "../tokens.css";
import "../components.css";
import NavBar from "./NavBar";
import MobileTabBar from "./MobileTabBar";

/**
 * RootLayout — app shell shared by every route.
 *
 * Composes NavBar (desktop, ≥1024px) and MobileTabBar (mobile, <1024px).
 * Both are always rendered; `.bb-navbar` / `.bb-tabbar` in components.css
 * handle the display:none swap at the 1024px breakpoint, exactly as
 * demonstrated in preview.html — no viewport checks needed here.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="bb-theme">
        <NavBar />

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

        <MobileTabBar />
      </body>
    </html>
  );
}

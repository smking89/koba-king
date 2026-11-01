import PropTypes from "prop-types";
import kobabotLogo from "../assets/kobabot-logo.png";

/**
 * NavBar — desktop top navigation.
 * Visibility is handled entirely by `.bb-navbar` in components.css
 * (display:none below 1024px, display:flex at lg+) — no JS breakpoint
 * logic needed here, it mirrors preview.html exactly.
 *
 * The Online/player-count badges and "Connect WebRCON" button that used to
 * live here were all fake/hardcoded - removed rather than kept as
 * placeholders. The site's login system (and the Dashboard/Log In button
 * that used to sit here) was removed entirely (2026-09-16) - nobody used
 * it, every account feature it gated already exists in Discord.
 */
export default function NavBar({ links, activeHref }) {
  return (
    <nav className="bb-navbar">
      <div className="bb-navbar__logo">
        <img src={kobabotLogo} alt="KOBA Bot" />
        <span className="bb-h4">
          KOBABOT<span className="bb-body-sm">.STORE</span>
        </span>
      </div>

      <div className="bb-navbar__links">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={
              link.href === activeHref
                ? "bb-navbar__link bb-navbar__link--active"
                : "bb-navbar__link"
            }
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

NavBar.propTypes = {
  links: PropTypes.arrayOf(
    PropTypes.shape({
      href: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  activeHref: PropTypes.string,
};

NavBar.defaultProps = {
  links: [
    { href: "/", label: "Home" },
    { href: "/support", label: "Support" },
  ],
  activeHref: "/",
};

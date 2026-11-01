import PropTypes from "prop-types";
import Icon from "../src/icons/Icon";

/**
 * MobileTabBar — fixed bottom navigation for mobile.
 * Visibility is handled entirely by `.bb-tabbar` in components.css
 * (display:flex below 1024px, display:none at lg+) — the exact
 * inverse of NavBar, matching preview.html's breakpoint behavior.
 */
export default function MobileTabBar({ items, activeHref }) {
  return (
    <nav className="bb-tabbar">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={
            item.href === activeHref
              ? "bb-tabbar__item bb-tabbar__item--active"
              : "bb-tabbar__item"
          }
        >
          <span className="bb-icon">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

MobileTabBar.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      href: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.node.isRequired,
    })
  ),
  activeHref: PropTypes.string,
};

MobileTabBar.defaultProps = {
  items: [
    { href: "/", label: "Home", icon: <Icon name="home" className="w-5 h-5" /> },
    { href: "/support", label: "Support", icon: <Icon name="support" className="w-5 h-5" /> },
  ],
  activeHref: "/",
};

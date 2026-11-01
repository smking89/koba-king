import PropTypes from "prop-types";
import Icon from "../src/icons/Icon";
import kobabotLogo from "../assets/kobabot-logo.png";

/**
 * MobileHeader — top bar shown only below the 1024px breakpoint.
 * `.bb-mobile-header` in components.css handles visibility (display:none
 * at lg+, matching preview.html's mobile screens); NavBar takes over at
 * desktop widths.
 */
export default function MobileHeader({ hasNotifications, onMenuClick, onBellClick }) {
  return (
    <header className="bb-mobile-header">
      <button
        type="button"
        className="bb-mobile-header__icon-btn"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Icon name="menu" className="w-5 h-5" />
      </button>

      <div className="bb-mobile-header__logo">
        <img src={kobabotLogo} alt="KOBA Bot" />
        <span className="bb-h4">
          KOBABOT<span className="bb-body-sm">.STORE</span>
        </span>
      </div>

      <button
        type="button"
        className="bb-mobile-header__icon-btn"
        onClick={onBellClick}
        aria-label="Notifications"
      >
        <Icon name="bell" className="w-5 h-5" />
        {hasNotifications && <span className="bb-mobile-header__dot" />}
      </button>
    </header>
  );
}

MobileHeader.propTypes = {
  hasNotifications: PropTypes.bool,
  onMenuClick: PropTypes.func,
  onBellClick: PropTypes.func,
};

MobileHeader.defaultProps = {
  hasNotifications: false,
  onMenuClick: undefined,
  onBellClick: undefined,
};

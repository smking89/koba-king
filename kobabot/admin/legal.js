"use strict";

const { PLAYER_THEME_CSS } = require("./theme");

const LAST_UPDATED = "October 15, 2026";

// Page-specific reading-layout CSS only - tokens/base/link color come from
// ./theme.js's PLAYER_THEME_CSS (this used to be a third standalone
// hardcoded palette, sharing nothing with billing.js's or the rest of the
// site's).
const STYLES = `
  ${PLAYER_THEME_CSS}
  body { line-height:1.6; padding: var(--space-10) var(--space-4) 100px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  .brand img { height: 48px; width: auto; display: block; margin-bottom: var(--space-2); }
  .updated { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-10); }
  h1 { font-size: clamp(1.5rem, 4.5vw, 1.9rem); margin: 0 0 var(--space-2); }
  h2 { font-size: 1.2rem; margin: 36px 0 var(--space-3); color: #fff; }
  p, li { color: #cfd3e6; font-size: 15px; }
  ul { padding-left: 20px; }
  li { margin-bottom: var(--space-2); }
  a { color: var(--cyan); }
  .back { display: inline-block; margin-top: 50px; color: var(--ink-dim); font-size: 13px; }
`;

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — KOBA</title>
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png?v=3" />
<style>${STYLES}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

function renderTerms() {
  return page(
    "Terms of Service",
    `
    <div class="brand"><img src="/brand/icon-mark.png" alt="KOBA" /></div>
    <h1>Terms of Service</h1>
    <div class="updated">Last updated: ${LAST_UPDATED}</div>

    <p>These Terms govern your use of KOBA (the "Service"), a Discord bot and companion website that automates clan/team management for Rust Console Edition servers over WebRCON. By adding KOBA to a Discord server, linking your account, or otherwise using the Service, you agree to these Terms.</p>

    <h2>1. The Service</h2>
    <p>KOBA provides Discord-based roster, rank, crafting, and in-game automation tools that connect to a Rust Console Edition server you control via WebRCON credentials you provide. You are responsible for having the right to configure and issue commands to any Rust server you connect KOBA to.</p>

    <h2>2. Free to Use</h2>
    <p>KOBA is free to use, with no license, subscription, or payment required to access any feature. We don't process payments or store billing information as part of operating the Service.</p>

    <h2>3. Acceptable Use</h2>
    <p>You agree not to use KOBA Bot to:</p>
    <ul>
      <li>Violate Discord's Terms of Service or Community Guidelines.</li>
      <li>Issue automated in-game actions against a Rust server you do not own, administer, or otherwise have clear authorization to affect.</li>
      <li>Harass, abuse, or attempt to disrupt other users, servers, or the Service itself.</li>
      <li>Attempt to circumvent the Service's licensing, rate limits, or security controls.</li>
    </ul>
    <p>We may suspend or terminate access for any account found in violation of these Terms, without refund.</p>

    <h2>4. No Warranty</h2>
    <p>The Service is provided "as is," without warranty of any kind. KOBA automates destructive in-game actions (structure wipes, entity removal, teleportation) at your explicit direction; we are not responsible for the in-game consequences of commands you or your team issue through the Service.</p>

    <h2>5. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the Service, including loss of in-game progress, data, or Discord server configuration.</p>

    <h2>6. Changes</h2>
    <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.</p>

    <h2>7. Contact</h2>
    <p>Questions about these Terms can be sent via the <code>/support</code> command in Discord.</p>

    <a class="back" href="/">← Back to KOBA</a>
    `
  );
}

function renderPrivacy() {
  return page(
    "Privacy Policy",
    `
    <div class="brand"><img src="/brand/icon-mark.png" alt="KOBA" /></div>
    <h1>Privacy Policy</h1>
    <div class="updated">Last updated: ${LAST_UPDATED}</div>

    <p>This policy explains what data KOBA collects, why, and how it's handled.</p>

    <h2>1. What We Collect</h2>
    <ul>
      <li><strong>Discord identifiers</strong> - your Discord user ID and username, and the IDs of servers KOBA is added to, so we can operate roster and rank features tied to your account.</li>
      <li><strong>Roster and gameplay data</strong> - team names, ranks, fireteam assignments, crafting inventories, and linked Rust Gamertags/PSN IDs you or your team submit.</li>
      <li><strong>Server RCON connection details</strong> - the WebRCON host, port, and password you provide, used solely to send the automation commands you configure.</li>
      <li><strong>Support ticket content</strong> - messages you send through <code>/support</code> or a ticket channel.</li>
    </ul>

    <h2>2. What We Don't Collect</h2>
    <p>We do not collect message content from channels KOBA isn't directly interacting in, browsing history, or data unrelated to operating the features described above. We also don't process payments or store billing information - KOBA is free to use.</p>

    <h2>3. How We Use It</h2>
    <ul>
      <li>To operate the roster, economy, and clan war features you configure.</li>
      <li>To respond to support requests.</li>
      <li>To maintain basic operational records (installs) for running the Service.</li>
    </ul>
    <p>We do not sell your data, and we do not share it with third parties except Discord (as the platform the Service operates on).</p>

    <h2>4. Data Retention</h2>
    <p>Roster and configuration data persists for as long as KOBA remains in your server. If you remove KOBA, this data is not automatically deleted, so it's restored if KOBA is re-added later; you can request deletion via <code>/support</code>.</p>

    <h2>5. Your Rights</h2>
    <p>You can request a copy of, or deletion of, the data associated with your Discord ID at any time via <code>/support</code>. We'll respond within a reasonable timeframe.</p>

    <h2>6. Security</h2>
    <p>RCON credentials and roster data are stored in our operational database and are not exposed publicly. As with any online service, no method of storage or transmission is 100% secure.</p>

    <h2>7. Changes</h2>
    <p>We may update this policy from time to time; the "Last updated" date above will reflect the most recent revision.</p>

    <h2>8. Contact</h2>
    <p>Questions about this policy can be sent via the <code>/support</code> command in Discord.</p>

    <a class="back" href="/">← Back to KOBA</a>
    `
  );
}

module.exports = { renderTerms, renderPrivacy };

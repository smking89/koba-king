import { useEffect, useState } from "react";
import Icon from "../icons/Icon";
import frankMascot from "../../assets/frank-mascot.webp";
import kobabotLogo from "../../assets/kobabot-logo.png";

// Same "Coming Soon" convention as the real /add-server platform choice -
// KOBA Bot only actually supports Rust Console Edition today, but a ticket
// about anything else still deserves a real ticket, just tagged so staff
// know what it's about.
const PLATFORM_OPTIONS = [
  { value: "console", label: "Console (Xbox/PlayStation)" },
  { value: "pc", label: "PC (Coming Soon)" },
];
const GAME_OPTIONS = [
  { value: "rust", label: "Rust" },
  { value: "ark", label: "ARK (Coming Soon)" },
  { value: "dayz", label: "DayZ (Coming Soon)" },
  { value: "minecraft", label: "Minecraft (Coming Soon)" },
];

/**
 * Support — Support GUI ("/support"). Real ticket submission via
 * /dashboard/api/support/tickets (admin/dashboard.js) - the exact same
 * db.createTicket the Discord /support command's DM fallback uses (this
 * process has no live Discord client to open a real ticket channel the
 * way running /support inside a server does), so a website ticket lands
 * in the same staff queue (admin/tickets.js) as every other one. No login
 * system on this site anymore, so there's no "Your Tickets" history here -
 * the submitter types their own Discord user ID so staff can follow up.
 */
export default function Support() {
  const [draft, setDraft] = useState({ discordId: "", subject: "", message: "", platform: "console", game: "rust" });
  const [submitMsg, setSubmitMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [discordInviteUrl, setDiscordInviteUrl] = useState(null);

  useEffect(() => {
    fetch("/api/site-settings")
      .then((r) => r.json())
      .then((json) => setDiscordInviteUrl(json.discordInviteUrl))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch("/dashboard/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discord_id: draft.discordId.trim(), subject: draft.subject, message: draft.message, platform: draft.platform, game: draft.game }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubmitMsg({ ok: true, text: `Ticket #${json.ticketId} submitted - our team will follow up on Discord.` });
      setDraft((d) => ({ ...d, subject: "", message: "" }));
    } catch (err) {
      setSubmitMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="bb-eyebrow">Support</span>
        <h1 className="font-display text-2xl font-bold text-bb-text-primary">We&apos;re Here to Help</h1>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="bb-card bb-card--interactive flex items-center gap-4">
        <img src={frankMascot} alt="Frank, the KOBA Bot mascot, giving a thumbs up" className="h-20 w-auto drop-shadow-[0_0_20px_rgba(57,255,106,0.35)]" />
        <div>
          <h2 className="bb-h3">Need Help?</h2>
          <p className="bb-body-sm">Submit a ticket below or run <code>/support</code> in Discord for the fastest response.</p>
        </div>
      </section>

      {/* ---------------- Submit ticket ---------------- */}
      <section className="bb-card flex flex-col gap-4">
        <span className="bb-eyebrow">Submit A Ticket</span>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            value={draft.discordId}
            onChange={(e) => setDraft((d) => ({ ...d, discordId: e.target.value }))}
            placeholder="Your Discord user ID (right-click your name → Copy User ID)…"
            className="bb-input"
            required
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              className="bb-input"
              value={draft.platform}
              onChange={(e) => setDraft((d) => ({ ...d, platform: e.target.value }))}
              required
            >
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="bb-input"
              value={draft.game}
              onChange={(e) => setDraft((d) => ({ ...d, game: e.target.value }))}
              required
            >
              {GAME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            placeholder="Short summary of your issue…"
            maxLength={100}
            className="bb-input"
            required
          />
          <textarea
            value={draft.message}
            onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
            placeholder="Details - what's happening, what you expected…"
            maxLength={1000}
            rows={4}
            className="bb-input resize-none"
            required
          />
          <button type="submit" className="bb-btn bb-btn--primary bb-btn--block" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Ticket"}
          </button>
        </form>
        {submitMsg && <p className={submitMsg.ok ? "bb-body-sm text-bb-green" : "bb-body-sm text-bb-danger"}>{submitMsg.text}</p>}
      </section>

      {/* ---------------- Discord CTA ---------------- */}
      <a
        href={discordInviteUrl || "#"}
        target={discordInviteUrl ? "_blank" : undefined}
        rel="noopener noreferrer"
        className="bb-btn bb-btn--purple bb-btn--lg bb-btn--block inline-flex items-center justify-center gap-2"
      >
        <Icon name="discord" className="w-5 h-5" />
        {discordInviteUrl ? "Join Our Discord" : "Loading…"}
      </a>

      {/* ---------------- Footer ---------------- */}
      <footer className="bb-panel flex flex-col items-center gap-2 py-8 text-center">
        <img src={kobabotLogo} alt="KOBA Bot" className="h-8 w-auto" />
        <span className="bb-h4">
          KOBABOT<span className="bb-body-sm">.STORE</span>
        </span>
        <span className="bb-caption">Rust Console Edition</span>
        <span className="font-display text-sm font-bold uppercase tracking-widest text-bb-gold">
          Built for Rust. Powered by You.
        </span>
      </footer>
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";

/**
 * Shared chrome for every KOBA transactional email - table layout, inline
 * styles only (no CSS vars, no Tailwind: those don't survive real email
 * clients). Matches the site's black-and-white identity so an email and the
 * web app read as the same product.
 */
const COLOR = {
  bg: "#000000",
  card: "#0a0a0a",
  border: "#2a2a2a",
  fg: "#fafafa",
  muted: "#a3a3a3",
  faint: "#6f6f6f",
  violet: "#d4d4d4",
  magenta: "#bdbdbd",
  ok: "#d4d4d4",
  gold: "#f5f5f5",
  danger: "#e5e5e5",
};

const GRADIENT = "linear-gradient(135deg, #ffffff 0%, #d4d4d4 50%, #8a8a8a 100%)";

const base: CSSProperties = {
  fontFamily: "'IBM Plex Sans', Arial, sans-serif",
};

export function EmailShell({
  preheader,
  children,
}: {
  preheader?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ ...base, backgroundColor: COLOR.bg, padding: "32px 16px" }}>
      {preheader ? (
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>{preheader}</div>
      ) : null}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ maxWidth: 560, margin: "0 auto" }}>
        <tbody>
          <tr>
            <td style={{ background: GRADIENT, borderRadius: "20px 20px 0 0", padding: "20px 32px" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#000000", letterSpacing: "0.04em" }}>KOBA</span>
            </td>
          </tr>
          <tr>
            <td style={{ backgroundColor: COLOR.card, padding: "32px", color: COLOR.fg, fontSize: 14, lineHeight: 1.6 }}>{children}</td>
          </tr>
          <tr>
            <td
              style={{
                backgroundColor: COLOR.card,
                borderTop: `1px solid ${COLOR.border}`,
                borderRadius: "0 0 20px 20px",
                padding: "20px 32px",
                color: COLOR.faint,
                fontSize: 12,
              }}
            >
              © {new Date().getFullYear()} KOBA. All rights reserved.
              <br />
              KOBA · koba.games
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: COLOR.violet }}>{children}</p>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 700, color: COLOR.fg }}>{children}</h1>;
}

export function Body({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 16px", color: COLOR.muted }}>{children}</p>;
}

export function EmailButton({ children, href = "#" }: { children: ReactNode; href?: string }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "8px 0 20px" }}>
      <tbody>
        <tr>
          <td style={{ background: GRADIENT, borderRadius: 999 }}>
            <a
              href={href}
              style={{
                display: "inline-block",
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                textDecoration: "none",
                borderRadius: 999,
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function InfoCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ backgroundColor: COLOR.bg, border: `1px solid ${COLOR.border}`, borderRadius: 14, padding: "14px 16px", margin: "0 0 20px", fontSize: 13, color: COLOR.muted }}>
      {children}
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const color = tone === "ok" ? COLOR.ok : tone === "warn" ? COLOR.gold : tone === "danger" ? COLOR.danger : COLOR.muted;
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, border: `1px solid ${color}`, borderRadius: 999, padding: "3px 10px", marginBottom: 16 }}>
      {children}
    </span>
  );
}

export function FinePrint({ children }: { children: ReactNode }) {
  return <p style={{ margin: "16px 0 0", fontSize: 12, color: COLOR.faint }}>{children}</p>;
}

export const emailColors = COLOR;

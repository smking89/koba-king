import { Link } from "@tanstack/react-router";

const LEGAL = [
  { to: "/legal/terms", label: "Terms" },
  { to: "/legal/privacy", label: "Privacy" },
] as const;

const CONTACT = [
  { email: "support@koba.games", label: "Support" },
  { email: "partner@koba.games", label: "Partnerships" },
  { email: "safety@koba.games", label: "Trust & safety" },
  { email: "legal@koba.games", label: "Legal" },
] as const;

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`mt-8 border-t border-border ${className}`}>
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 sm:px-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <img src="/brand/koba-wordmark-tight.png" alt="KOBA" className="h-6 w-auto object-contain" />
          <p className="mt-3 max-w-xs text-muted">
            KOBA brings competitive players and gaming communities together. Build your profile, track your progress, and challenge your rivals.
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold tracking-[0.14em] text-fg uppercase">Legal</h3>
          <nav aria-label="Legal" className="mt-3 grid gap-2">
            {LEGAL.map((item) => (
              <Link key={item.to} to={item.to} className="text-muted hover:text-fg">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div>
          <h3 className="text-xs font-semibold tracking-[0.14em] text-fg uppercase">Contact</h3>
          <nav aria-label="Contact" className="mt-3 grid gap-2">
            {CONTACT.map((item) => (
              <a key={item.email} href={`mailto:${item.email}`} className="text-muted hover:text-fg">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="border-t border-border py-4 text-center text-xs text-muted">© {new Date().getFullYear()} KOBA. All rights reserved.</div>
    </footer>
  );
}

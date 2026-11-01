import { Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

/**
 * Shared "coming soon" placeholder for a page whose real feature (the
 * component it would otherwise render) is built but not yet live to the
 * public. Keep the route and the nav entry pointing at it reachable — this
 * only swaps what renders at that path, it never deletes the underlying
 * feature code.
 */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4">
          <Link to="/" aria-label="KOBA home">
            <img src="/brand/koba-wordmark.png" alt="" width={1096} height={500} className="h-10 w-auto object-contain" />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-violet">Coming soon</p>
        <h1 className="text-3xl font-medium sm:text-4xl">{title}</h1>
        <p className="max-w-md text-sm text-muted">{blurb}</p>
        <Link to="/" className="mt-4 text-sm text-cyan hover:text-fg">
          Back to KOBA
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

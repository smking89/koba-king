import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <Link to="/" aria-label="KOBA home">
            <img src="/brand/koba-wordmark.png" alt="" width={1096} height={500} className="h-12 w-auto object-contain" />
          </Link>
          <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted">
            Back
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-28">
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
        <div className="mt-4 grid gap-4 text-sm text-muted">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

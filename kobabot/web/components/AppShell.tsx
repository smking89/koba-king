import { ReactNode } from "react";
import { TopNav } from "./TopNav";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="pt-4 pb-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom)+16px)] lg:pt-[calc(var(--topbar-h)+24px)] lg:pb-16 min-h-screen">
        {children}
      </main>
      <BottomNav />
    </>
  );
}

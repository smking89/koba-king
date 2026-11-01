import type { Metadata } from "next";
import { Permanent_Marker } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

// The reference design's "KOBABOT PRO" / graffiti-splatter headline treatment
// isn't a weight of the site's regular display font - it's a distinct
// hand-drawn marker face, used sparingly for hero/CTA "shout" text only.
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker" });

export const metadata: Metadata = {
  title: "Kobabot.store — Rust Console Edition Server Management",
  description: "Work smarter with KOBA Bot Pro — the ultimate server management platform for Rust Console Edition.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={marker.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>KOBA is the gaming network at koba.games. Using the site means you agree to these terms and the community rules.</p>
      <p>Accounts are yours. You are responsible for what you list, bid, upload, and say. Business listings must be cosmetics you have the right to sell. KOBA does not take ownership of your art.</p>
      <p>The Official shop charges the seller 2.5% when the account is verified and 3.5% when it is not. The buyer pays the listed price. Astro is a monthly cosmetic pass. Ending it stops applied cosmetics. Purchases settle in KOBA coins.</p>
      <p>KOBA can remove a listing, close an event, or limit an account that breaks the rules. These terms can change. The date on this page is the one that applies.</p>
      <p>Last updated October 16, 2026.</p>
    </LegalPage>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>KOBA collects the account details you give it: name, email, and the platform you use to sign in. Xbox and Discord authorize only the scopes shown on the sign-in screen. KOBA does not ask those platforms for your password.</p>
      <p>Profile play, shop purchases, bids, group membership, and discipline notes stay on your KOBA identity so other players can read the trust card. Email is not shown on the public profile.</p>
      <p>KOBA does not sell personal information. Discord links in the footer leave this site. Those servers have their own privacy practices.</p>
      <p>You can sign out from the account menu. To ask for a correction or a deletion, use the koba.games Discord linked in the footer.</p>
      <p>Last updated October 16, 2026.</p>
    </LegalPage>
  );
}

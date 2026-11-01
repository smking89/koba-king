import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal/rules")({
  component: RulesPage,
});

function RulesPage() {
  return (
    <LegalPage title="Community rules">
      <p>Play the person in front of you, not a pile of alts. One identity, honest hours, and a trust card other players can read.</p>
      <p>No harassment, hate, sexual content involving minors, or threats. Clips stay about the game. Do not post someone else's private information.</p>
      <p>Servers you claim must post an honest wipe clock. Squad posts and wipe-night events have a cap. Do not fill them with empty seats.</p>
    </LegalPage>
  );
}

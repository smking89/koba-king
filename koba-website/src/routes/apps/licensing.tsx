import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
// import { AppStore } from "@/components/apps/app-store";

export const Route = createFileRoute("/apps/licensing")({
  component: function LicensingPage() {
    return <ComingSoon title="Licensing" blurb="Download links and license management open with the KOBA Integrations Directory." />;
  },
});

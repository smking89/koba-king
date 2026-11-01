import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
// import { AppStore } from "@/components/apps/app-store";

export const Route = createFileRoute("/apps/purchases")({
  component: function PurchasesPage() {
    return <ComingSoon title="My Purchases" blurb="Your library opens with the KOBA Integrations Directory." />;
  },
});

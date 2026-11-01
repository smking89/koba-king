import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
// import { AppStore } from "@/components/apps/app-store";

export const Route = createFileRoute("/apps/develop")({
  component: function SubmitListingPage() {
    return <ComingSoon title="Submit a listing" blurb="Listing submissions open with the KOBA Integrations Directory." />;
  },
});

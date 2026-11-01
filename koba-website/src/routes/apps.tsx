import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
// AppStore is the real foundation for the KOBA Integrations Directory —
// kept in the codebase, just not rendered publicly yet. See ComingSoon below.
// import { AppStore } from "@/components/apps/app-store";

export const Route = createFileRoute("/apps")({
  component: function AppsPage() {
    return <ComingSoon title="Integrations Directory" blurb="Bots, plugins, and adapters for the games you run are moving to the KOBA Integrations Directory. Licensing and submissions open here." />;
  },
});

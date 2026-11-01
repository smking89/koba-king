import { createFileRoute } from "@tanstack/react-router";
import { getProfileBadges } from "@/lib/badges/badges.server";

export const Route = createFileRoute("/api/v1/profiles/$kobaId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const badges = await getProfileBadges(params.kobaId);
        return Response.json({ kobaId: params.kobaId, badges });
      },
    },
  },
});

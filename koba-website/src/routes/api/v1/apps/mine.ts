import { createFileRoute } from "@tanstack/react-router";
import { SEATS } from "@/site/app-store";
import { purchases, queue } from "@/site/app-store.server";

export const Route = createFileRoute("/api/v1/apps/mine")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        const user = SEATS.find((seat) => seat.kobaId === kobaId);
        if (!user) return Response.json({ error: "Unknown KOBAid." }, { status: 401 });
        return Response.json({ user, purchases: purchases(kobaId), queue: queue(kobaId) });
      },
    },
  },
});

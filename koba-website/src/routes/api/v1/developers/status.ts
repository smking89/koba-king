import { createFileRoute } from "@tanstack/react-router";
import { statusSeries } from "@/site/ingest.server";

export const Route = createFileRoute("/api/v1/developers/status")({
  server: {
    handlers: {
      GET: async () => Response.json(statusSeries()),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { testIngest } from "@/site/ingest.server";

export const Route = createFileRoute("/api/v1/developers/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { raw?: string; token?: string } | null;
        if (typeof body?.raw !== "string") return Response.json({ error: "Paste a payload." }, { status: 400 });
        const result = await testIngest(body.raw, body.token ?? "");
        return Response.json(result);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { buy } from "@/site/app-store.server";

export const Route = createFileRoute("/api/v1/apps/purchase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        const body = (await request.json().catch(() => null)) as { appId?: string } | null;
        if (!body?.appId) return Response.json({ error: "Missing app." }, { status: 400 });
        const result = buy(kobaId, body.appId);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ purchase: result.value });
      },
    },
  },
});

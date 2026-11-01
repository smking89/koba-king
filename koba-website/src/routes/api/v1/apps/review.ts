import { createFileRoute } from "@tanstack/react-router";
import { review } from "@/site/app-store.server";

export const Route = createFileRoute("/api/v1/apps/review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        const body = (await request.json().catch(() => null)) as { appId?: string; decision?: "APPROVED" | "REJECTED" } | null;
        if (!body?.appId || (body.decision !== "APPROVED" && body.decision !== "REJECTED")) {
          return Response.json({ error: "Missing review." }, { status: 400 });
        }
        const result = review(kobaId, body.appId, body.decision);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ app: result.value });
      },
    },
  },
});

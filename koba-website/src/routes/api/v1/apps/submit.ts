import { createFileRoute } from "@tanstack/react-router";
import type { AppDraft } from "@/site/app-store";
import { submit } from "@/site/app-store.server";

export const Route = createFileRoute("/api/v1/apps/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        const draft = (await request.json().catch(() => null)) as AppDraft | null;
        if (!draft) return Response.json({ error: "Missing listing." }, { status: 400 });
        const result = submit(kobaId, draft);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ app: result.value });
      },
    },
  },
});

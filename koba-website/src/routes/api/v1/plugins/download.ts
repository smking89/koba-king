import { createFileRoute } from "@tanstack/react-router";
import { issue, redeem } from "@/site/app-store.server";

export const Route = createFileRoute("/api/v1/plugins/download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        const body = (await request.json().catch(() => null)) as { appId?: string; token?: string } | null;
        if (body?.token) {
          const result = redeem(body.token);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ file: result.value.file });
        }
        if (!body?.appId) return Response.json({ error: "Missing package." }, { status: 400 });
        const result = issue(kobaId, body.appId);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({
          token: result.value.tokenString,
          expiresAt: result.value.expiresAt,
        });
      },
    },
  },
});

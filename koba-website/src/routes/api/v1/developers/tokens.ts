import { createFileRoute } from "@tanstack/react-router";
import { issueToken, rotateToken, tokenAudit } from "@/site/ingest.server";

export const Route = createFileRoute("/api/v1/developers/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        if (!kobaId) return Response.json({ error: "Missing KOBAid." }, { status: 401 });
        return Response.json({ tokens: tokenAudit(kobaId) });
      },
      POST: async ({ request }) => {
        const kobaId = request.headers.get("x-koba-id") ?? "";
        if (!/^koba_[a-z0-9_]{2,24}$/.test(kobaId)) return Response.json({ error: "KOBAid must start with koba_ and use 3 to 25 lowercase letters, numbers, or underscores." }, { status: 400 });
        const body = (await request.json().catch(() => null)) as { action?: string; jti?: string } | null;
        if (body?.action === "rotate") {
          if (!body.jti) return Response.json({ error: "Missing token id." }, { status: 400 });
          const result = await rotateToken(kobaId, body.jti);
          if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
          return Response.json(result);
        }
        if (body?.action !== "issue") return Response.json({ error: "Unknown action." }, { status: 400 });
        return Response.json(await issueToken(kobaId));
      },
    },
  },
});

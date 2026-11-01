import { createFileRoute } from "@tanstack/react-router";
import { recordPsnEmote } from "@/lib/psn/psn-link.server";

const EMOTE_LINE = /^\[PLAYER_EMOTE\] User: (.+), PSN_ID: (\d+), Emote: KOBA_Link$/;

/**
 * FIXED (spoofable identity ingest): this used to accept any POST with no
 * credential at all - anyone on the internet could inject a fake
 * `[PLAYER_EMOTE] ... Emote: KOBA_Link` line for ANY PSN name, with no real
 * Rust server involved, poisoning the pending-link cache ahead of the real
 * event. Only the trusted log-watcher process (the thing actually tailing
 * the Rust server's console) should be able to call this, so it's gated by
 * a shared secret - same shape as src/site/ingest.server.ts's developer
 * token check, but a single server-to-server secret rather than a
 * per-developer rotating token, since there's no per-user identity on this
 * side of the call. Fails closed: an unset PSN_INGEST_SECRET rejects every
 * request rather than silently accepting unauthenticated ones.
 */
export const Route = createFileRoute("/api/v1/psn/emote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.PSN_INGEST_SECRET?.trim();
        const provided = request.headers.get("x-koba-ingest-secret")?.trim();
        if (!expected || !provided || provided !== expected) {
          return Response.json({ error: "Unauthorized." }, { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as { line?: string } | null;
        const match = body?.line?.match(EMOTE_LINE);
        if (!match) return Response.json({ error: "No KOBA_Link emote in that line." }, { status: 400 });
        const [, psnName, psnId] = match;
        recordPsnEmote(psnName, psnId);
        return Response.json({ ok: true });
      },
    },
  },
});

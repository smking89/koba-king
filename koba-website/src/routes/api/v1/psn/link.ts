import { createFileRoute } from "@tanstack/react-router";
import { claimPsnLink } from "@/lib/psn/psn-link.server";
import { getSql } from "@/lib/db";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";

/**
 * FIXED (account-takeover): this used to trust a client-supplied `kobaId` in
 * the POST body with no session check at all - anyone who knew (or guessed)
 * a victim's kobaId could bind an arbitrary PSN id to their account. The
 * caller's own authenticated session is now the ONLY source of which account
 * gets the binding, same invariant every other per-user mutation in this app
 * follows (see src/lib/auth/middleware.ts's header comment).
 */
export const Route = createFileRoute("/api/v1/psn/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let kobaId: string;
        try {
          kobaId = await requireUserId();
        } catch (err) {
          if (err instanceof UnauthorizedError) return Response.json({ error: "Sign in first." }, { status: 401 });
          throw err;
        }

        const body = (await request.json().catch(() => null)) as { psnName?: string } | null;
        if (!body?.psnName) return Response.json({ error: "psnName is required." }, { status: 400 });

        const claimed = claimPsnLink(body.psnName);
        if (!claimed) return Response.json({ error: "No KOBA_Link emote seen for that name in the last 5 minutes." }, { status: 404 });

        const sql = await getSql();
        await sql`update players set psn_id = ${claimed.psnId} where id = ${kobaId}`;
        return Response.json({ ok: true, psnId: claimed.psnId });
      },
    },
  },
});

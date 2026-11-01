import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";

const UNBINDABLE_COLUMNS = new Set(["xbox_xuid", "psn_id"]);

/**
 * FIXED (account-takeover): this used to trust a client-supplied `kobaId` -
 * anyone could unbind any account's Xbox/PSN id by just naming it. Scoped
 * to the caller's own authenticated session now, same fix as
 * src/routes/api/v1/psn/link.ts. (steam_id removed from this set - Steam
 * sign-in was removed, so nothing can ever set that column anymore.)
 */
export const Route = createFileRoute("/api/v1/profiles/unbind")({
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

        const body = (await request.json().catch(() => null)) as { platform?: string } | null;
        if (!body?.platform || !UNBINDABLE_COLUMNS.has(body.platform)) {
          return Response.json({ error: "platform ('xbox_xuid' | 'psn_id') is required." }, { status: 400 });
        }
        const sql = await getSql();
        // Column name is checked against UNBINDABLE_COLUMNS above, not interpolated from arbitrary input.
        await sql.query(`update players set ${body.platform} = null where id = $1`, [kobaId]);
        return Response.json({ ok: true });
      },
    },
  },
});

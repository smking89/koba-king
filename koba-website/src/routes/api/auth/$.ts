import { createFileRoute } from "@tanstack/react-router";

/**
 * Mounts the pre-wired Better Auth instance (src/lib/auth/server.ts, which
 * says "do not rewrite") at the path it expects to own: /api/auth/*. Without
 * this route the instance exists in memory but every request to it 404s -
 * sign-in, session checks, and sign-out all go through this one handler.
 */
async function handle({ request }: { request: Request }) {
  const { auth } = await import("@/lib/auth/server");
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});

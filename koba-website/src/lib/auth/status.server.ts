/**
 * Which external sign-in providers this build can actually start.
 *
 * Xbox is registered on the auth server only when its credentials are
 * present (see `src/lib/auth/server.ts`), so the client asks here instead of
 * rendering a button that would 404. `authOff` is true in the local preview
 * where the app runs as its dev user and no provider round-trip is possible.
 * (Steam sign-in was removed - Rust Console Edition has no Steam accounts.)
 */
export type SignInOptions = {
  xbox: boolean;
  /** False when sign-in itself is disabled for this run (VITE_AUTH_ENABLED=false). */
  authEnabled: boolean;
};

export function signInOptions(): SignInOptions {
  const env = (key: string) => process.env[key]?.trim() || "";
  return {
    xbox: Boolean(env("XBOX_CLIENT_ID") && env("XBOX_CLIENT_SECRET")),
    authEnabled: process.env.VITE_AUTH_ENABLED !== "false",
  };
}

import { jwtVerify, SignJWT } from "jose";
import { env, isWorkspacePreview } from "@/lib/env.server";
import type { PortalId } from "@/lib/pulse/types";

/**
 * Zero-trust check for KOBA Pulse configuration.
 * Runs only on the server. A caller from koba.games or developers.koba.games
 * must present a short-lived HS256 token before any weight or ledger write.
 * This is not the platform sign-in middleware. Catalog reads stay public.
 */

export const GATE_ISSUER = "admin.koba.games";
export const GATE_SCOPE = "pulse:config";
const PREVIEW_SECRET = "koba-pulse-preview-gate-v1";

export function isPortal(value: string): value is PortalId {
  return value === "koba.games" || value === "developers.koba.games";
}

function secretBytes(): Uint8Array {
  const configured = env("KOBA_GATE_SECRET");
  if (configured) return new TextEncoder().encode(configured);
  if (isWorkspacePreview()) return new TextEncoder().encode(PREVIEW_SECRET);
  throw new Error("Gate secret is not configured.");
}

export async function issueOperatorToken(input: {
  portal: string;
  grant?: string;
  passphrase?: string;
}): Promise<string> {
  if (!isPortal(input.portal)) throw new Error("Unknown portal");
  const preview = isWorkspacePreview();
  const configuredSecret = Boolean(env("KOBA_GATE_SECRET"));
  const passphrase = env("KOBA_OPERATOR_PASSPHRASE");
  if (!preview && !configuredSecret) throw new Error("Gate secret is not configured.");
  const previewGrant = preview && input.grant === "pulse-preview" && !configuredSecret && !passphrase;
  const passphraseOk = Boolean(passphrase) && input.passphrase === passphrase;
  if (!previewGrant && !passphraseOk) throw new Error("Unauthorized");
  return new SignJWT({ scope: GATE_SCOPE, portal: input.portal })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(GATE_ISSUER)
    .setAudience(input.portal)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretBytes());
}

export async function requireConfigToken(authorization: string | null | undefined, portal: string) {
  if (!isPortal(portal)) throw new Error("Unauthorized");
  const match = /^Bearer\s+(\S+)$/.exec(authorization ?? "");
  if (!match?.[1]) throw new Error("Unauthorized");
  try {
    const { payload } = await jwtVerify(match[1], secretBytes(), {
      issuer: GATE_ISSUER,
      audience: portal,
      algorithms: ["HS256"],
    });
    if (payload.scope !== GATE_SCOPE) throw new Error("Unauthorized");
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message === "Gate secret is not configured.") throw error;
    throw new Error("Unauthorized");
  }
}

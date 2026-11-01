import { createServerFn } from "@tanstack/react-start";
import type { GateDenied, PulseCatalog, PortalId } from "@/lib/pulse/types";

function portalOf(portal: string): PortalId {
  if (portal !== "koba.games" && portal !== "developers.koba.games") {
    throw new Error("Unknown portal");
  }
  return portal;
}

export const loadPulseCatalog = createServerFn({ method: "GET" }).handler(async (): Promise<PulseCatalog> => {
  const { readCatalog } = await import("./catalog.server");
  return readCatalog();
});

export const loadRealIdentities = createServerFn({ method: "GET" }).handler(async () => {
  const { loadRealIdentities: load } = await import("./identity.server");
  return load();
});

export const issueOperatorToken = createServerFn({ method: "POST" })
  .validator((input: { portal: string; grant?: string; passphrase?: string }) => ({
    portal: portalOf(input.portal),
    grant: input.grant,
    passphrase: input.passphrase,
  }))
  .handler(async ({ data }): Promise<{ ok: true; token: string } | GateDenied> => {
    const { issueOperatorToken: issue } = await import("./gate.server");
    try {
      const token = await issue(data);
      return { ok: true, token };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      if (message.includes("not configured")) return { ok: false, status: 503, error: message };
      return { ok: false, status: 401, error: "Unauthorized" };
    }
  });

export const publishWeights = createServerFn({ method: "POST" })
  .validator((input: { authorization: string; portal: string; weights: Record<string, number> }) => ({
    authorization: input.authorization ?? "",
    portal: portalOf(input.portal),
    weights: input.weights ?? {},
  }))
  .handler(async ({ data }) => {
    const { publishWeights: publish } = await import("./catalog.server");
    return publish(data);
  });

export const activateLedgerBoost = createServerFn({ method: "POST" })
  .validator((input: { authorization: string; portal: string; itemId: string; actorId: string }) => ({
    authorization: input.authorization ?? "",
    portal: portalOf(input.portal),
    itemId: input.itemId,
    actorId: input.actorId,
  }))
  .handler(async ({ data }) => {
    const { activateLedgerBoost: activate } = await import("./catalog.server");
    return activate(data);
  });

export const closeLedgerBoost = createServerFn({ method: "POST" })
  .validator((input: { authorization: string; portal: string; itemId: string; actorId: string }) => ({
    authorization: input.authorization ?? "",
    portal: portalOf(input.portal),
    itemId: input.itemId,
    actorId: input.actorId,
  }))
  .handler(async ({ data }) => {
    const { closeLedgerBoost: close } = await import("./catalog.server");
    return close(data);
  });

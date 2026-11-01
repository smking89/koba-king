import { createServerFn } from "@tanstack/react-start";
import type { ConnectStatus } from "@/lib/stripe/connect.server";

export const getStripeConnectStatus = createServerFn({ method: "GET" })
  .validator((input: { playerId: string }) => input)
  .handler(async ({ data }): Promise<ConnectStatus | { error: string }> => {
    try {
      const { getConnectStatus } = await import("./connect.server");
      return await getConnectStatus(data.playerId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to load Stripe status" };
    }
  });

export const startStripeOnboarding = createServerFn({ method: "POST" })
  .validator((input: { playerId: string; returnUrl: string; refreshUrl: string }) => input)
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    try {
      const { createOnboardingLink } = await import("./connect.server");
      return await createOnboardingLink(data);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to start Stripe onboarding" };
    }
  });

export const refreshStripeConnectStatus = createServerFn({ method: "POST" })
  .validator((input: { playerId: string }) => input)
  .handler(async ({ data }): Promise<ConnectStatus | { error: string }> => {
    try {
      const { refreshConnectStatus } = await import("./connect.server");
      return await refreshConnectStatus(data.playerId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to refresh Stripe status" };
    }
  });

export const disconnectStripe = createServerFn({ method: "POST" })
  .validator((input: { playerId: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { error: string }> => {
    try {
      const { disconnect } = await import("./connect.server");
      await disconnect(data.playerId);
      return { ok: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to disconnect Stripe" };
    }
  });

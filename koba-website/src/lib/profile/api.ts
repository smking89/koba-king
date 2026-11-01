import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { BadgeView } from "@/lib/badges/badges.server";
import type { MyProfile, OnboardingChoices } from "@/lib/profile/profile.server";

/**
 * Called once right after sign-in to provision (or fetch) the caller's own
 * `players` row. `email`/`displayName` come from the client's own session
 * object (`useCurrentUser()`) purely as seed values for a brand-new row - the
 * row is always keyed by the server-verified `context.userId`, never a
 * client-supplied id, so a caller can only ever touch their own profile.
 */
export const loadMyProfile = createServerFn({ method: "POST" })
  .validator((input: { email: string | null; displayName: string | null }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<MyProfile> => {
    const { ensurePlayerProfile } = await import("@/lib/profile/profile.server");
    return ensurePlayerProfile(context.userId, data);
  });

/**
 * Forces a chosen username + region onto the caller's own profile and marks it
 * onboarded - the gate every new sign-in (any provider) has to clear before
 * entering the app. The welcome badge is awarded in the same request, so the
 * client can celebrate it right as the player finishes setup instead of
 * waiting for a profile-grid load.
 */
export const completeOnboarding = createServerFn({ method: "POST" })
  .validator((input: OnboardingChoices) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<(MyProfile & { awarded: BadgeView[] }) | { error: string }> => {
    const { completeOnboarding: run } = await import("@/lib/profile/profile.server");
    const result = await run(context.userId, data);
    if ("error" in result) return result;
    const { awardEarnedBadges } = await import("@/lib/badges/badges.server");
    return { ...result, awarded: await awardEarnedBadges(context.userId) };
  });

/** Post-onboarding edits - username and region are not permanent, this is what Settings' "Username" field and region picker actually call. */
export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: { handle?: string; region?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { updateProfile: run } = await import("@/lib/profile/profile.server");
    return run(context.userId, data);
  });

export const checkHandleAvailable = createServerFn({ method: "POST" })
  .validator((input: { handle: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { checkHandleAvailable: run } = await import("@/lib/profile/profile.server");
    return run(context.userId, data.handle);
  });

/** Avatar and banner for the caller's own profile. `null` clears a picture. */
export const updateProfileImages = createServerFn({ method: "POST" })
  .validator((input: { avatarUrl?: string | null; bannerUrl?: string | null }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { updateProfileImages: run } = await import("@/lib/profile/profile.server");
    return run(context.userId, data);
  });

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { BadgeView } from "@/lib/badges/badges.server";

export const loadProfileBadges = createServerFn({ method: "GET" })
  .validator((input: { kobaId: string }) => input)
  .handler(async ({ data }): Promise<BadgeView[]> => {
    const { getProfileBadges } = await import("@/lib/badges/badges.server");
    return getProfileBadges(data.kobaId);
  });

/**
 * Awards anything the signed-in player has just earned and returns only the
 * newly inserted rows, so the caller can celebrate at the moment of the action.
 * The id comes from the verified session - a client can never award a badge to
 * someone else, and it cannot pick which badge it wants.
 */
export const syncEarnedBadges = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BadgeView[]> => {
    const { awardEarnedBadges } = await import("@/lib/badges/badges.server");
    return awardEarnedBadges(context.userId);
  });

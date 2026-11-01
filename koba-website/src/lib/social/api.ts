import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { DmPolicy, FollowPolicy, InvitePolicy, PresenceStatus, SocialGraph, TagView } from "@/lib/social/social.server";

export const loadSocial = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SocialGraph> => {
    const { loadSocialGraph } = await import("@/lib/social/social.server");
    return loadSocialGraph(context.userId);
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .validator((input: { followeeId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { toggleFollow: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.followeeId);
  });

export const setFavorite = createServerFn({ method: "POST" })
  .validator((input: { followeeId: string; favorite: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { setFavorite: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.followeeId, data.favorite);
  });

export const setAlias = createServerFn({ method: "POST" })
  .validator((input: { followeeId: string; alias: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { setAlias: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.followeeId, data.alias);
  });

export const blockPlayer = createServerFn({ method: "POST" })
  .validator((input: { blockedId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { blockPlayer: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.blockedId);
  });

export const unblockPlayer = createServerFn({ method: "POST" })
  .validator((input: { blockedId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { unblockPlayer: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.blockedId);
  });

export const createFriendTag = createServerFn({ method: "POST" })
  .validator((input: { label: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<TagView | { error: string }> => {
    const { createTag } = await import("@/lib/social/social.server");
    return createTag(context.userId, data.label);
  });

export const deleteFriendTag = createServerFn({ method: "POST" })
  .validator((input: { tagId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { deleteTag } = await import("@/lib/social/social.server");
    return deleteTag(context.userId, data.tagId);
  });

export const setTagMember = createServerFn({ method: "POST" })
  .validator((input: { tagId: string; playerId: string; on: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { setTagMember: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.tagId, data.playerId, data.on);
  });

export const setPrivacyPolicies = createServerFn({ method: "POST" })
  .validator((input: { friendRequestPolicy?: FollowPolicy; groupInvitePolicy?: InvitePolicy; dmPolicy?: DmPolicy }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { setPrivacyPolicies: run } = await import("@/lib/social/social.server");
    return run(context.userId, data);
  });

export const pingPresence = createServerFn({ method: "POST" })
  .validator((input: { status: PresenceStatus }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { pingPresence: run } = await import("@/lib/social/social.server");
    return run(context.userId, data.status);
  });

export const loadPresence = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    const { loadPresence: run } = await import("@/lib/social/social.server");
    return run(data.ids);
  });

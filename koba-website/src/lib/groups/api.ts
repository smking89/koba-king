import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { GroupsSnapshot } from "@/lib/groups/groups.server";

export const loadGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GroupsSnapshot> => {
    const { loadGroupsSnapshot } = await import("@/lib/groups/groups.server");
    return loadGroupsSnapshot(context.userId);
  });

export const createGroup = createServerFn({ method: "POST" })
  .validator((input: { name: string; visibility: "public" | "private"; tag?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<string> => {
    const { createRealGroup } = await import("@/lib/groups/groups.server");
    return createRealGroup(context.userId, data.name, data.visibility, data.tag);
  });

export const joinGroup = createServerFn({ method: "POST" })
  .validator((input: { groupId: string; inviteCode?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { joinRealGroup } = await import("@/lib/groups/groups.server");
    return joinRealGroup(data.groupId, context.userId, data.inviteCode);
  });

/** Owner only. Removes the roster, ranks and chat with it. */
export const deleteGroup = createServerFn({ method: "POST" })
  .validator((input: { groupId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { deleteRealGroup } = await import("@/lib/groups/groups.server");
    return deleteRealGroup(data.groupId, context.userId);
  });

export const regenerateInvite = createServerFn({ method: "POST" })
  .validator((input: { groupId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { regenerateInvite: regen } = await import("@/lib/groups/groups.server");
    return regen(data.groupId, context.userId);
  });

export const setGroupVisibility = createServerFn({ method: "POST" })
  .validator((input: { groupId: string; visibility: "public" | "private" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { setGroupVisibility: setVis } = await import("@/lib/groups/groups.server");
    return setVis(data.groupId, context.userId, data.visibility);
  });

/** Name, tag, avatar and banner. Each field is optional; `null` clears a picture. */
export const updateGroupIdentity = createServerFn({ method: "POST" })
  .validator(
    (input: {
      groupId: string;
      name?: string;
      tag?: string;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { updateGroupIdentity: update } = await import("@/lib/groups/groups.server");
    return update(data.groupId, context.userId, {
      name: data.name,
      tag: data.tag,
      avatarUrl: data.avatarUrl,
      bannerUrl: data.bannerUrl,
    });
  });

export const createRank = createServerFn({ method: "POST" })
  .validator(
    (input: {
      groupId: string;
      name: string;
      description: string;
      icon: string;
      position: number;
      permissions: string[];
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { createRank: run } = await import("@/lib/groups/groups.server");
    return run(data.groupId, context.userId, {
      name: data.name,
      description: data.description,
      icon: data.icon,
      position: data.position,
      permissions: data.permissions,
    });
  });

export const updateRank = createServerFn({ method: "POST" })
  .validator(
    (input: {
      groupId: string;
      rankId: string;
      name?: string;
      description?: string;
      icon?: string;
      position?: number;
      permissions?: string[];
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { updateRank: run } = await import("@/lib/groups/groups.server");
    return run(data.groupId, context.userId, data.rankId, {
      name: data.name,
      description: data.description,
      icon: data.icon,
      position: data.position,
      permissions: data.permissions,
    });
  });

export const deleteRank = createServerFn({ method: "POST" })
  .validator((input: { groupId: string; rankId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { deleteRank: run } = await import("@/lib/groups/groups.server");
    return run(data.groupId, context.userId, data.rankId);
  });

/** Promote, demote or clear a member's rank. Pass `rankId: null` to clear. */
export const assignRank = createServerFn({ method: "POST" })
  .validator((input: { groupId: string; targetId: string; rankId: string | null }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { assignRank: run } = await import("@/lib/groups/groups.server");
    return run(data.groupId, context.userId, data.targetId, data.rankId);
  });

export const removeMember = createServerFn({ method: "POST" })
  .validator((input: { groupId: string; targetId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { removeMember: remove } = await import("@/lib/groups/groups.server");
    return remove(data.groupId, context.userId, data.targetId);
  });

export const postRoom = createServerFn({ method: "POST" })
  .validator((input: { groupId: string; text: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { postRealRoom } = await import("@/lib/groups/groups.server");
    return postRealRoom(data.groupId, context.userId, data.text);
  });

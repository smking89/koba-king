import { useMemo } from "react";
import type { Identity } from "@/platform/engine";
import { accountFor } from "@/site/astro";
import { resolveBadges, sourceFor, type RoleResult } from "@/site/badges";
import { metaFor } from "@/site/catalog";
import { useCommunity } from "@/site/community";
import { useSite } from "@/site/ui";

export function useResolvedBadges(identities: Identity[]): Record<string, RoleResult> {
  const opened = useSite((s) => s.opened);
  const groups = useCommunity((s) => s.groups);
  const members = useCommunity((s) => s.members);

  return useMemo(() => {
    const out: Record<string, RoleResult> = {};
    for (const identity of identities) {
      const membership = members.filter((member) => member.identityId === identity.id);
      const groupId = membership[0]?.groupId;
      const groupMembers = groupId ? members.filter((member) => member.groupId === groupId).length : 0;
      const ownsGroup = groups.some((group) => group.ownerId === identity.id);
      // Flat groups (no Discord-style channels/custom roles) have no officer tier anymore.
      const officer = false;
      const marks = metaFor(identity.id, identity.score).achievements;
      out[identity.id] = resolveBadges(sourceFor(identity, accountFor(identity.id, opened), { ownsGroup, officer, groupId, groupMembers }, marks));
    }
    return out;
  }, [groups, identities, members, opened]);
}

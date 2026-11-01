/**
 * Shared vocabulary for clan ranks and uploaded profile art. Both the server
 * (permission checks) and the clan UI (icon picker, permission toggles) read
 * from here, so a rank saved from the UI can only ever carry a permission the
 * server actually enforces.
 */
export const GROUP_PERMISSIONS = [
  { id: "manage_members", label: "Assign ranks and remove members", short: "Members" },
  { id: "manage_ranks", label: "Create and edit ranks", short: "Ranks" },
  { id: "manage_clan", label: "Edit tag, pictures, invites and visibility", short: "Clan" },
  { id: "delete_clan", label: "Delete the clan", short: "Delete" },
] as const;

export type GroupPermission = (typeof GROUP_PERMISSIONS)[number]["id"];

export function isGroupPermission(value: string): value is GroupPermission {
  return GROUP_PERMISSIONS.some((permission) => permission.id === value);
}

export function permissionLabel(id: GroupPermission): string {
  return GROUP_PERMISSIONS.find((permission) => permission.id === id)?.short ?? id;
}

/** Badges a rank can wear. Rendered as line icons beside the member's name. */
export const RANK_ICONS = ["shield", "crown", "sword", "crosshair", "star", "hammer", "flag", "skull"] as const;
export type RankIcon = (typeof RANK_ICONS)[number];

export function isRankIcon(value: string): value is RankIcon {
  return (RANK_ICONS as readonly string[]).includes(value);
}

/** Owner always outranks every custom rank. */
export const OWNER_POSITION = 100;
export const MAX_RANK_POSITION = 99;

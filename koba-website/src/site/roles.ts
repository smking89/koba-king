export const PLATFORM_ROLES = [
  { id: "player", label: "Player", rank: 0 },
  { id: "business", label: "Business", rank: 0 },
  { id: "trainee", label: "Support trainee", rank: 1 },
  { id: "support", label: "Support", rank: 2 },
  { id: "mod", label: "Moderator", rank: 3 },
  { id: "admin", label: "Admin", rank: 4 },
  { id: "super", label: "Owner", rank: 5 },
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number]["id"];

export const SHOP_ROLES = [
  { id: "owner", label: "Shop owner", rank: 5 },
  { id: "admin", label: "Shop admin", rank: 4 },
  { id: "mod", label: "Shop moderator", rank: 3 },
  { id: "support", label: "Shop support", rank: 2 },
  { id: "trainee", label: "Shop support trainee", rank: 1 },
] as const;

export type ShopRole = (typeof SHOP_ROLES)[number]["id"];

export function platformLabel(id: PlatformRole): string {
  return PLATFORM_ROLES.find((role) => role.id === id)?.label ?? id;
}

export function platformRank(id: PlatformRole): number {
  return PLATFORM_ROLES.find((role) => role.id === id)?.rank ?? 0;
}

export function canAssignPlatform(actor: PlatformRole, target: PlatformRole, next: PlatformRole): boolean {
  if (actor !== "super" && actor !== "admin") return false;
  if (target === "super" || next === "super") return actor === "super";
  if (actor === "admin" && platformRank(next) >= platformRank("admin")) return false;
  return true;
}

export function canAssignShop(actor: ShopRole, next: ShopRole): boolean {
  if (next === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return next !== "admin";
  return false;
}

export const CORE = {
  id: "koba-core",
  place: "US East · Ashburn",
  holds: "KOBAid, payments, shop, staff, and the primary database.",
};

export const PUBLIC_REGIONS = [
  { id: "NA", label: "NA", place: "United States, Canada, Mexico" },
  { id: "EU", label: "EU", place: "Western & Eastern Europe, UK, nearby Middle East" },
  { id: "APAC", label: "APAC", place: "Japan, South Korea, Hong Kong, Taiwan, Southeast Asia" },
  { id: "OCE", label: "OCE", place: "Australia, New Zealand, Pacific islands" },
  { id: "LATAM", label: "LATAM", place: "Central & South America" },
  { id: "AFR", label: "AFR", place: "South Africa, northern Africa" },
] as const;

export const EDGE_NODES = PUBLIC_REGIONS;

export type PublicRegion = (typeof PUBLIC_REGIONS)[number]["id"];

/** "Local" is one of PUBLIC_REGIONS; "Global" spans all of them combined. */
export function regionLabel(id: PublicRegion | "all"): string {
  if (id === "all") return "Global";
  return PUBLIC_REGIONS.find((region) => region.id === id)?.label ?? id;
}

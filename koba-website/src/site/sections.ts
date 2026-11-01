// The five top-level destinations. One name per concept: Home, Discover,
// Compete, Messages, You. Every other screen is a tab or a link inside one of
// these, never a sixth item in the navigation.
export type AppSection = "home" | "discover" | "compete" | "messages" | "you";

export const APP_SECTIONS: { id: AppSection; label: string; path: string }[] = [
  { id: "home", label: "Home", path: "/home" },
  { id: "discover", label: "Discover", path: "/discover" },
  { id: "compete", label: "Compete", path: "/compete" },
  { id: "messages", label: "Messages", path: "/messages" },
  { id: "you", label: "You", path: "/you" },
];

// Nested tabs. These are URL search params (?tab=), not another fixed bar, and
// they scroll away with the content on mobile.
export interface SectionTab {
  id: string;
  label: string;
}

export const SECTION_TABS: Partial<Record<AppSection, SectionTab[]>> = {
  discover: [
    { id: "servers", label: "Servers & players" },
    { id: "clans", label: "Clans" },
  ],
  compete: [
    { id: "overview", label: "Overview" },
    { id: "rankings", label: "Rankings" },
  ],
  you: [
    { id: "profile", label: "Profile" },
    { id: "friends", label: "Friends" },
    { id: "clans", label: "Clans" },
    { id: "settings", label: "Settings" },
  ],
};

export function defaultTab(section: AppSection): string | null {
  return SECTION_TABS[section]?.[0]?.id ?? null;
}

/**
 * Tabs a destination may show. Settings rewrites the signed-in account, so it
 * is withheld while you are looking at another player's profile - the rest of
 * the destination tabs are unchanged.
 */
export function visibleSectionTabs(section: AppSection, viewingOtherPlayer: boolean): SectionTab[] {
  const tabs = SECTION_TABS[section] ?? [];
  return viewingOtherPlayer ? tabs.filter((tab) => tab.id !== "settings") : tabs;
}

/**
 * Which tab actually renders. A requested tab that is not offered here (a
 * hand-typed or shared `/you?player=…&tab=settings` link) falls back to the
 * destination's first tab rather than opening an account screen under someone
 * else's name.
 */
export function resolveSectionTab(
  section: AppSection,
  requested: string | null | undefined,
  viewingOtherPlayer: boolean,
): string | null {
  const visible = visibleSectionTabs(section, viewingOtherPlayer);
  if (requested && visible.some((tab) => tab.id === requested)) return requested;
  return visible[0]?.id ?? requested ?? null;
}

export function sectionFromPath(pathname: string): AppSection | null {
  const first = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (!first) return null;
  return APP_SECTIONS.find((section) => section.id === first)?.id ?? null;
}

export function pathForSection(section: AppSection): string {
  return `/${section}`;
}

// Roles (not "badges") - players earn a role, not a static icon tile.
// Named RoleColor/RoleIcon/EarnedRole etc. (not bare "Role") to stay clear
// of src/site/roles.ts's PLATFORM_ROLES/SHOP_ROLES, which is a completely
// different concept (staff/moderation permission tiers), not something a
// player earns through play.
//
// Every role is either PERMANENT (a cumulative milestone - once true,
// always true: a season played, an hour logged, a game added to the
// library) or TEMPORARY (reflects current state and can be lost: holding
// the top rank, an officer seat, clan membership, a clean record). color
// also sets how hard the role is to earn and how it's presented: ok/cyan
// are common and render as a plain animated color pill with no icon;
// gold/violet/magenta are progressively rarer and get both an icon and a
// stronger animation. muted is the one tier with no animation at all
// (purely informational, e.g. "Linked").

export type RoleColor = "ok" | "cyan" | "violet" | "gold" | "magenta" | "muted";
export type RoleIcon =
  | "seal"
  | "diamond"
  | "crown"
  | "laurel"
  | "wave"
  | "hex"
  | "peak"
  | "spark"
  | "gift"
  | "clock"
  | "maps"
  | "chevron"
  | "mark";
export type RoleAnimation = "none" | "pulse" | "glow" | "shimmer" | "radiant";

/** color -> (animation, hasIcon) - the one place this mapping lives, so "harder roles get icons and better effects" is enforced structurally instead of picked per-role by hand. */
const PRESENTATION: Record<RoleColor, { animation: RoleAnimation; hasIcon: boolean }> = {
  muted: { animation: "none", hasIcon: false },
  ok: { animation: "pulse", hasIcon: false },
  cyan: { animation: "pulse", hasIcon: false },
  gold: { animation: "glow", hasIcon: true },
  violet: { animation: "shimmer", hasIcon: true },
  magenta: { animation: "radiant", hasIcon: true },
};

export interface EarnedRole {
  id: string;
  name: string;
  group: string;
  detail: string;
  color: RoleColor;
  icon: RoleIcon;
  /** Whether PRESENTATION says this tier actually shows the icon - precomputed so renderers never have to re-derive it. */
  showIcon: boolean;
  animation: RoleAnimation;
  permanent: boolean;
  /** Threshold that earned this step, drawn on the role. */
  mark?: string;
}

function role(input: { id: string; name: string; group: string; detail: string; color: RoleColor; icon: RoleIcon; permanent: boolean; mark?: string }): EarnedRole {
  const presentation = PRESENTATION[input.color];
  return { ...input, showIcon: presentation.hasIcon, animation: presentation.animation };
}

// TEMPORARY, not permanent - verification can be revoked (policy violation,
// a reversed payment, etc.), so this role has to be able to come off an
// identity, unlike the cumulative ladder roles below.
export const NAME_VERIFIED: EarnedRole = role({
  id: "verified",
  name: "Verified",
  group: "Standing",
  detail: "Verified account. The shop fee is 2.5%.",
  color: "cyan",
  icon: "seal",
  permanent: false,
});

export interface LadderView {
  id: string;
  label: string;
  unit: string;
  value: number;
  current: EarnedRole | null;
  next: EarnedRole | null;
  nextAt: number | null;
}

export interface RoleResult {
  featured: EarnedRole[];
  earned: EarnedRole[];
  ladders: LadderView[];
  verified: boolean;
}

interface Step {
  id: string;
  name: string;
  at: number;
  color: RoleColor;
  icon: RoleIcon;
  detail: string;
}

// Ladder roles are all PERMANENT - cumulative totals never go down.
const SEASONS: Step[] = [
  { id: "season-spark", name: "Spark", at: 1, color: "cyan", icon: "spark", detail: "One season on KOBA." },
  { id: "season-kindling", name: "Kindling", at: 2, color: "cyan", icon: "spark", detail: "Two seasons on KOBA." },
  { id: "season-flare", name: "Flare", at: 3, color: "gold", icon: "spark", detail: "Three seasons on KOBA." },
  { id: "season-beacon", name: "Beacon", at: 4, color: "gold", icon: "spark", detail: "Four seasons on KOBA." },
  { id: "season-signal", name: "Signal", at: 5, color: "violet", icon: "spark", detail: "Five seasons on KOBA." },
  { id: "season-monument", name: "Monument", at: 6, color: "violet", icon: "spark", detail: "Six or more seasons on KOBA." },
];

const GIFTS: Step[] = [
  { id: "gift-tip", name: "Tip", at: 1, color: "cyan", icon: "gift", detail: "Sent 1 shop gift." },
  { id: "gift-backer", name: "Backer", at: 2, color: "cyan", icon: "gift", detail: "Sent 2 shop gifts." },
  { id: "gift-patron", name: "Patron", at: 3, color: "gold", icon: "gift", detail: "Sent 3 shop gifts." },
  { id: "gift-benefactor", name: "Benefactor", at: 6, color: "gold", icon: "gift", detail: "Sent 6 shop gifts." },
  { id: "gift-keeper", name: "Keeper", at: 10, color: "violet", icon: "gift", detail: "Sent 10 shop gifts." },
  { id: "gift-legend", name: "Legend", at: 20, color: "magenta", icon: "gift", detail: "Sent 20 shop gifts." },
];

const HOURS: Step[] = [
  { id: "hours-scout", name: "Scout", at: 1, color: "cyan", icon: "clock", detail: "1 hour on record." },
  { id: "hours-regular", name: "Regular", at: 20, color: "cyan", icon: "clock", detail: "20 hours on record." },
  { id: "hours-devoted", name: "Devoted", at: 75, color: "gold", icon: "clock", detail: "75 hours on record." },
  { id: "hours-veteran", name: "Veteran", at: 300, color: "gold", icon: "clock", detail: "300 hours on record." },
  { id: "hours-iron", name: "Iron", at: 1000, color: "violet", icon: "clock", detail: "1,000 hours on record." },
  { id: "hours-mythic", name: "Mythic", at: 2000, color: "magenta", icon: "clock", detail: "2,000 hours on record." },
];

const LIBRARY: Step[] = [
  { id: "lib-pair", name: "Pair", at: 2, color: "cyan", icon: "maps", detail: "Played 2 games on record." },
  { id: "lib-circuit", name: "Circuit", at: 5, color: "cyan", icon: "maps", detail: "Played 5 games on record." },
  { id: "lib-range", name: "Range", at: 10, color: "gold", icon: "maps", detail: "Played 10 games on record." },
  { id: "lib-atlas", name: "Atlas", at: 20, color: "violet", icon: "maps", detail: "Played 20 games on record." },
];

// Group-size ladder is TEMPORARY - it reflects the CURRENT roster, which
// can shrink (unlike every other ladder here, which only ever grows).
const RALLY: Step[] = [
  { id: "rally-1", name: "Rally", at: 2, color: "cyan", icon: "chevron", detail: "Group has 2 players." },
  { id: "rally-2", name: "Banner", at: 4, color: "gold", icon: "chevron", detail: "Group has 4 players." },
  { id: "rally-3", name: "Keep", at: 8, color: "violet", icon: "chevron", detail: "Group has 8 players." },
];

function stepToRole(step: Step, group: string, permanent: boolean): EarnedRole {
  return role({ id: step.id, name: step.name, group, detail: step.detail, color: step.color, icon: step.icon, permanent, mark: String(step.at) });
}

function climb(steps: Step[], value: number, group: string, label: string, unit: string, permanent: boolean): LadderView {
  let current: Step | null = null;
  for (const step of steps) {
    if (value >= step.at) current = step;
  }
  const next = steps.find((step) => step.at > value) ?? null;
  return {
    id: group,
    label,
    unit,
    value,
    current: current ? stepToRole(current, group, permanent) : null,
    next: next ? stepToRole(next, group, permanent) : null,
    nextAt: next?.at ?? null,
  };
}

export interface RoleSource {
  id: string;
  score: number;
  status: string;
  strikes: number;
  warnings: number;
  homes: number;
  steam?: string;
  engineBadges: string[];
  verified: boolean;
  business: boolean;
  ownsGroup: boolean;
  officer: boolean;
  groupMembers: number;
  hours: number;
  games: number;
  marks: { id: string; name: string; detail: string; rare: boolean }[];
}

export function resolveBadges(source: RoleSource): RoleResult {
  const record = { seasons: 0, gifts: 0, hours: source.hours, games: source.games };
  const earned: EarnedRole[] = [];
  if (source.business) {
    earned.push(role({ id: "business", name: "Business", group: "Standing", detail: "Business account. Can list on the Official shop.", color: "gold", icon: "diamond", permanent: true }));
  }
  // Founder/Officer are TEMPORARY - tied to a live group seat, lost on leaving or demotion.
  if (source.ownsGroup || source.engineBadges.includes("Clan lead")) {
    earned.push(role({ id: "founder", name: "Founder", group: "Standing", detail: "Owns a group, or leads a clan.", color: "violet", icon: "crown", permanent: false }));
  } else if (source.officer) {
    earned.push(role({ id: "officer", name: "Officer", group: "Standing", detail: "Officer role in a group.", color: "cyan", icon: "chevron", permanent: false }));
  }
  // Ranked is TEMPORARY - someone else can take the top spot.
  if (source.score >= 2000 || source.engineBadges.includes("Ranked")) {
    earned.push(role({ id: "ranked", name: "Ranked", group: "Standing", detail: "Top of the current board.", color: "gold", icon: "laurel", permanent: false }));
  }

  const ladders = [
    climb(SEASONS, record.seasons, "Season", "Seasons", "seasons", true),
    climb(GIFTS, record.gifts, "Gifts", "Gifts", "gifts", true),
    climb(HOURS, record.hours, "Hours", "Hours", "hours", true),
    climb(LIBRARY, record.games, "Library", "Library", "games", true),
    climb(RALLY, source.groupMembers, "Group", "Group", "players", false),
  ];

  for (const ladder of ladders) {
    if (ladder.current && ladder.id !== "Group") earned.push(ladder.current);
  }
  const rally = ladders.find((ladder) => ladder.id === "Group");
  if (rally?.current && source.groupMembers > 0) earned.push(rally.current);

  // Clear is TEMPORARY - a later strike/warning ends it.
  if (source.status === "clear" && source.strikes === 0 && source.warnings === 0) {
    earned.push(role({ id: "clear", name: "Clear", group: "Marks", detail: "No warnings and no strikes.", color: "ok", icon: "seal", permanent: false }));
  }
  // Twin camp is TEMPORARY - a home can be unset.
  if (source.homes >= 2) {
    earned.push(role({ id: "camps", name: "Twin camp", group: "Marks", detail: "Two homes set.", color: "cyan", icon: "mark", permanent: false }));
  }
  if (source.steam) {
    earned.push(role({ id: "linked", name: "Linked", group: "Marks", detail: "Steam is linked on this identity.", color: "muted", icon: "hex", permanent: true }));
  }
  for (const mark of source.marks) {
    if (earned.some((item) => item.name.toLowerCase() === mark.name.toLowerCase())) continue;
    if (/warn/i.test(mark.name)) continue;
    earned.push(
      role({
        id: `mark-${mark.id}`,
        name: mark.name,
        group: "Marks",
        detail: mark.detail,
        color: mark.rare ? "gold" : "ok",
        icon: "mark",
        permanent: true,
      }),
    );
  }

  const preferred = ["business", "founder", "officer", "ranked"];
  const head = preferred.flatMap((id) => {
    const found = earned.find((item) => item.id === id);
    return found ? [found] : [];
  });
  const season = ladders.find((ladder) => ladder.id === "Season")?.current;
  const gift = ladders.find((ladder) => ladder.id === "Gifts")?.current;
  const featured = [...head.slice(0, 4), ...(season ? [season] : []), ...(gift ? [gift] : [])].slice(0, 6);

  return { featured, earned, ladders, verified: source.verified };
}

export function sourceFor(
  identity: {
    id: string;
    score: number;
    status: string;
    strikes: number;
    warnings: number;
    homes: { name: string }[];
    steamId?: string;
    badges: string[];
    clanId?: string;
    hours?: number;
    gameHours?: Record<string, number>;
  },
  standing: { verified: boolean; business: boolean },
  flags: { ownsGroup: boolean; officer: boolean; groupId?: string; groupMembers: number },
  marks: { id: string; name: string; detail: string; rare: boolean }[],
): RoleSource {
  const games = Object.values(identity.gameHours ?? {}).filter((value) => value >= 5).length;
  return {
    id: identity.id,
    score: identity.score,
    status: identity.status,
    strikes: identity.strikes,
    warnings: identity.warnings,
    homes: identity.homes.length,
    steam: identity.steamId,
    engineBadges: identity.badges,
    verified: standing.verified,
    business: standing.business,
    ownsGroup: flags.ownsGroup,
    officer: flags.officer,
    groupMembers: flags.groupMembers,
    hours: identity.hours ?? 0,
    games,
    marks,
  };
}

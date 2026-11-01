/**
 * The KOBA rank ladder - one crest per tier, easiest first. `at` is the score
 * that unlocks the tier; the top tier has no ceiling. Art comes from the same
 * player badge sheet the achievement grid uses (public/badges/player), picked
 * so the crest escalates from a plain headset to the starred laurel.
 */
export const RANKS = [
  { id: "apprentice", name: "Apprentice", at: 0, art: "/badges/player/rivalry-1.png" },
  { id: "marksman", name: "Marksman", at: 700, art: "/badges/player/rivalry-2.png" },
  { id: "vanguard", name: "Vanguard", at: 1000, art: "/badges/player/rivalry-3.png" },
  { id: "veteran", name: "Veteran", at: 1300, art: "/badges/player/competition-3.png" },
  { id: "master", name: "Master", at: 1600, art: "/badges/player/competition-4.png" },
  { id: "grandmaster", name: "Grandmaster", at: 1850, art: "/badges/player/legend-3.png" },
  { id: "elite-guardian", name: "Elite Guardian", at: 2100, art: "/badges/player/legend-4.png" },
  { id: "legendary", name: "Legendary", at: 2400, art: "/badges/player/legend-5.png" },
] as const;

export function rankFor(score: number) {
  let index = 0;
  for (let cursor = 0; cursor < RANKS.length; cursor += 1) {
    if (score >= RANKS[cursor].at) index = cursor;
  }
  return { ...RANKS[index], index, number: index + 1, next: RANKS[index + 1] ?? null };
}

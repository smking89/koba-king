/**
 * Plain-language explanations for the competitive vocabulary on the cards.
 * Every rank and role in this app comes from a real game, so players who do not
 * live in one title should still understand what they are looking at.
 */

export interface GlossaryEntry {
  term: string;
  def: string;
}

export const ROLE_HINTS: Record<string, string> = {
  Duelist: 'Opens the first fight and creates space for the squad.',
  Fragger: 'Pushes for kills and finishes the fights other players start.',
  Striker: 'The attacker in Rocket League — scores and pressures the goal.',
  IGL: 'In-game leader — calls the strategy and the rotations.',
  Sentinel: 'Holds the flank and locks down the site.',
  Controller: 'Smokes and walls off sightlines so the team can move.',
  Initiator: 'Starts the push with recon and crowd control.',
  Support: 'Keeps teammates alive and sets up the plays.',
  Anchor: 'Defends the back site alone and stalls the enemy.',
  Flex: 'Fills whatever the squad is missing.',
  Jungler: 'Roams the map to create advantages for every lane.',
  Carry: 'Expected to deal the damage that wins the game.',
};

export const TERMS: GlossaryEntry[] = [
  {
    term: 'RP (Rank Points)',
    def: 'The score KOBA keeps for you. Win a locked challenge and it goes up; lose or no-show and it drops.',
  },
  {
    term: 'Rank',
    def: 'Your competitive tier inside one specific game — Predator in Apex, Immortal in Valorant, Champion in Rocket League. Every game has its own ladder, so one player can hold several different ranks.',
  },
  {
    term: 'Ranked games',
    def: 'How many different games you hold a rank in. It counts your ladders — it is not a skill level.',
  },
  {
    term: 'Role',
    def: 'The job you take in a squad. Fragger means you push for kills; IGL means you call the strategy; Striker means you attack in Rocket League.',
  },
  {
    term: 'Kill tier',
    def: 'How long a challenge runs. 3 kills is a Skirmish, 5 is a Vendetta, 10 is an Execution. Higher tiers move more RP.',
  },
  {
    term: 'Reliability',
    def: 'The share of locked challenges this player actually showed up for. Above 90% is unusually dependable.',
  },
  {
    term: 'Fit',
    def: 'How closely a rival matches your games, rank, region, platform and RP. It only sorts the deck — you still decide.',
  },
];

export function roleHint(role: string): string {
  return ROLE_HINTS[role] ?? `The job this player takes on in a ${role.toLowerCase()} role.`;
}

export function rankHint(rank: string, gameName: string): string {
  return `${rank} — this player's competitive rank in ${gameName}. Each game has its own ladder.`;
}

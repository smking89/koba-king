import type { Game } from '../types';

/**
 * Logo artwork is bundled under /logos (downscaled renders of each title's
 * official mark) so the app never hotlinks a third-party CDN at runtime.
 */
export const GAMES: Game[] = [
  // The one real, KOBA-backed title - everything in src/lib/kobaApi.ts is scoped to
  // this gameId only. logo path is a placeholder: drop the real mark at
  // public/logos/rust.png (no Rust Console Edition logo asset was available to bundle here).
  { id: 'rust_console', name: 'Rust Console Edition', short: 'RUST', category: 'Survival', platforms: ['PS5', 'Xbox'], accent: ['#ce4a1f', '#5c2410'], logo: '/logos/rust.png' },
  { id: 'valorant', name: 'VALORANT', short: 'VAL', category: 'Tactical', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#ff4655', '#7a1f2b'], logo: '/logos/valorant.png' },
  { id: 'cs2', name: 'Counter-Strike 2', short: 'CS2', category: 'Tactical', platforms: ['PC'], accent: ['#e8a020', '#6b4a12'], logo: '/logos/cs2.png' },
  { id: 'league', name: 'League of Legends', short: 'LoL', category: 'MOBA', platforms: ['PC'], accent: ['#c8aa6e', '#3b4a6b'], logo: '/logos/league.png' },
  { id: 'overwatch', name: 'Overwatch 2', short: 'OW2', category: 'Hero Shooter', platforms: ['PC', 'PS5', 'Xbox', 'Switch'], accent: ['#f99e1a', '#8a5410'], logo: '/logos/overwatch.png' },
  { id: 'marvelrivals', name: 'Marvel Rivals', short: 'RIV', category: 'Hero Shooter', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#5b8cff', '#2b3a8a'], logo: '/logos/marvelrivals.png' },
  { id: 'apex', name: 'Apex Legends', short: 'APEX', category: 'Battle Royale', platforms: ['PC', 'PS5', 'Xbox', 'Switch'], accent: ['#da292a', '#6d1414'], logo: '/logos/apex.png' },
  { id: 'fortnite', name: 'Fortnite', short: 'FN', category: 'Battle Royale', platforms: ['PC', 'PS5', 'Xbox', 'Switch'], accent: ['#9d4dff', '#4a2280'], logo: '/logos/fortnite.png' },
  { id: 'warzone', name: 'Call of Duty: Warzone', short: 'WZ', category: 'FPS', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#93a13c', '#4a5220'], logo: '/logos/warzone.png' },
  { id: 'r6', name: 'Rainbow Six Siege', short: 'R6', category: 'Tactical', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#4a9fe0', '#1f4a6b'], logo: '/logos/r6.png' },
  { id: 'rocketleague', name: 'Rocket League', short: 'RL', category: 'Racing', platforms: ['PC', 'PS5', 'Xbox', 'Switch'], accent: ['#2e6be6', '#16336b'], logo: '/logos/rocketleague.png' },
  { id: 'sf6', name: 'Street Fighter 6', short: 'SF6', category: 'Fighter', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#f5c518', '#8a6c08'], logo: '/logos/sf6.jpg' },
  { id: 'tekken8', name: 'Tekken 8', short: 'T8', category: 'Fighter', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#ff3d8b', '#7a1a42'], logo: '/logos/tekken8.png' },
  { id: 'smash', name: 'Smash Ultimate', short: 'SSBU', category: 'Fighter', platforms: ['Switch'], accent: ['#e8433f', '#6b1c1a'], logo: '/logos/smash.png' },
  { id: 'deadlock', name: 'Deadlock', short: 'DL', category: 'MOBA', platforms: ['PC'], accent: ['#d8a24a', '#5c4318'], logo: '/logos/deadlock.png' },
  { id: 'thefinals', name: 'The Finals', short: 'TF', category: 'FPS', platforms: ['PC', 'PS5', 'Xbox'], accent: ['#ff7a2f', '#7a3a12'], logo: '/logos/thefinals.png' },
  { id: 'halo', name: 'Halo Infinite', short: 'HALO', category: 'FPS', platforms: ['PC', 'Xbox'], accent: ['#4fc3f7', '#1a5065'], logo: '/logos/halo.png' },
  { id: 'eafc', name: 'EA SPORTS FC', short: 'FC', category: 'Sports', platforms: ['PC', 'PS5', 'Xbox', 'Switch'], accent: ['#38d66b', '#14602f'], logo: '/logos/eafc.png' },
  { id: 'dota2', name: 'Dota 2', short: 'DOTA', category: 'MOBA', platforms: ['PC'], accent: ['#b23a3a', '#4f1a1a'], logo: '/logos/dota2.png' },
];

export const GAME_BY_ID: Record<string, Game> = Object.fromEntries(
  GAMES.map((game) => [game.id, game]),
);

export function getGame(id: string): Game {
  return GAME_BY_ID[id] ?? GAMES[0];
}

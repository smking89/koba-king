import type { ArenaServer } from '../types';

/** Demo arena network. In production this comes from the RCON query service. */
export const SERVERS: ArenaServer[] = [
  { id: 's1', name: 'Rustopia Main', gameId: 'valorant', ip: '147.185.221.10:28015', region: 'America', players: 18, maxPlayers: 24, ping: 24, active: true, rules: 'FFA · 128 tick · no spectators', featured: true },
  { id: 's2', name: 'Dustline Competitive', gameId: 'cs2', ip: '147.185.221.24:27015', region: 'America', players: 12, maxPlayers: 20, ping: 31, active: true, rules: 'Arena · 1v1 ladder', featured: false },
  { id: 's3', name: 'Neon District', gameId: 'valorant', ip: '192.223.30.88:28015', region: 'America', players: 9, maxPlayers: 24, ping: 58, active: true, rules: 'Retake · rank matched', featured: false },
  { id: 's4', name: 'Apex Arena EU', gameId: 'apex', ip: '63.141.232.19:37015', region: 'EU', players: 21, maxPlayers: 30, ping: 92, active: true, rules: 'TDM · 1v1 duels', featured: true },
  { id: 's5', name: 'Rocket Yard', gameId: 'rocketleague', ip: '104.153.86.42:7777', region: 'America', players: 6, maxPlayers: 16, ping: 19, active: true, rules: 'Private · hoops', featured: false },
  { id: 's6', name: 'Iron Dojo', gameId: 'tekken8', ip: '45.88.102.7:7778', region: 'Oceania', players: 14, maxPlayers: 16, ping: 138, active: true, rules: 'First to 3 · tournament ruleset', featured: false },
  { id: 's7', name: 'Overwatch Scrims', gameId: 'overwatch', ip: '172.96.190.5:27015', region: 'EU', players: 3, maxPlayers: 12, ping: 104, active: false, rules: 'Scrim · role queue off', featured: false },
  { id: 's8', name: 'Block Party', gameId: 'thefinals', ip: '198.51.100.77:7777', region: 'America', players: 11, maxPlayers: 12, ping: 47, active: true, rules: 'Cashout · casual', featured: false },
  { id: 's9', name: 'Halo Ring 01', gameId: 'halo', ip: '203.0.113.14:11774', region: 'America', players: 8, maxPlayers: 16, ping: 52, active: true, rules: 'Arena · BR starts', featured: false },
  { id: 's10', name: 'Rivals Dome', gameId: 'marvelrivals', ip: '192.0.2.44:27015', region: 'America', players: 15, maxPlayers: 12, ping: 27, active: true, rules: 'Custom · competitive', featured: true },
  { id: 's11', name: 'Siege Vault', gameId: 'r6', ip: '198.51.100.9:7001', region: 'EU', players: 7, maxPlayers: 10, ping: 88, active: true, rules: 'Bomb · ranked rules', featured: false },
  { id: 's12', name: 'Smash Garage', gameId: 'smash', ip: '203.0.113.55:11674', region: 'Oceania', players: 4, maxPlayers: 8, ping: 121, active: true, rules: 'Battlefield · 3 stock', featured: false },
];

export const SERVER_BY_ID: Record<string, ArenaServer> = Object.fromEntries(
  SERVERS.map((server) => [server.id, server]),
);

export function serversForGame(gameId: string): ArenaServer[] {
  return SERVERS.filter((server) => server.gameId === gameId).sort(
    (a, b) => Number(b.active) - Number(a.active) || a.ping - b.ping,
  );
}

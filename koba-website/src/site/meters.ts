export const GAME_HOUR_MARK = 5;

export function titlesPlayed(gameHours?: Record<string, number>) {
  return Object.values(gameHours ?? {}).filter((hours) => hours >= GAME_HOUR_MARK).length;
}

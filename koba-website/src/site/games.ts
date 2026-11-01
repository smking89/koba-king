export type Device = "PC" | "Console" | "Mobile" | "Web";

export interface SupportedGame {
  id: string;
  name: string;
  devices: Device[];
  reach: "Strong" | "Good" | "Limited" | "Read";
  /** Real square game art (SteamGridDB), used by the picker and server cards. */
  icon: string;
}

/** Titles the connector blueprint can onboard. Not a fake server list. */
export const SUPPORTED_GAMES: SupportedGame[] = [
  { id: "RUST", name: "Rust", devices: ["PC", "Console"], reach: "Strong", icon: "/games/rust.png" },
  { id: "ARK", name: "ARK: Survival Ascended", devices: ["PC", "Console"], reach: "Strong", icon: "/games/ark.png" },
  { id: "MINECRAFT", name: "Minecraft", devices: ["PC", "Mobile", "Console"], reach: "Strong", icon: "/games/minecraft.png" },
  { id: "DAYZ", name: "DayZ", devices: ["PC", "Console"], reach: "Limited", icon: "/games/dayz.png" },
  { id: "PALWORLD", name: "Palworld", devices: ["PC", "Console"], reach: "Good", icon: "/games/palworld.png" },
  { id: "CS2", name: "Counter-Strike 2", devices: ["PC"], reach: "Strong", icon: "/games/cs2.png" },
  { id: "VALHEIM", name: "Valheim", devices: ["PC"], reach: "Good", icon: "/games/valheim.png" },
  { id: "SEVEN_DAYS", name: "7 Days to Die", devices: ["PC", "Console"], reach: "Limited", icon: "/games/seven-days.png" },
  { id: "SCUM", name: "SCUM", devices: ["PC"], reach: "Good", icon: "/games/scum.png" },
  { id: "UNTURNED", name: "Unturned", devices: ["PC"], reach: "Good", icon: "/games/unturned.png" },
  { id: "ENSHROUDED", name: "Enshrouded", devices: ["PC"], reach: "Limited", icon: "/games/enshrouded.png" },
  { id: "SATISFACTORY", name: "Satisfactory", devices: ["PC"], reach: "Good", icon: "/games/satisfactory.png" },
  { id: "VALORANT", name: "Valorant", devices: ["PC", "Console"], reach: "Read", icon: "/games/valorant.png" },
];

export function gameName(id: string) {
  return SUPPORTED_GAMES.find((game) => game.id === id)?.name ?? id;
}

export function gameIcon(id: string): string | undefined {
  return SUPPORTED_GAMES.find((game) => game.id === id)?.icon;
}

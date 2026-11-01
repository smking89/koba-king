function setting(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof value === "string" ? value.trim() : "";
}

export const publicConfig = {
  discordBot: setting("VITE_DISCORD_BOT"),
  discordSite: setting("VITE_DISCORD_SITE"),
  discordServers: setting("VITE_DISCORD_SERVERS"),
  developerId: setting("VITE_KOBA_DEV_ID"),
};

export function socialLinks() {
  return [
    { href: publicConfig.discordBot, label: "KOBAbot" },
    { href: publicConfig.discordSite, label: "koba.games" },
    { href: publicConfig.discordServers, label: "KOBA servers" },
  ].filter((item) => item.href.startsWith("https://"));
}

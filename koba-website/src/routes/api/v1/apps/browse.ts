import { createFileRoute } from "@tanstack/react-router";
import type { AppType, GameId } from "@/site/app-store";
import { browse } from "@/site/app-store.server";

const TYPES = new Set(["BOT", "PLUGIN", "ADAPTER"]);
const GAMES = new Set(["RUST", "DAYZ", "ARK", "MINECRAFT"]);

export const Route = createFileRoute("/api/v1/apps/browse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") ?? "";
        const game = url.searchParams.get("game") ?? "";
        if (type && !TYPES.has(type)) return Response.json({ error: "Unknown app type." }, { status: 400 });
        if (game && !GAMES.has(game)) return Response.json({ error: "Unknown game." }, { status: 400 });
        return Response.json({ apps: browse({ type: type as AppType | "", game: game as GameId | "" }) });
      },
    },
  },
});

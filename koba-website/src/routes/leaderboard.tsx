import { createFileRoute } from "@tanstack/react-router";
import { PublicLeaderboard } from "@/components/public-leaderboard";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Global leaderboard · KOBA" },
      {
        name: "description",
        content:
          "The public KOBA scoreboard: every score comes from a match a server reported and the gates accepted. Filter by region and find your rivals.",
      },
    ],
  }),
  component: PublicLeaderboard,
});

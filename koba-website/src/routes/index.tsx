import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing";

/**
 * The public homepage. It renders for every visitor — signed in or not — the
 * way a marketing home does; the landing's own CTAs route into the app (`/home`)
 * or into sign-in (`/login`) depending on session state.
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KOBA · Every rank you earn, on every server you play" },
      {
        name: "description",
        content:
          "KOBA links your PC and console accounts into one profile, scores the matches your servers report, and puts you on leaderboards your rivals can't argue with. Free for players.",
      },
    ],
  }),
  component: LandingPage,
});

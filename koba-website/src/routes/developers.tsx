import { createFileRoute } from "@tanstack/react-router";
import { DeveloperDocs } from "@/components/developers/docs-portal";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "KOBA Developers · API reference & playground" },
      {
        name: "description",
        content:
          "The KOBA public API: player profiles, leaderboards, match results, servers, and normalized events. Read the reference, run a mocked call, and copy a snippet.",
      },
    ],
  }),
  component: DeveloperDocs,
});

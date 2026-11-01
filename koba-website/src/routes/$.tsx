import { createFileRoute } from "@tanstack/react-router";
import { PlatformApp } from "@/components/platform-app";

/**
 * The signed-in app lives under /home, /discover, /compete, /messages and
 * /you. A single splat route keeps the app shell mounted across those
 * destinations (no data reload when switching tabs) while still giving every
 * screen a real URL, a shareable link and a working back button.
 */
export const Route = createFileRoute("/$")({ component: PlatformApp });

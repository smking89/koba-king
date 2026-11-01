import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { DirectMessage, DirectThread } from "@/site/community";

export const loadMyThreads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DirectThread[]> => {
    const { listMyThreads } = await import("@/lib/messaging/messages.server");
    return listMyThreads(context.userId);
  });

export const openThread = createServerFn({ method: "POST" })
  .validator((input: { otherId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { openRealThread } = await import("@/lib/messaging/messages.server");
    return openRealThread(context.userId, data.otherId);
  });

export const sendDirect = createServerFn({ method: "POST" })
  .validator((input: { threadId: string; text: string; sticker?: { name: string; packTitle: string }; kind?: DirectMessage["kind"]; payload?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<DirectMessage> => {
    const { sendRealDirect } = await import("@/lib/messaging/messages.server");
    return sendRealDirect(data.threadId, context.userId, data.text, data.sticker, { kind: data.kind, payload: data.payload });
  });

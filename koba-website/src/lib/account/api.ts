import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string> => {
    const { exportPlayerData } = await import("@/lib/account/account.server");
    return exportPlayerData(context.userId);
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { deletePlayerAccount } = await import("@/lib/account/account.server");
    return deletePlayerAccount(context.userId);
  });

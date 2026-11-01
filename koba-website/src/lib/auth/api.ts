import { createServerFn } from "@tanstack/react-start";
import type { SignInOptions } from "./status.server";

/** Client-safe view of the provider configuration for the sign-up buttons. */
export const loadSignInOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<SignInOptions> => {
    const { signInOptions } = await import("./status.server");
    return signInOptions();
  },
);

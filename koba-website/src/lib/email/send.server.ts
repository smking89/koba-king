import { renderToStaticMarkup } from "react-dom/server";
import { templateBySlug } from "@/lib/email/registry";

/**
 * RESEND_API_KEY is read from the environment only - never hardcoded, no
 * .env file committed - same convention as STRIPE_SECRET_KEY in
 * src/lib/stripe/connect.server.ts. Without a real key configured, sending
 * throws a clear "not configured" error rather than silently no-op'ing.
 */
type ResendModule = typeof import("resend");
let resendModulePromise: Promise<ResendModule> | null = null;
function loadResend(): Promise<ResendModule> {
  resendModulePromise ??= import("resend");
  return resendModulePromise;
}

function requireApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Email is not configured. Set RESEND_API_KEY in the environment.");
  return key;
}

/** From address per department - matches the real koba.games mailboxes. */
const FROM_FOR_DEPARTMENT: Record<string, string> = {
  support: "KOBA Support <support@koba.games>",
  admin: "KOBA Admin <admin@koba.games>",
  creator: "KOBA Creator Program <creator@koba.games>",
  partner: "KOBA Partnerships <partner@koba.games>",
  biz: "KOBA Advertising <biz@koba.games>",
  safety: "KOBA Trust & Safety <safety@koba.games>",
  legal: "KOBA Legal <legal@koba.games>",
};

/**
 * Sends one of the 35 registered templates as real email via Resend. `vars`
 * does simple {{token}} substitution over the rendered HTML - templates are
 * static JSX (no live data binding yet), so this is a text-replace pass,
 * not a real templating engine. Every {{token}} left unfilled is a bug in
 * the caller, not something to silently blank out.
 */
export async function sendTemplateEmail(
  slug: string,
  to: string,
  vars: Record<string, string>,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const template = templateBySlug(slug);
  if (!template) return { ok: false, reason: `Unknown email template: ${slug}` };

  let html = `<!doctype html><html><body>${renderToStaticMarkup(template.render() as never)}</body></html>`;
  let subject = template.subject;
  for (const [key, value] of Object.entries(vars)) {
    const token = `{{${key}}}`;
    html = html.split(token).join(value);
    subject = subject.split(token).join(value);
  }
  const missing = html.match(/\{\{[a-z_]+\}\}/g);
  if (missing) return { ok: false, reason: `Missing template variables: ${[...new Set(missing)].join(", ")}` };

  const apiKey = requireApiKey();
  const { Resend } = await loadResend();
  const resend = new Resend(apiKey);
  const from = FROM_FOR_DEPARTMENT[template.department] ?? "KOBA <support@koba.games>";

  const result = await resend.emails.send({ from, to, subject, html });
  if (result.error) return { ok: false, reason: result.error.message };
  return { ok: true, id: result.data?.id ?? "" };
}

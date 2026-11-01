import { adminTemplates } from "@/lib/email/templates/admin";
import { bizTemplates } from "@/lib/email/templates/biz";
import { creatorTemplates } from "@/lib/email/templates/creator";
import { legalTemplates } from "@/lib/email/templates/legal";
import { partnerTemplates } from "@/lib/email/templates/partner";
import { safetyTemplates } from "@/lib/email/templates/safety";
import { supportTemplates } from "@/lib/email/templates/support";
import type { EmailDepartment, EmailTemplate } from "@/lib/email/registry-types";

export const DEPARTMENT_ADDRESS: Record<EmailDepartment, string> = {
  support: "support@koba.games",
  admin: "admin@koba.games",
  creator: "creator@koba.games",
  partner: "partner@koba.games",
  biz: "biz@koba.games",
  safety: "safety@koba.games",
  legal: "legal@koba.games",
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  ...supportTemplates,
  ...adminTemplates,
  ...creatorTemplates,
  ...partnerTemplates,
  ...bizTemplates,
  ...safetyTemplates,
  ...legalTemplates,
];

export function templateBySlug(slug: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((template) => template.slug === slug);
}

import type { ReactNode } from "react";

export type EmailDepartment = "support" | "admin" | "creator" | "partner" | "biz" | "safety" | "legal";

export interface EmailTemplate {
  slug: string;
  department: EmailDepartment;
  label: string;
  subject: string;
  render: () => ReactNode;
}

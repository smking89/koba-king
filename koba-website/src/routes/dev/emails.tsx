import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DEPARTMENT_ADDRESS, EMAIL_TEMPLATES } from "@/lib/email/registry";
import type { EmailDepartment } from "@/lib/email/registry-types";

export const Route = createFileRoute("/dev/emails")({
  component: EmailPreviewPage,
});

const DEPARTMENTS: EmailDepartment[] = ["support", "admin", "creator", "partner", "biz", "safety", "legal"];

/**
 * Internal, unlinked preview for the 35 transactional email templates - not
 * the Email Template Studio (no live editing, variables, or send pipeline;
 * no provider is wired up yet). Just makes the shared design system
 * actually previewable while that gets built.
 */
function EmailPreviewPage() {
  const [active, setActive] = useState(EMAIL_TEMPLATES[0]!.slug);
  const current = EMAIL_TEMPLATES.find((template) => template.slug === active)!;

  return (
    <div className="grid min-h-dvh grid-cols-[18rem_minmax(0,1fr)] bg-bg text-fg">
      <aside className="overflow-y-auto border-r border-border p-4">
        <h1 className="text-sm font-semibold">Email templates</h1>
        <p className="mt-1 text-xs text-muted">35 templates, 7 departments. Preview only — no provider wired up yet.</p>
        {DEPARTMENTS.map((department) => (
          <div key={department} className="mt-5">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-violet uppercase">{DEPARTMENT_ADDRESS[department]}</p>
            <ul className="mt-2 grid gap-1">
              {EMAIL_TEMPLATES.filter((template) => template.department === department).map((template) => (
                <li key={template.slug}>
                  <button
                    type="button"
                    onClick={() => setActive(template.slug)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${active === template.slug ? "bg-fg text-bg" : "text-muted hover:bg-bg-subtle"}`}
                  >
                    {template.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
      <main className="overflow-y-auto p-8">
        <p className="font-mono text-xs text-muted">Subject</p>
        <h2 className="mb-6 text-lg font-semibold">{current.subject}</h2>
        {current.render()}
      </main>
    </div>
  );
}

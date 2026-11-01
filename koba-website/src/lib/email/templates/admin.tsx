import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard, StatusPill } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const adminTemplates: EmailTemplate[] = [
  {
    slug: "admin-critical-alert",
    department: "admin",
    label: "Critical system alert",
    subject: "[CRITICAL] KOBA service incident — {{service_name}}",
    render: () => (
      <EmailShell preheader="A critical incident was detected.">
        <StatusPill tone="danger">Critical</StatusPill>
        <Heading>Incident: {"{{service_name}}"}</Heading>
        <InfoCard>
          Incident ID: {"{{incident_id}}"}
          <br />
          Detected: {"{{detected_at}}"}
          <br />
          Affected service: {"{{service_name}}"}
          <br />
          Impact: {"{{impact_summary}}"}
        </InfoCard>
        <EmailButton href="{{monitoring_url}}">Open Incident Dashboard</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "admin-service-recovery",
    department: "admin",
    label: "Service recovery",
    subject: "[RESOLVED] KOBA service restored — {{incident_id}}",
    render: () => (
      <EmailShell preheader="The incident has been resolved.">
        <StatusPill tone="ok">Resolved</StatusPill>
        <Heading>Service restored</Heading>
        <InfoCard>
          Incident ID: {"{{incident_id}}"}
          <br />
          Resolved: {"{{resolved_at}}"}
          <br />
          Duration: {"{{incident_duration}}"}
        </InfoCard>
        <Body>Outstanding follow-up: {"{{outstanding_items}}"}</Body>
        <EmailButton href="{{report_url}}">Review Incident Report</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "admin-privileged-change",
    department: "admin",
    label: "Privileged account change",
    subject: "KOBA Admin Audit — Privileged access changed",
    render: () => (
      <EmailShell preheader="A privileged access change was recorded.">
        <Eyebrow>Audit event</Eyebrow>
        <Heading>Privileged access changed</Heading>
        <InfoCard>
          Role: {"{{role_name}}"}
          <br />
          Action: {"{{action_taken}}"}
          <br />
          Actor: {"{{authorized_actor}}"}
          <br />
          Timestamp: {"{{event_time}}"}
          <br />
          Audit ID: {"{{audit_event_id}}"}
        </InfoCard>
        <EmailButton href="{{audit_log_url}}">Review Audit Log</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "admin-job-failure",
    department: "admin",
    label: "Job or integration failure",
    subject: "[ACTION REQUIRED] KOBA job failed — {{job_id}}",
    render: () => (
      <EmailShell preheader="A background job failed and needs attention.">
        <StatusPill tone="warn">Action required</StatusPill>
        <Heading>Job failed: {"{{job_id}}"}</Heading>
        <InfoCard>
          Failed stage: {"{{failed_stage}}"}
          <br />
          Retry status: {"{{retry_status}}"}
          <br />
          Error: {"{{sanitized_error}}"}
        </InfoCard>
        <EmailButton href="{{job_url}}">Inspect Failed Job</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "admin-ops-digest",
    department: "admin",
    label: "Daily operations digest",
    subject: "KOBA Operations Report — {{date}}",
    render: () => (
      <EmailShell preheader="Daily operations summary.">
        <Eyebrow>Operations digest — {"{{date}}"}</Eyebrow>
        <Heading>Platform health summary</Heading>
        <InfoCard>
          Uptime: {"{{uptime_percent}}"}
          <br />
          Failed jobs: {"{{failed_job_count}}"}
          <br />
          Queue health: {"{{queue_health}}"}
          <br />
          Delivery failures: {"{{delivery_failure_count}}"}
          <br />
          Flagged activity: {"{{flagged_activity_count}}"}
          <br />
          Unresolved incidents: {"{{unresolved_incident_count}}"}
        </InfoCard>
        <FinePrint>Sent to staff with operations access only.</FinePrint>
      </EmailShell>
    ),
  },
];

import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const legalTemplates: EmailTemplate[] = [
  {
    slug: "legal-privacy-request",
    department: "legal",
    label: "Privacy request received",
    subject: "KOBA Privacy — Request received {{reference_id}}",
    render: () => (
      <EmailShell preheader="Your privacy request has been received.">
        <Eyebrow>Privacy</Eyebrow>
        <Heading>Request received</Heading>
        <InfoCard>
          Request type: {"{{request_type}}"}
          <br />
          Reference: {"{{reference_id}}"}
          <br />
          Received: {"{{received_date}}"}
        </InfoCard>
        <Body>We may ask you to verify your identity through a secure channel before completing this request.</Body>
        <EmailButton href="{{request_url}}">View Request Status</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "legal-data-export-ready",
    department: "legal",
    label: "Data export ready",
    subject: "Your KOBA data export is ready",
    render: () => (
      <EmailShell preheader="Your data export is ready to download.">
        <Eyebrow>Data archive</Eyebrow>
        <Heading>Your export is ready</Heading>
        <Body>Your data archive is ready as a {"{{file_format}}"} file. This link expires {"{{expiry_date}}"}.</Body>
        <EmailButton href="{{export_url}}">Access Data Export</EmailButton>
        <FinePrint>You may be asked to sign in again to access this download.</FinePrint>
      </EmailShell>
    ),
  },
  {
    slug: "legal-deletion-confirmation",
    department: "legal",
    label: "Account deletion confirmation",
    subject: "KOBA — Account deletion request confirmed",
    render: () => (
      <EmailShell preheader="Your account deletion status.">
        <Eyebrow>Account deletion</Eyebrow>
        <Heading>{"{{deletion_status}}"}</Heading>
        <Body>{"{{deletion_detail}}"}</Body>
        <FinePrint>Data retained under applicable requirements: {"{{retained_data_notice}}"}.</FinePrint>
        <EmailButton href="{{request_url}}">View Request Details</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "legal-policy-update",
    department: "legal",
    label: "Terms or privacy policy update",
    subject: "Important update to KOBA's {{policy_name}}",
    render: () => (
      <EmailShell preheader="KOBA's policy has been updated.">
        <Eyebrow>Policy update</Eyebrow>
        <Heading>{"{{policy_name}}"} has changed</Heading>
        <InfoCard>
          Version: {"{{policy_version}}"}
          <br />
          Effective: {"{{effective_date}}"}
        </InfoCard>
        <Body>{"{{material_changes_summary}}"}</Body>
        <EmailButton href="{{policy_url}}">Read Updated Policy</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "legal-formal-notice",
    department: "legal",
    label: "Formal notice received",
    subject: "KOBA Legal — Correspondence received {{reference_id}}",
    render: () => (
      <EmailShell preheader="Your correspondence has been received.">
        <Eyebrow>Legal correspondence</Eyebrow>
        <Heading>Correspondence received</Heading>
        <Body>Reference: {"{{reference_id}}"}. This acknowledges receipt only; please direct follow-up to {"{{followup_channel}}"}.</Body>
      </EmailShell>
    ),
  },
];

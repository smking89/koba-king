import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const partnerTemplates: EmailTemplate[] = [
  {
    slug: "partner-inquiry-received",
    department: "partner",
    label: "Inquiry received",
    subject: "KOBA Partnerships — Inquiry received {{reference_id}}",
    render: () => (
      <EmailShell preheader="Your partnership inquiry was received.">
        <Eyebrow>Partnerships</Eyebrow>
        <Heading>Inquiry received</Heading>
        <InfoCard>
          Organization: {"{{organization_name}}"}
          <br />
          Reference: {"{{reference_id}}"}
          <br />
          Category: {"{{inquiry_category}}"}
        </InfoCard>
        <Body>Next step: {"{{next_step}}"}.</Body>
        <EmailButton href="{{inquiry_url}}">View Inquiry</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "partner-proposal",
    department: "partner",
    label: "Partnership proposal",
    subject: "KOBA × {{organization_name}} — Partnership proposal",
    render: () => (
      <EmailShell preheader="A partnership proposal is ready for review.">
        <Eyebrow>Proposal</Eyebrow>
        <Heading>KOBA × {"{{organization_name}}"}</Heading>
        <InfoCard>
          Objectives: {"{{objectives}}"}
          <br />
          Proposed integration: {"{{integration_summary}}"}
          <br />
          Responsibilities: {"{{responsibilities}}"}
          <br />
          Timeline: {"{{timeline}}"}
        </InfoCard>
        <EmailButton href="{{proposal_url}}">Review Proposal</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "partner-integration-onboarding",
    department: "partner",
    label: "Integration onboarding",
    subject: "Next steps: KOBA integration onboarding",
    render: () => (
      <EmailShell preheader="Your integration onboarding details.">
        <Eyebrow>Integration onboarding</Eyebrow>
        <Heading>Let's get {"{{organization_name}}"} connected</Heading>
        <InfoCard>
          Assigned contact: {"{{assigned_contact}}"}
          <br />
          Test environment: {"{{test_environment_url}}"}
          <br />
          Outstanding tasks: {"{{outstanding_tasks}}"}
        </InfoCard>
        <EmailButton href="{{integration_guide_url}}">Open Integration Guide</EmailButton>
        <FinePrint>Credentials and API keys are issued through the secure integration portal, never by email.</FinePrint>
      </EmailShell>
    ),
  },
  {
    slug: "partner-integration-status",
    department: "partner",
    label: "Integration status update",
    subject: "KOBA Integration Update — {{integration_name}}",
    render: () => (
      <EmailShell preheader="An update on your integration status.">
        <Eyebrow>Integration status</Eyebrow>
        <Heading>{"{{integration_name}}"}</Heading>
        <InfoCard>
          Status: {"{{integration_status}}"}
          <br />
          Blockers: {"{{outstanding_blockers}}"}
          <br />
          Latest test results: {"{{test_results}}"}
        </InfoCard>
        <Body>Action needed from you: {"{{required_action}}"}.</Body>
        <EmailButton href="{{status_url}}">Review Integration Status</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "partner-renewal-review",
    department: "partner",
    label: "Partnership renewal review",
    subject: "KOBA Partnership Review — {{date}}",
    render: () => (
      <EmailShell preheader="Time to review your KOBA partnership.">
        <Eyebrow>Partnership review — {"{{date}}"}</Eyebrow>
        <Heading>Reviewing {"{{organization_name}}"}'s partnership</Heading>
        <InfoCard>
          Agreed objectives: {"{{objectives}}"}
          <br />
          Measured results: {"{{measured_results}}"}
          <br />
          Outstanding commitments: {"{{outstanding_commitments}}"}
          <br />
          Renewal decision due: {"{{renewal_date}}"}
        </InfoCard>
        <FinePrint>Contact: {"{{named_contact}}"} · partner@koba.games</FinePrint>
      </EmailShell>
    ),
  },
];

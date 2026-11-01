import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard, StatusPill } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const safetyTemplates: EmailTemplate[] = [
  {
    slug: "safety-report-received",
    department: "safety",
    label: "Report received",
    subject: "KOBA Safety — Report received {{case_id}}",
    render: () => (
      <EmailShell preheader="Your report has been received.">
        <Eyebrow>Case {"{{case_id}}"}</Eyebrow>
        <Heading>Report received</Heading>
        <Body>Your report has been received and will be reviewed. Submitting a report does not guarantee a particular outcome.</Body>
        <EmailButton href="{{case_url}}">View Case Status</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "safety-report-reviewed",
    department: "safety",
    label: "Report reviewed",
    subject: "KOBA Safety — Update on case {{case_id}}",
    render: () => (
      <EmailShell preheader="Your report has been reviewed.">
        <Eyebrow>Case {"{{case_id}}"}</Eyebrow>
        <Heading>Review complete</Heading>
        <Body>{"{{disclosable_outcome}}"}</Body>
        <FinePrint>Details about other users involved are kept confidential.</FinePrint>
        <EmailButton href="{{case_url}}">View Case Update</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "safety-moderation-action",
    department: "safety",
    label: "Moderation action issued",
    subject: "Important: A moderation action has been applied to your KOBA account",
    render: () => (
      <EmailShell preheader="A moderation action has been applied to your account.">
        <StatusPill tone="warn">Moderation action</StatusPill>
        <Heading>Action applied to your account</Heading>
        <InfoCard>
          Rule: {"{{rule_violated}}"}
          <br />
          Action: {"{{action_taken}}"}
          <br />
          Effective period: {"{{effective_period}}"}
        </InfoCard>
        <EmailButton href="{{appeal_url}}">Review Decision</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "safety-appeal-received",
    department: "safety",
    label: "Appeal received",
    subject: "KOBA Safety — Your appeal has been received",
    render: () => (
      <EmailShell preheader="Your appeal has been received.">
        <Eyebrow>Appeal {"{{appeal_id}}"}</Eyebrow>
        <Heading>Appeal received</Heading>
        <Body>Your appeal is in the review queue. We can't guarantee a specific decision date, but you'll hear from us once it's reviewed.</Body>
        <EmailButton href="{{appeal_url}}">View Appeal</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "safety-appeal-decision",
    department: "safety",
    label: "Appeal decision",
    subject: "KOBA Safety — Appeal decision {{case_id}}",
    render: () => (
      <EmailShell preheader="A decision has been made on your appeal.">
        <StatusPill tone="neutral">{"{{appeal_outcome}}"}</StatusPill>
        <Heading>Appeal decision: case {"{{case_id}}"}</Heading>
        <Body>{"{{decision_explanation}}"}</Body>
        <FinePrint>Remaining review options: {"{{remaining_options}}"}.</FinePrint>
        <EmailButton href="{{decision_url}}">View Decision</EmailButton>
      </EmailShell>
    ),
  },
];

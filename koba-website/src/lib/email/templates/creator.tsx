import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard, StatusPill } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const creatorTemplates: EmailTemplate[] = [
  {
    slug: "creator-application-received",
    department: "creator",
    label: "Application received",
    subject: "We've received your KOBA Creator application",
    render: () => (
      <EmailShell preheader="Your Creator application is in review.">
        <Eyebrow>Creator Program</Eyebrow>
        <Heading>Application received</Heading>
        <Body>Thanks for applying to the KOBA Creator Program. Your application reference is {"{{application_id}}"}. Our team reviews applications in the order received.</Body>
        <EmailButton href="{{application_url}}">View Application</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "creator-application-approved",
    department: "creator",
    label: "Application approved",
    subject: "Welcome to the KOBA Creator Program",
    render: () => (
      <EmailShell preheader="Your Creator application was approved.">
        <StatusPill tone="ok">Approved</StatusPill>
        <Heading>You're in, {"{{creator_name}}"}.</Heading>
        <Body>Your KOBA Creator Program benefits are now active: {"{{creator_benefits}}"}.</Body>
        <EmailButton href="{{creator_setup_url}}">Complete Creator Setup</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "creator-performance-report",
    department: "creator",
    label: "Performance report",
    subject: "Your KOBA Creator Performance Report — {{period}}",
    render: () => (
      <EmailShell preheader="Your Creator performance summary.">
        <Eyebrow>Performance report — {"{{period}}"}</Eyebrow>
        <Heading>Your Creator activity</Heading>
        <InfoCard>
          Verified referrals: {"{{referral_count}}"}
          <br />
          Profile engagement: {"{{engagement_summary}}"}
          <br />
          Eligible campaign performance: {"{{campaign_summary}}"}
        </InfoCard>
        <EmailButton href="{{analytics_url}}">View Creator Analytics</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "creator-collaboration-invite",
    department: "creator",
    label: "Collaboration invitation",
    subject: "KOBA Creator Collaboration — {{event_name}}",
    render: () => (
      <EmailShell preheader="You've been invited to collaborate with KOBA.">
        <Eyebrow>Collaboration invitation</Eyebrow>
        <Heading>{"{{event_name}}"}</Heading>
        <InfoCard>
          Objective: {"{{objective}}"}
          <br />
          Deliverables: {"{{deliverables}}"}
          <br />
          Timeline: {"{{timeline}}"}
          <br />
          Compensation: {"{{compensation}}"}
        </InfoCard>
        <EmailButton href="{{invitation_url}}">Review Invitation</EmailButton>
        <FinePrint>Questions go to creator@koba.games.</FinePrint>
      </EmailShell>
    ),
  },
  {
    slug: "creator-application-incomplete",
    department: "creator",
    label: "Application needs more info",
    subject: "Action needed: Your KOBA Creator application",
    render: () => (
      <EmailShell preheader="Your application needs more information.">
        <StatusPill tone="warn">Action needed</StatusPill>
        <Heading>A few things are missing</Heading>
        <Body>Before we can continue reviewing application {"{{application_id}}"}, we need: {"{{missing_details}}"}.</Body>
        <EmailButton href="{{application_url}}">Update Application</EmailButton>
      </EmailShell>
    ),
  },
];

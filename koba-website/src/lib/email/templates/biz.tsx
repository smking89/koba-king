import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard, StatusPill } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const bizTemplates: EmailTemplate[] = [
  {
    slug: "biz-inquiry-received",
    department: "biz",
    label: "Advertising inquiry received",
    subject: "KOBA Advertising — We've received your inquiry",
    render: () => (
      <EmailShell preheader="Your advertising inquiry was received.">
        <Eyebrow>Advertising</Eyebrow>
        <Heading>Inquiry received</Heading>
        <InfoCard>
          Advertiser: {"{{advertiser_name}}"}
          <br />
          Objective: {"{{campaign_objective}}"}
          <br />
          Target audience: {"{{target_audience}}"}
          <br />
          Requested timeline: {"{{requested_timeline}}"}
        </InfoCard>
        <EmailButton href="{{inquiry_url}}">View Inquiry</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "biz-proposal",
    department: "biz",
    label: "Advertising proposal",
    subject: "Your KOBA Advertising Proposal — {{campaign_name}}",
    render: () => (
      <EmailShell preheader="Your advertising proposal is ready.">
        <Eyebrow>Proposal</Eyebrow>
        <Heading>{"{{campaign_name}}"}</Heading>
        <InfoCard>
          Placements: {"{{available_placements}}"}
          <br />
          Audience options: {"{{audience_options}}"}
          <br />
          Pricing: {"{{pricing}}"}
          <br />
          Dates: {"{{campaign_dates}}"}
          <br />
          Measurement: {"{{measurement_plan}}"}
        </InfoCard>
        <EmailButton href="{{proposal_url}}">Review Proposal</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "biz-campaign-report",
    department: "biz",
    label: "Campaign performance report",
    subject: "KOBA Campaign Report — {{campaign_name}}",
    render: () => (
      <EmailShell preheader="Your campaign performance report.">
        <Eyebrow>Campaign report — {"{{reporting_period}}"}</Eyebrow>
        <Heading>{"{{campaign_name}}"}</Heading>
        <InfoCard>
          Impressions: {"{{impressions}}"}
          <br />
          Clicks: {"{{clicks}}"}
          <br />
          Click-through rate: {"{{ctr}}"}
          <br />
          Spend: {"{{spend}}"}
          <br />
          Conversions: {"{{conversions}}"}
        </InfoCard>
        <FinePrint>Figures reflect measured activity for the reporting period. Attribution limitations: {"{{attribution_notes}}"}.</FinePrint>
        <EmailButton href="{{report_url}}">View Campaign Report</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "biz-campaign-decision",
    department: "biz",
    label: "Campaign approved or rejected",
    subject: "KOBA Campaign Review — {{campaign_name}}",
    render: () => (
      <EmailShell preheader="A decision has been made on your campaign.">
        <StatusPill tone="neutral">{"{{decision_status}}"}</StatusPill>
        <Heading>{"{{campaign_name}}"}</Heading>
        <Body>{"{{decision_detail}}"}</Body>
        <EmailButton href="{{campaign_url}}">Review Campaign</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "biz-campaign-live",
    department: "biz",
    label: "Campaign launch confirmation",
    subject: "Your KOBA Campaign Is Live — {{campaign_name}}",
    render: () => (
      <EmailShell preheader="Your campaign is now live.">
        <StatusPill tone="ok">Live</StatusPill>
        <Heading>{"{{campaign_name}}"} is serving</Heading>
        <InfoCard>
          Start date: {"{{start_date}}"}
          <br />
          End date: {"{{end_date}}"}
        </InfoCard>
        <EmailButton href="{{dashboard_url}}">Open Campaign Dashboard</EmailButton>
      </EmailShell>
    ),
  },
];

import { Body, EmailButton, EmailShell, Eyebrow, FinePrint, Heading, InfoCard, StatusPill } from "@/lib/email/shell";
import type { EmailTemplate } from "@/lib/email/registry-types";

export const supportTemplates: EmailTemplate[] = [
  {
    slug: "support-welcome",
    department: "support",
    label: "Welcome to KOBA",
    subject: "Welcome to KOBA — Your journey starts here",
    render: () => (
      <EmailShell preheader="Your profile, rivals, and first challenge are ready.">
        <Eyebrow>Your competitive world</Eyebrow>
        <Heading>Welcome to KOBA, {"{{player_name}}"}.</Heading>
        <Body>Your KOBAid is set up. From here you can build your profile, track your KOBA Score, find rivals, and send your first challenge.</Body>
        <EmailButton href="https://koba.games">Explore KOBA</EmailButton>
        <Body>If anything looks off, reply to this email or reach support@koba.games.</Body>
      </EmailShell>
    ),
  },
  {
    slug: "support-verify-email",
    department: "support",
    label: "Verify your email",
    subject: "Verify your email address for KOBA",
    render: () => (
      <EmailShell preheader="Confirm this is your email address.">
        <Eyebrow>Account</Eyebrow>
        <Heading>Verify your email address</Heading>
        <Body>Confirm {"{{player_email}}"} belongs to you so KOBA can secure your account and send important notices to the right inbox.</Body>
        <EmailButton href="{{verify_url}}">Verify Email</EmailButton>
        <FinePrint>This link expires in {"{{expiry_window}}"}. If you didn't create a KOBA account, you can ignore this email.</FinePrint>
      </EmailShell>
    ),
  },
  {
    slug: "support-password-reset",
    department: "support",
    label: "Password reset",
    subject: "Reset your KOBA password",
    render: () => (
      <EmailShell preheader="A password reset was requested for your account.">
        <Eyebrow>Security</Eyebrow>
        <Heading>Reset your password</Heading>
        <Body>A password reset was requested for {"{{player_email}}"}. Use the link below to set a new password.</Body>
        <EmailButton href="{{reset_url}}">Reset Password</EmailButton>
        <FinePrint>This link expires in {"{{expiry_window}}"}. If you didn't request this, your password is still safe — no action is needed, but consider reviewing your account security.</FinePrint>
      </EmailShell>
    ),
  },
  {
    slug: "support-ticket-update",
    department: "support",
    label: "Support ticket updates",
    subject: "KOBA Support — Update on ticket #{{ticket_id}}",
    render: () => (
      <EmailShell preheader="There's an update on your support ticket.">
        <Eyebrow>Support ticket #{"{{ticket_id}}"}</Eyebrow>
        <StatusPill tone="neutral">{"{{ticket_status}}"}</StatusPill>
        <Heading>An update on your ticket</Heading>
        <InfoCard>{"{{latest_response}}"}</InfoCard>
        <Body>{"{{next_step_description}}"}</Body>
        <EmailButton href="{{ticket_url}}">View Support Ticket</EmailButton>
      </EmailShell>
    ),
  },
  {
    slug: "support-login-alert",
    department: "support",
    label: "New login alert",
    subject: "Security alert: New sign-in to your KOBA account",
    render: () => (
      <EmailShell preheader="A new sign-in to your account was detected.">
        <Eyebrow>Security alert</Eyebrow>
        <Heading>New sign-in detected</Heading>
        <InfoCard>
          Time: {"{{signin_time}}"}
          <br />
          Device: {"{{signin_device}}"}
          <br />
          Location: {"{{signin_location}}"}
        </InfoCard>
        <Body>If this was you, no action is needed. If you don't recognize this sign-in, secure your account now.</Body>
        <EmailButton href="{{security_url}}">Review Account Security</EmailButton>
      </EmailShell>
    ),
  },
];

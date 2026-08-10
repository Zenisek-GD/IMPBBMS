import nodemailer from "nodemailer";
import { mailConfig } from "../config/mail.js";

// ── Transport ────────────────────────────────────────────────────────────────
//
// One transport for the process, built lazily so importing this module never
// opens a socket (the seed scripts import controllers that import this file).
//
// TLS is not optional. On port 587 the connection starts in the clear and is
// upgraded by STARTTLS, so `requireTLS` is set: nodemailer will abort rather than
// deliver a message containing an activation link or a one-time code over a
// plaintext session if the server declines to upgrade. On port 465 the socket is
// TLS from the first byte and `secure: true` covers it.
//
// `rejectUnauthorized` is left at its default of true. Accepting an unverifiable
// certificate would mean any machine on the path could present itself as Gmail
// and collect every code the system sends.
let transport = null;

const getTransport = () => {
  if (!mailConfig.enabled) return null;
  if (transport) return transport;

  transport = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    requireTLS: !mailConfig.secure,
    auth: { user: mailConfig.user, pass: mailConfig.password },
    tls: { minVersion: "TLSv1.2" },
  });

  return transport;
};

/** Confirms the SMTP credentials and TLS handshake without sending anything. */
export const verifyMailTransport = async () => {
  const smtp = getTransport();
  if (!smtp) {
    return { ok: false, configured: false, message: "No SMTP host configured." };
  }
  try {
    await smtp.verify();
    return {
      ok: true,
      configured: true,
      message: `SMTP ready: ${mailConfig.user} via ${mailConfig.host}:${mailConfig.port}` +
        `${mailConfig.secure ? " (implicit TLS)" : " (STARTTLS)"}`,
    };
  } catch (err) {
    return { ok: false, configured: true, message: err.message };
  }
};

const from = () => `"${mailConfig.fromName}" <${mailConfig.fromAddress}>`;

// Console fallback for local work without credentials. Deliberately prints the
// full body: this mode exists so a developer can follow the flow, and it only
// ever runs when nothing is configured to send.
const printToConsole = ({ to, subject, text }) => {
  console.log(`\n┌─ mail (not sent — no SMTP configured) ${"─".repeat(28)}`);
  console.log(`│ To:      ${to}`);
  console.log(`│ Subject: ${subject}`);
  console.log("├" + "─".repeat(66));
  for (const line of text.split("\n")) console.log(`│ ${line}`);
  console.log("└" + "─".repeat(66) + "\n");
  return { transport: "console", messageId: null };
};

// Every send funnels through here so failures are reported the same way and a
// missing transport degrades predictably rather than throwing from a controller.
const deliver = async ({ to, subject, text, html }) => {
  const smtp = getTransport();
  if (!smtp) return printToConsole({ to, subject, text });

  try {
    const info = await smtp.sendMail({ from: from(), to, subject, text, html });
    console.log(`[mail] sent "${subject}" to ${to} (${info.messageId})`);
    return { transport: "smtp", messageId: info.messageId, accepted: info.accepted ?? [] };
  } catch (err) {
    // Reported, not thrown. A controller that has already created an account must
    // not fail the whole request because the mail server hiccuped — the officer
    // needs to see the account exist and be told the invitation did not go out,
    // so they can resend it.
    console.error(`[mail] FAILED "${subject}" to ${to}: ${err.message}`);
    return { transport: "smtp", error: err.message, messageId: null };
  }
};

// ── Shared chrome ────────────────────────────────────────────────────────────
// Inline styles only: mail clients strip <style> blocks and ignore external
// stylesheets. Tables rather than flexbox, for the same reason.

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const layout = ({ heading, bodyHtml, footerNote }) => `
<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="padding:18px 28px;background:#0f2740;">
        <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:-0.01em;">Procurenance</span>
        <span style="color:#93a7bd;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;padding-left:10px;">Municipal Procurement</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 14px;font-size:19px;line-height:1.3;font-weight:600;color:#0f2740;">${escapeHtml(heading)}</h1>
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#64748b;">
          ${footerNote}
        </p>
      </td>
    </tr>
  </table>
</div>`;

const paragraph = (text) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`;

const AUTOMATED_FOOTER =
  "This message was sent automatically by the Procurenance procurement system. " +
  "Please do not reply to it. If you were not expecting this message, contact the BAC Secretariat.";

// ─────────────────────────────────────────────────────────────────────────────
// Workflow requirement 3: the invitation an approved bidder receives once an
// authorized official creates their account.
// ─────────────────────────────────────────────────────────────────────────────
export const sendActivationInvitation = async ({
  to,
  businessName,
  contactName,
  activationUrl,
  expiresInHours,
  invitedBy,
}) => {
  const subject = "Activate your Procurenance bidder account";

  const text = [
    `Good day${contactName ? `, ${contactName}` : ""},`,
    "",
    `Your bidder registration for ${businessName} has been reviewed and approved, and an`,
    "account has been created for you in the Procurenance municipal procurement system.",
    "",
    "To activate it, open the link below and set your own password:",
    "",
    activationUrl,
    "",
    `This link can be used once and expires in ${expiresInHours} hours.`,
    "",
    "After you set your password we will email you a 6-digit verification code to",
    "confirm this address. Entering that code completes the activation.",
    "",
    invitedBy ? `Account created by: ${invitedBy}` : "",
    "",
    "If you did not submit a bidder registration, please ignore this message and",
    "notify the BAC Secretariat.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = layout({
    heading: "Activate your bidder account",
    bodyHtml: [
      paragraph(`Good day${contactName ? `, ${escapeHtml(contactName)}` : ""},`),
      paragraph(
        `Your bidder registration for <strong>${escapeHtml(businessName)}</strong> has been reviewed and approved. ` +
          "An account has been created for you in the Procurenance municipal procurement system."
      ),
      paragraph("Open the link below to set your own password and activate the account."),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 20px;">
         <tr><td style="border-radius:6px;background:#0f2740;">
           <a href="${escapeHtml(activationUrl)}" style="display:inline-block;padding:11px 22px;font-size:13px;font-weight:600;letter-spacing:0.02em;color:#ffffff;text-decoration:none;">ACTIVATE MY ACCOUNT</a>
         </td></tr>
       </table>`,
      `<p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#64748b;">
         If the button does not work, copy this address into your browser:<br>
         <span style="word-break:break-all;color:#0f2740;">${escapeHtml(activationUrl)}</span>
       </p>`,
      `<div style="margin:18px 0;padding:12px 14px;background:#fffbeb;border-left:3px solid #d97706;">
         <p style="margin:0;font-size:12.5px;line-height:1.6;color:#78350f;">
           This link works <strong>once</strong> and expires in <strong>${expiresInHours} hours</strong>.
           After you set a password we will email a 6-digit code to this address to confirm it is yours.
         </p>
       </div>`,
      invitedBy
        ? `<p style="margin:0;font-size:12px;color:#64748b;">Account created by ${escapeHtml(invitedBy)}.</p>`
        : "",
    ].join(""),
    footerNote:
      "If you did not submit a bidder registration to this LGU, ignore this message and notify the BAC Secretariat. " +
      AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

// ─────────────────────────────────────────────────────────────────────────────
// The one-time code, used by activation, password reset, password change, and
// step-up confirmation of sensitive actions.
// ─────────────────────────────────────────────────────────────────────────────
const OTP_INTROS = {
  accountActivation: "to finish activating your bidder account",
  passwordReset: "to reset the password on your account",
  passwordChange: "to confirm the change to your password",
  profileUpdate: "to confirm the changes to your profile",
  bidSubmission: "to confirm your bid submission",
};

export const sendOtpEmail = async ({ to, name, code, purpose, purposeLabel, expiresInMinutes }) => {
  const reason = OTP_INTROS[purpose] ?? `to confirm your ${purposeLabel}`;
  const subject = `Your Procurenance verification code: ${code}`;

  const text = [
    `Good day${name ? `, ${name}` : ""},`,
    "",
    `Use this code ${reason}:`,
    "",
    `    ${code}`,
    "",
    `The code expires in ${expiresInMinutes} minutes and can be used once.`,
    "",
    "Nobody from the LGU or the BAC will ever ask you for this code. If you did not",
    `request a ${purposeLabel}, do not enter it — and tell the BAC Secretariat, because`,
    "someone else may know your password.",
  ].join("\n");

  const html = layout({
    heading: "Your verification code",
    bodyHtml: [
      paragraph(`Good day${name ? `, ${escapeHtml(name)}` : ""},`),
      paragraph(`Enter this code ${escapeHtml(reason)}:`),
      `<div style="margin:18px 0;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
         <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:31px;font-weight:600;letter-spacing:0.28em;color:#0f2740;">${escapeHtml(code)}</span>
       </div>`,
      paragraph(
        `The code expires in <strong>${expiresInMinutes} minutes</strong> and can be used once.`
      ),
      `<div style="margin:18px 0 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #dc2626;">
         <p style="margin:0;font-size:12.5px;line-height:1.6;color:#7f1d1d;">
           Nobody from the LGU or the Bids and Awards Committee will ever ask you for this code.
           If you did not request a ${escapeHtml(purposeLabel)}, do not enter it — and tell the BAC
           Secretariat, because someone else may know your password.
         </p>
       </div>`,
    ].join(""),
    footerNote: AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

// ─────────────────────────────────────────────────────────────────────────────
// Confirmations. These carry no link and no code — they exist so that a change
// made by someone other than the account holder does not go unnoticed.
// ─────────────────────────────────────────────────────────────────────────────
export const sendActivationCompleteEmail = async ({ to, name, businessName }) => {
  const subject = "Your Procurenance bidder account is now active";

  const text = [
    `Good day${name ? `, ${name}` : ""},`,
    "",
    `The bidder account for ${businessName} is now active. You can sign in with this`,
    "email address and the password you just set.",
    "",
    "Keep this address current — it is the official channel for invitations to bid,",
    "notices of award, and every other procurement communication from this LGU.",
  ].join("\n");

  const html = layout({
    heading: "Your account is active",
    bodyHtml: [
      paragraph(`Good day${name ? `, ${escapeHtml(name)}` : ""},`),
      paragraph(
        `The bidder account for <strong>${escapeHtml(businessName)}</strong> is now active. ` +
          "You can sign in with this email address and the password you just set."
      ),
      paragraph(
        "Keep this address current — it is the official channel for invitations to bid, " +
          "notices of award, and every other procurement communication from this LGU."
      ),
    ].join(""),
    footerNote: AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

export const sendPasswordChangedEmail = async ({ to, name, at, ipAddress, wasReset }) => {
  const what = wasReset ? "reset" : "changed";
  const subject = `Your Procurenance password was ${what}`;

  const when = new Date(at).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });

  const text = [
    `Good day${name ? `, ${name}` : ""},`,
    "",
    `The password on your Procurenance account was ${what} on ${when}`,
    ipAddress ? `from IP address ${ipAddress}.` : ".",
    "",
    "If this was you, nothing further is needed.",
    "",
    "If it was not, contact the BAC Secretariat immediately — someone else has access",
    "to this mailbox or to your account.",
  ].join("\n");

  const html = layout({
    heading: `Your password was ${what}`,
    bodyHtml: [
      paragraph(`Good day${name ? `, ${escapeHtml(name)}` : ""},`),
      paragraph(
        `The password on your Procurenance account was ${what} on <strong>${escapeHtml(when)}</strong>` +
          (ipAddress ? ` from IP address <strong>${escapeHtml(ipAddress)}</strong>.` : ".")
      ),
      paragraph("If this was you, nothing further is needed."),
      `<div style="margin:18px 0 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #dc2626;">
         <p style="margin:0;font-size:12.5px;line-height:1.6;color:#7f1d1d;">
           If it was not you, contact the BAC Secretariat immediately — someone else has
           access to this mailbox or to your account.
         </p>
       </div>`,
    ].join(""),
    footerNote: AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

// ─────────────────────────────────────────────────────────────────────────────
// Acknowledges an unauthenticated requirements submission, and in doing so
// proves the address is live before an officer ever looks at the papers.
// ─────────────────────────────────────────────────────────────────────────────
export const sendIntakeAcknowledgementEmail = async ({
  to,
  businessName,
  contactName,
  referenceCode,
}) => {
  const subject = `Bidder requirements received — ${referenceCode}`;

  const text = [
    `Good day${contactName ? `, ${contactName}` : ""},`,
    "",
    `We have received the eligibility and accreditation requirements submitted for`,
    `${businessName}.`,
    "",
    `Reference: ${referenceCode}`,
    "",
    "The BAC Secretariat will review your submission. No account exists yet — this",
    "system has no public sign-up. If your registration is approved, an authorized",
    "official will create your account and send an activation link to this address.",
    "",
    "Because every future procurement notice will be sent here, make sure this",
    "mailbox stays active and monitored.",
  ].join("\n");

  const html = layout({
    heading: "We have your requirements",
    bodyHtml: [
      paragraph(`Good day${contactName ? `, ${escapeHtml(contactName)}` : ""},`),
      paragraph(
        "We have received the eligibility and accreditation requirements submitted for " +
          `<strong>${escapeHtml(businessName)}</strong>.`
      ),
      `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
         <p style="margin:0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Reference</p>
         <p style="margin:4px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;color:#0f2740;">${escapeHtml(referenceCode)}</p>
       </div>`,
      paragraph(
        "The BAC Secretariat will review your submission. <strong>No account exists yet</strong> — " +
          "this system has no public sign-up. If your registration is approved, an authorized " +
          "official will create your account and send an activation link to this address."
      ),
      paragraph(
        "Because every future procurement notice will be sent here, make sure this mailbox " +
          "stays active and monitored."
      ),
    ].join(""),
    footerNote: AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

// Kept so the old password-reset link flow keeps compiling if anything still
// imports it. The live reset path is now code-based — see
// controllers/passwordResetController.js.
export const sendPasswordResetEmail = async ({ to, resetUrl, expiresInMinutes }) =>
  deliver({
    to,
    subject: "Reset your Procurenance password",
    text: `Open this link to reset your password (valid ${expiresInMinutes} minutes):\n\n${resetUrl}\n`,
    html: layout({
      heading: "Reset your password",
      bodyHtml: [
        paragraph(`Open the link below to set a new password. It is valid for ${expiresInMinutes} minutes.`),
        paragraph(`<a href="${escapeHtml(resetUrl)}" style="color:#0f2740;">${escapeHtml(resetUrl)}</a>`),
      ].join(""),
      footerNote: AUTOMATED_FOOTER,
    }),
  });

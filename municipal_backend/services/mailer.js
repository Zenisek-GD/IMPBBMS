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
        <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:-0.01em;">ProcureNance</span>
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

// Official correspondence register: addressed by name where the record supplies
// one, and "Sir/Madam" where it does not. Never a bare greeting — these messages
// are notices from a procuring entity, not notifications from an app.
const salutation = (name) => (name ? `Dear ${name},` : "Dear Sir/Madam,");

const AUTOMATED_FOOTER =
  "This is a system-generated message from the ProcureNance Municipal Procurement System. " +
  "Please do not reply to this address. Should you have received this message in error, " +
  "kindly notify the Bids and Awards Committee Secretariat.";

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
  const subject = "Activation of your ProcureNance bidder account";

  const text = [
    salutation(contactName),
    "",
    `This is to inform you that the bidder registration submitted on behalf of ${businessName}`,
    "has been reviewed and approved. Accordingly, an account has been created for you in the",
    "ProcureNance Municipal Procurement System.",
    "",
    "To activate the account, please access the link below and set your own password:",
    "",
    activationUrl,
    "",
    `The link may be used only once and shall expire ${expiresInHours} hours from issuance.`,
    "",
    "Once your password has been set, a six-digit verification code will be sent to this",
    "address for confirmation. Entry of that code completes the activation.",
    "",
    invitedBy ? `Account created by: ${invitedBy}` : "",
    "",
    "Should you not have submitted a bidder registration, kindly disregard this message and",
    "notify the Bids and Awards Committee Secretariat.",
    "",
    "Respectfully,",
    "Bids and Awards Committee Secretariat",
  ].join("\n");

  const html = layout({
    heading: "Activation of your bidder account",
    bodyHtml: [
      paragraph(salutation(contactName ? escapeHtml(contactName) : null)),
      paragraph(
        "This is to inform you that the bidder registration submitted on behalf of " +
          `<strong>${escapeHtml(businessName)}</strong> has been reviewed and approved. ` +
          "Accordingly, an account has been created for you in the ProcureNance Municipal " +
          "Procurement System."
      ),
      paragraph(
        "To activate the account, please access the link below and set your own password."
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 20px;">
         <tr><td style="border-radius:6px;background:#0f2740;">
           <a href="${escapeHtml(activationUrl)}" style="display:inline-block;padding:11px 22px;font-size:13px;font-weight:600;letter-spacing:0.02em;color:#ffffff;text-decoration:none;">ACTIVATE MY ACCOUNT</a>
         </td></tr>
       </table>`,
      `<p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#64748b;">
         Should the button above not function, kindly copy the following address into your browser:<br>
         <span style="word-break:break-all;color:#0f2740;">${escapeHtml(activationUrl)}</span>
       </p>`,
      `<div style="margin:18px 0;padding:12px 14px;background:#fffbeb;border-left:3px solid #d97706;">
         <p style="margin:0;font-size:12.5px;line-height:1.6;color:#78350f;">
           This link may be used <strong>only once</strong> and shall expire
           <strong>${expiresInHours} hours</strong> from issuance. Once your password has been set,
           a six-digit verification code will be sent to this address for confirmation.
         </p>
       </div>`,
      invitedBy
        ? `<p style="margin:0 0 12px;font-size:12px;color:#64748b;">Account created by ${escapeHtml(invitedBy)}.</p>`
        : "",
      `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#334155;">
         Respectfully,<br><strong>Bids and Awards Committee Secretariat</strong>
       </p>`,
    ].join(""),
    footerNote:
      "Should you not have submitted a bidder registration to this Local Government Unit, kindly " +
      "disregard this message and notify the Bids and Awards Committee Secretariat. " +
      AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

// ─────────────────────────────────────────────────────────────────────────────
// The one-time code, used by activation, password reset, password change, and
// step-up confirmation of sensitive actions.
// ─────────────────────────────────────────────────────────────────────────────
const OTP_INTROS = {
  accountActivation: "to complete the activation of your bidder account",
  passwordReset: "to reset the password on your account",
  passwordChange: "to confirm the change to your password",
  profileUpdate: "to confirm the changes to your profile",
  bidSubmission: "to confirm the submission of your bid",
};

export const sendOtpEmail = async ({ to, name, code, purpose, purposeLabel, expiresInMinutes }) => {
  const reason = OTP_INTROS[purpose] ?? `to confirm your ${purposeLabel}`;
  const subject = `ProcureNance verification code: ${code}`;

  const text = [
    salutation(name),
    "",
    `Please enter the verification code indicated below ${reason}:`,
    "",
    `    ${code}`,
    "",
    `The code shall expire in ${expiresInMinutes} minutes and may be used only once.`,
    "",
    "No representative of the Local Government Unit or of the Bids and Awards Committee",
    `will request this code from you. If you did not request a ${purposeLabel}, kindly do`,
    "not enter the code and notify the Bids and Awards Committee Secretariat immediately,",
    "as your account credentials may have been compromised.",
    "",
    "Respectfully,",
    "Bids and Awards Committee Secretariat",
  ].join("\n");

  const html = layout({
    heading: "Verification code",
    bodyHtml: [
      paragraph(salutation(name ? escapeHtml(name) : null)),
      paragraph(`Please enter the verification code indicated below ${escapeHtml(reason)}:`),
      `<div style="margin:18px 0;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
         <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:31px;font-weight:600;letter-spacing:0.28em;color:#0f2740;">${escapeHtml(code)}</span>
       </div>`,
      paragraph(
        `The code shall expire in <strong>${expiresInMinutes} minutes</strong> and may be used only once.`
      ),
      `<div style="margin:18px 0 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #dc2626;">
         <p style="margin:0;font-size:12.5px;line-height:1.6;color:#7f1d1d;">
           No representative of the Local Government Unit or of the Bids and Awards Committee will
           request this code from you. If you did not request a ${escapeHtml(purposeLabel)}, kindly
           do not enter the code and notify the BAC Secretariat immediately, as your account
           credentials may have been compromised.
         </p>
       </div>`,
      `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#334155;">
         Respectfully,<br><strong>Bids and Awards Committee Secretariat</strong>
       </p>`,
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
  const subject = "Confirmation of activation of your ProcureNance bidder account";

  const text = [
    salutation(name),
    "",
    `This is to confirm that the bidder account for ${businessName} is now active. You may`,
    "sign in using this email address and the password you have set.",
    "",
    "Kindly ensure that this address remains active and regularly monitored, as it serves",
    "as the official channel for invitations to bid, notices of award, and all other",
    "procurement communications from this Local Government Unit.",
    "",
    "Respectfully,",
    "Bids and Awards Committee Secretariat",
  ].join("\n");

  const html = layout({
    heading: "Confirmation of account activation",
    bodyHtml: [
      paragraph(salutation(name ? escapeHtml(name) : null)),
      paragraph(
        `This is to confirm that the bidder account for <strong>${escapeHtml(businessName)}</strong> ` +
          "is now active. You may sign in using this email address and the password you have set."
      ),
      paragraph(
        "Kindly ensure that this address remains active and regularly monitored, as it serves as " +
          "the official channel for invitations to bid, notices of award, and all other procurement " +
          "communications from this Local Government Unit."
      ),
      `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#334155;">
         Respectfully,<br><strong>Bids and Awards Committee Secretariat</strong>
       </p>`,
    ].join(""),
    footerNote: AUTOMATED_FOOTER,
  });

  return deliver({ to, subject, text, html });
};

export const sendPasswordChangedEmail = async ({ to, name, at, ipAddress, wasReset }) => {
  const what = wasReset ? "reset" : "changed";
  const subject = `Your ProcureNance password was ${what}`;

  const when = new Date(at).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });

  const text = [
    salutation(name),
    "",
    `This is to notify you that the password on your ProcureNance account was ${what} on`,
    `${when}${ipAddress ? `, from IP address ${ipAddress}` : ""}.`,
    "",
    "If you authorized this change, no further action is required on your part.",
    "",
    "If you did not authorize it, kindly contact the Bids and Awards Committee Secretariat",
    "immediately, as this may indicate unauthorized access to this mailbox or to your account.",
    "",
    "Respectfully,",
    "Bids and Awards Committee Secretariat",
  ].join("\n");

  const html = layout({
    heading: `Notice: your password was ${what}`,
    bodyHtml: [
      paragraph(salutation(name ? escapeHtml(name) : null)),
      paragraph(
        `This is to notify you that the password on your ProcureNance account was ${what} on ` +
          `<strong>${escapeHtml(when)}</strong>` +
          (ipAddress ? `, from IP address <strong>${escapeHtml(ipAddress)}</strong>.` : ".")
      ),
      paragraph("If you authorized this change, no further action is required on your part."),
      `<div style="margin:18px 0 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #dc2626;">
         <p style="margin:0;font-size:12.5px;line-height:1.6;color:#7f1d1d;">
           If you did not authorize it, kindly contact the BAC Secretariat immediately, as this
           may indicate unauthorized access to this mailbox or to your account.
         </p>
       </div>`,
      `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#334155;">
         Respectfully,<br><strong>Bids and Awards Committee Secretariat</strong>
       </p>`,
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
  const subject = `Acknowledgement of bidder requirements — ${referenceCode}`;

  const text = [
    salutation(contactName),
    "",
    "This is to acknowledge receipt of the eligibility and accreditation requirements",
    `submitted on behalf of ${businessName}.`,
    "",
    `Reference: ${referenceCode}`,
    "",
    "The Bids and Awards Committee Secretariat shall review the submission. Please note",
    "that no account has yet been created, as this system does not provide for public",
    "registration. Should the registration be approved, an authorized official shall",
    "create your account and transmit an activation link to this address.",
    "",
    "As all subsequent procurement notices shall be sent to this address, kindly ensure",
    "that the mailbox remains active and regularly monitored.",
    "",
    "Respectfully,",
    "Bids and Awards Committee Secretariat",
  ].join("\n");

  const html = layout({
    heading: "Acknowledgement of receipt",
    bodyHtml: [
      paragraph(salutation(contactName ? escapeHtml(contactName) : null)),
      paragraph(
        "This is to acknowledge receipt of the eligibility and accreditation requirements " +
          `submitted on behalf of <strong>${escapeHtml(businessName)}</strong>.`
      ),
      `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
         <p style="margin:0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Reference</p>
         <p style="margin:4px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;color:#0f2740;">${escapeHtml(referenceCode)}</p>
       </div>`,
      paragraph(
        "The Bids and Awards Committee Secretariat shall review the submission. Please note that " +
          "<strong>no account has yet been created</strong>, as this system does not provide for " +
          "public registration. Should the registration be approved, an authorized official shall " +
          "create your account and transmit an activation link to this address."
      ),
      paragraph(
        "As all subsequent procurement notices shall be sent to this address, kindly ensure that " +
          "the mailbox remains active and regularly monitored."
      ),
      `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#334155;">
         Respectfully,<br><strong>Bids and Awards Committee Secretariat</strong>
       </p>`,
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
    subject: "Reset of your ProcureNance password",
    text:
      `Please access the link below to reset your password. It shall remain valid for ` +
      `${expiresInMinutes} minutes.\n\n${resetUrl}\n`,
    html: layout({
      heading: "Reset of your password",
      bodyHtml: [
        paragraph(
          "Please access the link below to set a new password. It shall remain valid for " +
            `${expiresInMinutes} minutes.`
        ),
        paragraph(`<a href="${escapeHtml(resetUrl)}" style="color:#0f2740;">${escapeHtml(resetUrl)}</a>`),
      ].join(""),
      footerNote: AUTOMATED_FOOTER,
    }),
  });

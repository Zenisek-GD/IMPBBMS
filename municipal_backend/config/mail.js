// Outbound-mail configuration, resolved once at start-up.
//
// Email is not a convenience in this system — it is the only channel by which a
// bidder can be invited, verified, or recover an account, so its configuration
// is validated loudly rather than discovered when an invitation silently fails.

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const host = process.env.SMTP_HOST?.trim() ?? "";
const user = process.env.SMTP_USER?.trim() ?? "";
const password = process.env.SMTP_PASSWORD?.trim() ?? "";

// Port 465 is implicit TLS ("SMTPS"); 587 is plaintext-on-connect and then
// upgraded by STARTTLS. `secure` selects between the two — it is NOT a switch
// between encrypted and unencrypted. With secure:false we additionally set
// requireTLS below, which makes nodemailer *refuse* to send if the server will
// not upgrade, rather than quietly falling back to cleartext.
const port = asNumber(process.env.SMTP_PORT, 587);
const secure = process.env.SMTP_SECURE === "true" || port === 465;

export const mailConfig = {
  host,
  port,
  secure,
  user,
  password,
  fromName: process.env.MAIL_FROM_NAME?.trim() || "CivicBid Procurement",
  fromAddress: process.env.MAIL_FROM_ADDRESS?.trim() || user,

  // With no host configured the mailer prints messages to the console instead of
  // sending them. That is a legitimate local mode — you can walk the entire
  // activation flow without credentials — but it must never be mistaken for
  // working mail, so the mailer says which mode it is in on every send.
  enabled: Boolean(host && user && password),
};

// The link a bidder actually clicks. It points at the React app, not the API,
// because the activation form is a page — the API only validates the token.
export const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim() || "http://localhost:5173";

// Workflow requirement 4: the activation link expires in 24–48 hours. Clamped
// rather than trusted, so a stray value in .env cannot produce a link that
// never expires.
const ACTIVATION_MIN_HOURS = 24;
const ACTIVATION_MAX_HOURS = 48;
export const activationTtlHours = Math.min(
  ACTIVATION_MAX_HOURS,
  Math.max(ACTIVATION_MIN_HOURS, asNumber(process.env.ACTIVATION_TOKEN_TTL_HOURS, 48))
);

// Security requirement: OTPs have a limited validity period, 5 minutes by
// default. Clamped to a sane band for the same reason as above — a 24-hour
// "one-time code" would defeat the point of having one.
export const otpTtlMinutes = Math.min(15, Math.max(1, asNumber(process.env.OTP_TTL_MINUTES, 5)));

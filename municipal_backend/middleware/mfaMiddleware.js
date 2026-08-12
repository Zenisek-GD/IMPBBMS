// ── ENFORCING THE SECOND FACTOR ──────────────────────────────────────────────
// Two jobs, both about closing gaps that would otherwise make the feature
// decorative:
//
//   1. A session that is only *pending* a second factor must not reach anything.
//      That is already true by construction — the pending state sets no
//      `userId`, so `loadCurrentUser` returns null and every permission check
//      401s — but it is asserted here too, because relying on the absence of a
//      field is the kind of protection a later refactor removes by accident.
//
//   2. An account that has not enrolled yet is confined to the enrolment
//      screens. Refusing the sign-in outright would have locked out every
//      existing account the day this shipped, including the administrator who
//      would have had to fix it, so instead the session exists but can do
//      nothing else until a second factor is set up.

// Paths a not-yet-enrolled user must still reach, or they could never finish.
// Matched by prefix against the full path, so `/api/auth/mfa/enroll/confirm`
// is covered by `/api/auth/mfa`.
const ALWAYS_ALLOWED = [
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/mfa",
  // The branding and public surfaces are unauthenticated anyway; listing them
  // keeps the middleware from interfering with a page that renders before the
  // enrolment screen appears.
  "/api/public",
  "/api/notifications",
];

const isAllowed = (path) => ALWAYS_ALLOWED.some((prefix) => path.startsWith(prefix));

export const requireMfaEnrollment = (req, res, next) => {
  // Not signed in at all, or already enrolled — nothing to do here. The
  // permission middleware handles the first case.
  if (!req.session?.userId) return next();
  if (!req.session.mfaEnrollmentRequired) return next();
  if (isAllowed(req.path)) return next();

  // A distinct code so the client can route to the enrolment screen rather than
  // treating this as a generic permission failure and showing "access denied"
  // to someone who simply has not set up their phone yet.
  return res.status(403).json({
    message:
      "Set up two-factor authentication before using the system. Every account here can approve spending or read the full procurement record, so a password alone is not enough.",
    code: "MFA_ENROLLMENT_REQUIRED",
  });
};

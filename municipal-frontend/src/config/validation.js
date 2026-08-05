import { z } from 'zod'

// Mirrors validatePassword() in
// municipal_backend/controllers/passwordResetController.js. The server copy is
// the one that actually enforces this; keep the two in step.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(200, 'Password must be 200 characters or fewer.')
  .refine((value) => /[A-Za-z]/.test(value), 'Password must contain at least one letter.')
  .refine((value) => /[0-9]/.test(value), 'Password must contain at least one number.')

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')

// Login deliberately does NOT apply passwordSchema — an account created before
// the rule existed must still be able to sign in and then reset.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

// Used by the reset, activation and admin-invitation flows — anywhere a user
// chooses a password for the first time or replaces one.
export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

// Kept under its previous name so nothing that imported it breaks.
export const resetPasswordSchema = newPasswordSchema

// The account setup form a bidder sees after opening their activation link.
// Display name is optional (workflow requirement 5) — blank keeps whatever the
// official entered when they created the account.
export const activationSetupSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(190, 'That display name is too long.')
      .optional()
      .or(z.literal('')),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

// ── Counter submission ───────────────────────────────────────────────────────
// What the BAC Secretariat keys in after receiving a bidder's accreditation
// papers in person. Mirrors recordCounterSubmission in
// municipal_backend/controllers/vendorController.js.
//
// The email field is the strictest thing on this form on purpose: it becomes the
// bidder's only channel for the invitation, the verification code, every
// procurement notice and all password recovery. A typo here is not something the
// bidder can come back and fix — no account exists yet to log in and correct it,
// and they are not sitting at the keyboard — so it is confirmed twice. That
// double entry matters more here than it did on the old self-service form: the
// person typing the address is not the person who owns it.
export const counterSubmissionSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(1, 'Registered business name is required')
      .max(200, 'That name is too long'),
    tin: z.string().trim().max(40, 'That TIN is too long').optional().or(z.literal('')),
    organizationType: z.enum(['corporation', 'partnership', 'soleProprietorship', 'cooperative']),
    category: z.enum(['goods', 'infrastructure', 'consulting']),
    isJointVenture: z.boolean(),
    isForeignBidder: z.boolean(),
    isVatRegistered: z.boolean(),
    taxClassification: z.enum(['goods', 'services']),
    philgepsRegistrationNo: z
      .string()
      .trim()
      .min(1, 'PhilGEPS registration number is required (IRR Sec. 52.1)')
      .max(60, 'That registration number is too long'),
    philgepsExpiry: z.string().min(1, 'PhilGEPS expiry date is required'),
    contactPerson: z
      .string()
      .trim()
      .min(1, 'An authorized contact person is required')
      .max(190, 'That name is too long'),
    contactEmail: emailSchema,
    confirmEmail: z.string().trim().min(1, 'Please re-type the email address'),
    contactPhone: z.string().trim().max(40, 'That number is too long').optional().or(z.literal('')),
    address: z.string().trim().max(255, 'That address is too long').optional().or(z.literal('')),
    // When the papers were handed over, which is what an announcement's
    // registration deadline is judged against — not when this form is filled in.
    receivedAt: z.string().min(1, 'Record the date the documents were received'),

    // The officer's attestation, replacing the applicant's self-declaration that
    // used to sit here. The bidder is not present to declare anything; the
    // accountable statement is the receiving officer's.
    receiptConfirmed: z.literal(true, {
      errorMap: () => ({ message: 'Confirm that you received these documents' }),
    }),
    announcementId: z.string().optional().or(z.literal('')),
  })
  .refine((data) => data.contactEmail.toLowerCase() === data.confirmEmail.toLowerCase(), {
    message: 'The email addresses do not match.',
    path: ['confirmEmail'],
  })
  .refine((data) => !data.receivedAt || new Date(data.receivedAt) <= new Date(Date.now() + 864e5), {
    message: 'Documents cannot be recorded as received in the future.',
    path: ['receivedAt'],
  })

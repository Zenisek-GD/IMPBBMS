import { workflowError } from "./workflowSupport.js";

// These are the questions already shown on the public landing page. Keeping
// them as the read fallback means existing deployments retain useful guidance
// until an administrator saves the first managed list.
export const DEFAULT_LANDING_FAQS = Object.freeze([
  Object.freeze({
    id: "public-records",
    question: "What records can I find here?",
    answer: "Search approved procurement plans, advertised opportunities, awarded contracts, deliveries and payments. Use Projects for the full public record and Announcements for current notices.",
    isPublished: true,
  }),
  Object.freeze({
    id: "draft-visibility",
    question: "Why can't I see every bid or draft?",
    answer: "Drafts, internal remarks and bids under evaluation are withheld. Publishing them early could expose a competitor's submission or present a proposal as an official decision.",
    isPublished: true,
  }),
  Object.freeze({
    id: "bidder-eligibility",
    question: "How does a supplier become a bidder?",
    answer: "Bring eligibility and accreditation requirements to the BAC Secretariat in person. The BAC verifies eligibility, then Admin/IT issues an account. There is no online sign-up.",
    isPublished: true,
  }),
  Object.freeze({
    id: "report-a-record",
    question: "What if a published record looks wrong or incomplete?",
    answer: "Use the report form in About this portal. Your message is routed to the office responsible for the record so it can be reviewed through the official process.",
    isPublished: true,
  }),
]);

export const MAX_LANDING_FAQS = 50;
export const MAX_FAQ_QUESTION_LENGTH = 280;
export const MAX_FAQ_ANSWER_LENGTH = 4000;
// SystemSetting.value is a MySQL TEXT field (65,535 bytes). Reserve room below
// that physical ceiling so a valid FAQ save cannot fail later because UTF-8
// characters consume more than one byte or because JSON structure adds overhead.
export const MAX_LANDING_FAQ_STORAGE_BYTES = 60000;

const copyFaqs = (faqs) => faqs.map((faq) => ({ ...faq }));
const isFaqId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);

// The UI submits the desired order as an array. The server deliberately owns
// validation and normalisation: the public page must never need to trust local
// storage or a browser-only rule before publishing text to citizens.
export const validateLandingFaqs = (input) => {
  if (!Array.isArray(input)) {
    throw workflowError("FAQs must be provided as a list.", 400);
  }
  if (input.length > MAX_LANDING_FAQS) {
    throw workflowError(`A maximum of ${MAX_LANDING_FAQS} FAQs can be maintained.`, 400);
  }

  const seenIds = new Set();
  const seenQuestions = new Set();
  const faqs = input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw workflowError(`FAQ ${index + 1} is invalid.`, 400);
    }
    if (!isFaqId(item.id)) {
      throw workflowError(`FAQ ${index + 1} has an invalid identifier.`, 400);
    }
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    if (!question || question.length > MAX_FAQ_QUESTION_LENGTH) {
      throw workflowError(`FAQ ${index + 1} needs a question of up to ${MAX_FAQ_QUESTION_LENGTH} characters.`, 400);
    }
    if (!answer || answer.length > MAX_FAQ_ANSWER_LENGTH) {
      throw workflowError(`FAQ ${index + 1} needs an answer of up to ${MAX_FAQ_ANSWER_LENGTH} characters.`, 400);
    }
    if (typeof item.isPublished !== "boolean") {
      throw workflowError(`FAQ ${index + 1} must state whether it is published.`, 400);
    }
    const questionKey = question.toLocaleLowerCase();
    if (seenIds.has(item.id) || seenQuestions.has(questionKey)) {
      throw workflowError("Each FAQ needs a unique question and identifier.", 400);
    }
    seenIds.add(item.id);
    seenQuestions.add(questionKey);
    return { id: item.id, question, answer, isPublished: item.isPublished };
  });
  if (Buffer.byteLength(JSON.stringify(faqs), "utf8") > MAX_LANDING_FAQ_STORAGE_BYTES) {
    throw workflowError("The combined FAQ content is too long. Shorten one or more answers before saving.", 400);
  }
  return faqs;
};

// A malformed legacy value must not make the public landing page unusable.
// Explicitly saved empty lists stay empty; only missing or invalid stored data
// falls back to the established four public questions.
export const readLandingFaqs = (storedValue) => {
  if (storedValue == null) return copyFaqs(DEFAULT_LANDING_FAQS);
  try {
    return validateLandingFaqs(JSON.parse(storedValue));
  } catch {
    return copyFaqs(DEFAULT_LANDING_FAQS);
  }
};

// Audit entries identify the public content affected without duplicating long
// answer bodies into an immutable log. The action, question, order and visibility
// remain reviewable in the audit trail.
export const auditFaqSummary = (faqs) =>
  faqs.map(({ id, question, isPublished }) => ({ id, question, isPublished }));

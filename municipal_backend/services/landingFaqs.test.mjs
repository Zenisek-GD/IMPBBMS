import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LANDING_FAQS,
  readLandingFaqs,
  validateLandingFaqs,
} from "./landingFaqs.js";

test("missing FAQ settings retain the established public questions", () => {
  const faqs = readLandingFaqs(null);
  assert.deepEqual(faqs, DEFAULT_LANDING_FAQS);
  assert.notEqual(faqs, DEFAULT_LANDING_FAQS);
});

test("FAQ validation trims stored public copy and retains explicit visibility", () => {
  assert.deepEqual(validateLandingFaqs([
    { id: "supplier-help", question: "  How do suppliers apply? ", answer: " Bring documents to the BAC. ", isPublished: false },
  ]), [
    { id: "supplier-help", question: "How do suppliers apply?", answer: "Bring documents to the BAC.", isPublished: false },
  ]);
});

test("FAQ validation rejects duplicate questions and unsafe identifiers", () => {
  assert.throws(
    () => validateLandingFaqs([
      { id: "one", question: "Question?", answer: "Answer.", isPublished: true },
      { id: "two", question: "question?", answer: "Another answer.", isPublished: true },
    ]),
    /unique question/i,
  );
  assert.throws(
    () => validateLandingFaqs([
      { id: "<script>", question: "Question?", answer: "Answer.", isPublished: true },
    ]),
    /invalid identifier/i,
  );
});

test("FAQ validation rejects a combined payload that cannot fit the settings store", () => {
  const largeFaqs = Array.from({ length: 50 }, (_, index) => ({
    id: `faq-${index}`,
    question: `Question ${index}?`,
    answer: "a".repeat(4000),
    isPublished: true,
  }));
  assert.throws(() => validateLandingFaqs(largeFaqs), /combined FAQ content is too long/i);
});

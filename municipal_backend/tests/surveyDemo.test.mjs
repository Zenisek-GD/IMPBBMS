import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_ACCOUNT_DIRECTORY,
  SURVEY_ACCOUNT_EMAILS,
  isSurveySandboxMode,
  isProtectedSurveyAccount,
  protectedPasswordMessage,
  protectedUserMutationMessage,
  protectedRoleMfaMessage,
} from "../services/surveySandbox.js";
import {
  SURVEY_DEFAULT_PASSWORD,
  ROLES,
  ACCOUNTS,
  OBSERVER_ORGANIZATIONS,
  LGU_SETTINGS,
  VENDORS,
  DEVELOPMENT_PLAN,
  AIP_ENTRIES,
  APPROPRIATIONS,
  PUBLIC_PROJECTS,
  INTERNAL_DRAFT_APP,
  PUBLIC_GENERAL_ANNOUNCEMENT,
} from "../scripts/surveyDemoData.mjs";
import { renderSurveyPdf } from "../scripts/surveyDemoPdf.mjs";
import { validateFileContent } from "../services/documentStore.js";
import { forgotPassword } from "../controllers/passwordResetController.js";
import { updateUser, resetUserPassword } from "../controllers/userController.js";
import { updateAuthenticationSecurity } from "../controllers/authSecurityController.js";
import { User } from "../models/userModel.js";
import { sequelize } from "../models/db.js";

after(() => sequelize.close());

const FORBIDDEN_SIGNALS = /\b(demo|mock|seed|seeded|simulat\w*|sample|fictional|test|testing|example|sandbox|placeholder|dummy)\b/i;

const collectStrings = (value, path = "", out = []) => {
  if (typeof value === "string") {
    out.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      collectStrings(nested, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
};

test("survey sandbox guards are strict no-ops when SURVEY_SANDBOX_MODE is disabled", () => {
  const env = { SURVEY_SANDBOX_MODE: "false" };
  assert.equal(isSurveySandboxMode(env), false);
  assert.equal(isProtectedSurveyAccount("mayor@roxas-lgu.ph", env), false);
  assert.equal(protectedPasswordMessage("mayor@roxas-lgu.ph", env), null);
  assert.equal(
    protectedUserMutationMessage({ email: "mayor@roxas-lgu.ph", roleId: 2, status: "active", departmentId: 1 }, { status: "inactive" }, env),
    null
  );
  assert.equal(protectedRoleMfaMessage([{ id: 1, twoFactorRequired: true, expectedVersion: 0 }], env), null);
});

test("survey sandbox guards protect built-in role accounts while permitting custom accounts", () => {
  const env = { SURVEY_SANDBOX_MODE: "true" };
  assert.equal(isSurveySandboxMode(env), true);
  assert.equal(isProtectedSurveyAccount("MAYOR@roxas-lgu.ph", env), true);
  assert.equal(isProtectedSurveyAccount("supplier@medlinetrading.ph", env), true);
  assert.equal(isProtectedSurveyAccount("custom.reviewer@roxas-lgu.ph", env), false);

  assert.ok(protectedPasswordMessage("admin@roxas-lgu.ph", env));
  assert.equal(protectedPasswordMessage("custom.reviewer@roxas-lgu.ph", env), null);

  const builtIn = { email: "budget@roxas-lgu.ph", roleId: 10, status: "active", departmentId: 7 };
  assert.ok(protectedUserMutationMessage(builtIn, { status: "inactive" }, env));
  assert.ok(protectedUserMutationMessage(builtIn, { email: "other@roxas-lgu.ph" }, env));
  assert.ok(protectedUserMutationMessage(builtIn, { roleId: 99 }, env));
  assert.ok(protectedUserMutationMessage(builtIn, { departmentId: 2 }, env));
  assert.equal(protectedUserMutationMessage(builtIn, { name: "Elena S. Villaflor" }, env), null);

  const customUser = { email: "custom@roxas-lgu.ph", roleId: 10, status: "active", departmentId: 7 };
  assert.equal(protectedUserMutationMessage(customUser, { status: "inactive" }, env), null);

  assert.ok(protectedRoleMfaMessage([{ id: 1, twoFactorRequired: true, expectedVersion: 0 }], env));
  assert.equal(protectedRoleMfaMessage([{ id: 1, twoFactorRequired: false, expectedVersion: 0 }], env), null);
});

test("controllers enforce survey sandbox protections when SURVEY_SANDBOX_MODE=true", async (t) => {
  const previous = process.env.SURVEY_SANDBOX_MODE;
  process.env.SURVEY_SANDBOX_MODE = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.SURVEY_SANDBOX_MODE;
    else process.env.SURVEY_SANDBOX_MODE = previous;
  });

  const makeRes = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  });

  const forgotRes = makeRes();
  await forgotPassword({ body: { email: "mayor@roxas-lgu.ph" } }, forgotRes);
  assert.equal(forgotRes.statusCode, 403);

  t.mock.method(User, "findByPk", async () => ({
    id: 2,
    email: "mayor@roxas-lgu.ph",
    roleId: 2,
    status: "active",
    departmentId: 1,
    Role: { key: "hope", name: "HOPE (Municipal Mayor)" },
  }));

  const updateRes = makeRes();
  await updateUser({ params: { id: 2 }, body: { status: "inactive" }, currentUser: { id: 1 } }, updateRes);
  assert.equal(updateRes.statusCode, 403);

  const resetRes = makeRes();
  await resetUserPassword({ params: { id: 2 }, currentUser: { id: 1 } }, resetRes);
  assert.equal(resetRes.statusCode, 403);

  const mfaRes = makeRes();
  await updateAuthenticationSecurity(
    { body: { roles: [{ id: 1, twoFactorRequired: true, expectedVersion: 0 }], applyMode: "nextLogin" } },
    mfaRes
  );
  assert.equal(mfaRes.statusCode, 403);
});

test("account directory covers all 17 roles, 5-member BAC, shared password, and avoids live email domains", () => {
  assert.equal(SURVEY_DEFAULT_PASSWORD, "Passw0rd!");
  assert.equal(ACCOUNTS.length, 19);
  assert.equal(SURVEY_ACCOUNT_EMAILS.size, 19);

  const coveredRoles = new Set(SURVEY_ACCOUNT_DIRECTORY.map((account) => account.roleKey));
  for (const role of ROLES) {
    assert.ok(coveredRoles.has(role.key), `Missing survey account for role ${role.key}`);
  }

  const bacRoles = SURVEY_ACCOUNT_DIRECTORY.filter((a) =>
    ["bacChairperson", "bacViceChairperson", "bacMember"].includes(a.roleKey)
  );
  assert.equal(bacRoles.length, 5);
  assert.equal(bacRoles.filter((a) => a.roleKey === "bacChairperson").length, 1);
  assert.equal(bacRoles.filter((a) => a.roleKey === "bacViceChairperson").length, 1);
  assert.equal(bacRoles.filter((a) => a.roleKey === "bacMember").length, 3);

  for (const account of SURVEY_ACCOUNT_DIRECTORY) {
    assert.doesNotMatch(account.email, /@procurenance\.(com|online)$/i, `Must not use live domain: ${account.email}`);
    assert.doesNotMatch(account.email, /\.example$/i, `Must not use .example domain: ${account.email}`);
  }
});

test("seeded project figures reconcile cleanly and contain zero demo/mock/simulated tell-tales", () => {
  const { completed, ongoingBidding, ongoingContract } = PUBLIC_PROJECTS;

  assert.equal(
    completed.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    completed.abc
  );
  assert.equal(
    completed.items.reduce((sum, item) => sum + item.quantity * item.offeredUnitCost, 0),
    completed.awardAmount
  );
  assert.equal(
    ongoingBidding.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    ongoingBidding.abc
  );
  assert.equal(
    ongoingContract.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    ongoingContract.prAmount
  );
  assert.equal(
    ongoingContract.items.reduce((sum, item) => sum + item.quantity * item.offeredUnitCost, 0),
    ongoingContract.awardAmount
  );
  assert.equal(ongoingContract.deliveryOneAmount + ongoingContract.deliveryTwoAmount, ongoingContract.awardAmount);
  assert.ok(ongoingContract.abc > ongoingContract.prAmount, "Leaves remaining APP balance for fresh PR creation");

  const datasets = {
    ACCOUNTS,
    OBSERVER_ORGANIZATIONS,
    LGU_SETTINGS,
    VENDORS,
    DEVELOPMENT_PLAN,
    AIP_ENTRIES,
    APPROPRIATIONS,
    PUBLIC_PROJECTS,
    INTERNAL_DRAFT_APP,
    PUBLIC_GENERAL_ANNOUNCEMENT,
  };
  const violations = collectStrings(datasets).filter(({ value }) => FORBIDDEN_SIGNALS.test(value));
  assert.deepEqual(violations, [], `Found forbidden demo/mock strings: ${JSON.stringify(violations)}`);
});

test("PDF builder generates valid PDF 1.4 documents accepted by upload validation", () => {
  const pdf = renderSurveyPdf({
    office: "Bids and Awards Committee Secretariat",
    title: "Invitation to Bid and Technical Specifications",
    reference: "ITB-2026-0001 / PG-2026-001042",
    issuedDate: "2026-03-18",
    projectTitle: PUBLIC_PROJECTS.completed.projectTitle,
    intro: "Sealed bids are invited for clinical diagnostic equipment.",
    rows: [
      ["Approved Budget", "PHP 2,450,000.00"],
      ["Procurement Method", "Competitive Bidding (IRR Sec. 26)"],
    ],
    footer: "Municipality of Roxas, Oriental Mindoro",
  });

  assert.equal(validateFileContent({ buffer: pdf, mimetype: "application/pdf" }), null);
  const text = pdf.toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\nxref\n/);
  assert.match(text, /%%EOF\n$/);
  assert.doesNotMatch(text, FORBIDDEN_SIGNALS);
});

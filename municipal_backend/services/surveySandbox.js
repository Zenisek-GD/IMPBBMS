// Guardrails for an evaluation deployment (SURVEY_SANDBOX_MODE=true).
// When unset or false (the default in production and development), every helper
// in this module is a strict no-op.

export const SURVEY_ACCOUNT_DIRECTORY = Object.freeze([
  Object.freeze({ roleKey: "systemAdministrator", name: "Joel R. Fabricante", email: "admin@roxas-lgu.ph", departmentCode: "IT" }),
  Object.freeze({ roleKey: "hope", name: "Engr. Jerwin S. Dimapilis", email: "mayor@roxas-lgu.ph", departmentCode: "OMAYOR" }),
  Object.freeze({ roleKey: "bacChairperson", name: "Atty. Rodel V. Manalo", email: "bac.chair@roxas-lgu.ph", departmentCode: "BAC" }),
  Object.freeze({ roleKey: "bacViceChairperson", name: "Engr. Arturo M. Beltran", email: "bac.vice@roxas-lgu.ph", departmentCode: "BAC" }),
  Object.freeze({ roleKey: "bacMember", name: "Engr. Cristina P. Bautista", email: "bac.member@roxas-lgu.ph", departmentCode: "BAC" }),
  Object.freeze({ roleKey: "bacMember", name: "Arch. Danilo G. Reyes", email: "bac.member2@roxas-lgu.ph", departmentCode: "BAC" }),
  Object.freeze({ roleKey: "bacMember", name: "Ma. Lourdes V. Salazar", email: "bac.member3@roxas-lgu.ph", departmentCode: "BAC" }),
  Object.freeze({ roleKey: "bacSecretariat", name: "Marilou D. Ceniza", email: "bac.secretariat@roxas-lgu.ph", departmentCode: "BACSEC" }),
  Object.freeze({ roleKey: "twgMember", name: "Engr. Noel A. Villamor", email: "twg@roxas-lgu.ph", departmentCode: "TWG" }),
  Object.freeze({ roleKey: "headOfOffice", name: "Engr. Roberto C. Soriano", email: "office.head@roxas-lgu.ph", departmentCode: "ENGR" }),
  Object.freeze({ roleKey: "departmentRequester", name: "Dr. Anna Liza R. Cortez", email: "requester@roxas-lgu.ph", departmentCode: "ENGR" }),
  Object.freeze({ roleKey: "budgetOfficer", name: "Elena S. Villaflor", email: "budget@roxas-lgu.ph", departmentCode: "BUDGET" }),
  Object.freeze({ roleKey: "planningOfficer", name: "Engr. Ferdinand T. Morales", email: "planning@roxas-lgu.ph", departmentCode: "MPDO" }),
  Object.freeze({ roleKey: "sanggunianSecretary", name: "Atty. Clarissa P. Mendoza", email: "sanggunian@roxas-lgu.ph", departmentCode: "SB" }),
  Object.freeze({ roleKey: "municipalAccountant", name: "Ramon T. Delos Reyes", email: "accountant@roxas-lgu.ph", departmentCode: "ACCTG" }),
  Object.freeze({ roleKey: "municipalTreasurer", name: "Lorna F. Aguinaldo", email: "treasurer@roxas-lgu.ph", departmentCode: "TREAS" }),
  Object.freeze({ roleKey: "internalAuditor", name: "Grace B. Mendoza", email: "auditor@roxas-lgu.ph", departmentCode: "INTAUDIT" }),
  Object.freeze({ roleKey: "observer", name: "Fr. Antonio L. Perez", email: "observer@roxas-lgu.ph", departmentCode: null }),
  Object.freeze({ roleKey: "vendor", name: "Medline Diagnostics Trading Corporation", email: "supplier@medlinetrading.ph", departmentCode: null }),
]);

export const SURVEY_ACCOUNT_EMAILS = Object.freeze(
  new Set(SURVEY_ACCOUNT_DIRECTORY.map((account) => account.email.toLowerCase()))
);

const normaliseEmail = (value) => String(value ?? "").trim().toLowerCase();

export const isSurveySandboxMode = (env = process.env) => env?.SURVEY_SANDBOX_MODE === "true";

export const isProtectedSurveyAccount = (email, env = process.env) =>
  isSurveySandboxMode(env) && SURVEY_ACCOUNT_EMAILS.has(normaliseEmail(email));

export const protectedPasswordMessage = (email, env = process.env) =>
  isProtectedSurveyAccount(email, env)
    ? "This shared role account keeps its fixed password so all evaluators stay signed in. Create a new user account if you want to test password changes or resets."
    : null;

export const protectedUserMutationMessage = (user, body = {}, env = process.env) => {
  if (!isProtectedSurveyAccount(user?.email, env)) return null;
  const emailChanged = body.email !== undefined && normaliseEmail(body.email) !== normaliseEmail(user.email);
  const roleChanged = body.roleId !== undefined && Number(body.roleId) !== Number(user.roleId);
  const statusDisabled = body.status !== undefined && body.status !== "active";
  const departmentChanged =
    body.departmentId !== undefined &&
    (body.departmentId === null ? null : Number(body.departmentId)) !==
      (user.departmentId === null || user.departmentId === undefined ? null : Number(user.departmentId));

  if (emailChanged || roleChanged || statusDisabled || departmentChanged) {
    return "This shared role account cannot be deactivated, reassigned, or have its email changed while evaluation mode is active. Create a new user account to test user lifecycle edits.";
  }
  return null;
};

export const protectedRoleMfaMessage = (updates, env = process.env) => {
  if (!isSurveySandboxMode(env)) return null;
  if (Array.isArray(updates) && updates.some((row) => row?.twoFactorRequired === true)) {
    return "Enabling role-level two-factor authentication is disabled in evaluation mode so shared accounts remain accessible without authenticator lockouts.";
  }
  return null;
};

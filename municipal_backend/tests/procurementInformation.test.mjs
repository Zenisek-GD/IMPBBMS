import test from "node:test";
import assert from "node:assert/strict";
import { procurementAnswer, justificationError, postQualificationError, solicitationInformation, validDateOnly } from "../services/procurementInformation.js";
import { normalizeSchedule } from "../services/procurementSchedulePolicy.js";

test("explicit No and unanswered procurement questions remain distinct", () => {
  for (const value of [false, "false", "no"]) assert.equal(procurementAnswer(value, "Question"), false);
  for (const value of [true, "true", "yes"]) assert.equal(procurementAnswer(value, "Question"), true);
  for (const value of [undefined, null, "", "None", "N/A", "Not available"]) assert.equal(procurementAnswer(value, "Question"), null);
  for (const value of ["notApplicable", "0", 0, 1, {}, []]) assert.throws(() => procurementAnswer(value, "Question"), /Yes or No/);
});

test("Not Applicable is allowed only when the selected scenario does not require an explanation", () => {
  const reason = { status: "notApplicable", applicable: false, label: "Emergency justification" };
  assert.equal(justificationError(reason), null);
  assert.match(justificationError({ ...reason, applicable: true }), /cannot be marked/);
  assert.match(justificationError({ ...reason, text: "Previous explanation" }), /clear/);
  for (const text of ["N/A", "Not applicable", "None", "Not applicable - regular procedure", "Pending", "Not Available", "Pending — awaiting records"]) assert.match(justificationError({ ...reason, applicable: true, status: "provided", text }), /explanation/);
  assert.equal(justificationError({ ...reason, applicable: true, status: "provided", text: "Required goods must be delivered immediately after an unexpected supply interruption." }), null);
});

test("mandatory post-qualification cannot pass with blank, N/A or failed checks", () => {
  const passed = { result: "passed", checklist: { legal: "ok", technical: "ok", financial: "ok" } };
  assert.equal(postQualificationError(passed), null);
  for (const value of [undefined, "", "notApplicable", "none", true]) assert.match(postQualificationError({ ...passed, checklist: { ...passed.checklist, legal: value } }), /mandatory checks/);
  assert.match(postQualificationError({ ...passed, checklist: { ...passed.checklist, legal: "failed" } }), /compliant/);
  assert.match(postQualificationError({ ...passed, result: "failed", remarks: "Failed verification." }), /identify/);
  assert.match(postQualificationError({ ...passed, result: "failed", checklist: { ...passed.checklist, legal: "failed" } }), /Remarks/);
});

test("optional solicitation particulars validate supplied email and preserve blank values", () => {
  assert.deepEqual(solicitationInformation({ procurementContactEmail: "", openingVenue: "  Hall  ", ignored: "value" }), { procurementContactEmail: null, openingVenue: "Hall" });
  for (const value of [" N/A ", "NA", "None", "Not Applicable", "Not Provided", "Pending", "Not Available"]) {
    assert.deepEqual(solicitationInformation({ procurementContactEmail: value }), { procurementContactEmail: null });
  }
  assert.throws(() => solicitationInformation({ procurementContactEmail: "invalid-email" }), /valid procurement contact email/);
  assert.throws(() => solicitationInformation({ openingVenue: false }), /text/);
  assert.deepEqual(solicitationInformation({}), {});
});

test("date-only fields reject rollover dates and malformed values", () => {
  assert.equal(validDateOnly("2028-02-29"), true);
  for (const date of ["2027-02-29", "2028-02-30", "2028-13-01", "June 1", "", null]) assert.equal(validDateOnly(date), false);
});
test("optional schedule dates can be blank without relaxing required schedule checks", () => {
  const schedule = {
    closingDate: "2027-01-12T09:00:00+08:00",
    openingDate: "2027-01-12T09:30:00+08:00",
    prebidRequired: false,
    evaluationEndAt: "None",
    expectedAwardAt: " N/A ",
  };
  assert.equal(normalizeSchedule(schedule).expectedAwardAt, null);
  assert.equal(normalizeSchedule(schedule).evaluationEndAt, null);
  assert.throws(() => normalizeSchedule({ ...schedule, openingDate: "NA" }), /deadline and bid opening/);
  assert.throws(() => normalizeSchedule({ ...schedule, prebidRequired: true, prebidAt: "2027-01-10T09:00:00+08:00", prebidVenue: "Not Applicable" }), /date, time, and venue/);
});

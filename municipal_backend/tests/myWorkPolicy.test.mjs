import test from "node:test";
import assert from "node:assert/strict";
import { actionableTransition } from "../controllers/myWorkController.js";

const transitions = {
  submit: { from: ["draft", "returned"], permission: "record.submit", label: "Submit" },
  approve: { from: ["pendingApproval"], permission: "record.approve", label: "Approve" },
  return: { from: ["pendingApproval"], permission: "record.approve", label: "Return" },
};

test("my-work permits a requester to submit only their own draft", () => {
  assert.deepEqual(
    actionableTransition(transitions, new Set(["record.submit"]), "draft", 7, 7),
    { action: "submit", label: "Submit" }
  );
  assert.equal(actionableTransition(transitions, new Set(["record.submit"]), "draft", 7, 8), null);
});

test("my-work does not offer a reviewer their own approval", () => {
  assert.equal(actionableTransition(transitions, new Set(["record.approve"]), "pendingApproval", 7, 7), null);
  assert.deepEqual(
    actionableTransition(transitions, new Set(["record.approve"]), "pendingApproval", 7, 8),
    { action: "approve", label: "Approve" }
  );
});

test("my-work suppresses non-forward transitions and absent permissions", () => {
  assert.equal(actionableTransition(transitions, new Set(["record.approve"]), "pendingApproval", 7, 8).action, "approve");
  assert.equal(actionableTransition(transitions, new Set(), "pendingApproval", 7, 8), null);
});

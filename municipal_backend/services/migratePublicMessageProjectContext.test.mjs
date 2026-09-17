import test from "node:test";
import assert from "node:assert/strict";
import { migratePublicMessageProjectContext } from "./migratePublicMessageProjectContext.js";

test("public-message context migration adds its column only once", async () => {
  const calls = [];
  const queryInterface = {
    showAllTables: async () => ["PublicMessages"],
    describeTable: async () => ({}),
    addColumn: async (...args) => calls.push(args),
  };
  assert.deepEqual(await migratePublicMessageProjectContext({ queryInterface, tableName: "PublicMessages" }), {
    added: true,
    reason: "added",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "PublicMessages");
  assert.equal(calls[0][1], "projectContext");
});

test("public-message context migration is a no-op once the column exists", async () => {
  const queryInterface = {
    showAllTables: async () => ["PublicMessages"],
    describeTable: async () => ({ projectContext: { type: "JSON" } }),
    addColumn: async () => assert.fail("must not add an existing column"),
  };
  assert.deepEqual(await migratePublicMessageProjectContext({ queryInterface, tableName: "PublicMessages" }), {
    added: false,
    reason: "alreadyPresent",
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2";
import { migratePlanningGoalSector } from "./migratePlanningGoalSector.js";

const fixture = (overrides = {}) => {
  const statements = [];
  const column = { Type: "enum('social','economic','local-programme')", Null: "NO", Default: "social", Collation: "utf8mb4_unicode_ci", Extra: "", Comment: "Office's sector", ...overrides };
  return {
    statements,
    escape: mysql.escape,
    async query(sql) { statements.push(sql); return statements.length === 1 ? [[column]] : []; },
  };
};

test("sector migration appends general while preserving local values, their order and column settings", async () => {
  const db = fixture();
  assert.equal(await migratePlanningGoalSector(db), true);
  assert.match(db.statements[1], /ENUM\('social','economic','local-programme','general'\)/i);
  assert.match(db.statements[1], /COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'social'/);
  assert.match(db.statements[1], /COMMENT 'Office\\'s sector'/);
});

test("already migrated sectors cause no ALTER or rewriting", async () => {
  const db = fixture({ Type: "enum('local-programme','general','social')" });
  assert.equal(await migratePlanningGoalSector(db), false);
  assert.equal(db.statements.length, 1);
});

test("sector migration preserves quoted, comma and escaped custom choices and nullable defaults", async () => {
  const db = fixture({ Type: "enum('social','general,other','local\\'s programme','two''quotes')", Null: "YES", Default: null });
  assert.equal(await migratePlanningGoalSector(db), true);
  assert.ok(db.statements[1].includes("enum('social','general,other','local\\'s programme','two''quotes','general')"));
  assert.match(db.statements[1], / NULL DEFAULT NULL/);
});

test("unexpected schema definitions fail before modifying the database", async () => {
  for (const overrides of [{ Type: "varchar(64)" }, { Type: "enum('social'); DROP TABLE users;" }, { Extra: "STORED GENERATED" }, { Collation: "invalid; SQL" }]) {
    const db = fixture(overrides);
    await assert.rejects(migratePlanningGoalSector(db));
    assert.equal(db.statements.length, 1);
  }
});

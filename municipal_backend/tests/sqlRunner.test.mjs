import test from "node:test";
import assert from "node:assert/strict";
import { splitSqlStatements, executeStatementsInBatches } from "../services/sqlRunner.js";

test("splitSqlStatements accurately separates statements without breaking strings or comments", () => {
  const sql = `
    -- Line comment at start
    # Hash comment
    /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
    DROP TABLE IF EXISTS \`users\`;
    /* Multi-line
       comment block */
    CREATE TABLE \`users\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(255) DEFAULT 'default;with;semicolons',
      \`bio\` text,
      PRIMARY KEY (\`id\`)
    );

    INSERT INTO \`users\` (\`id\`, \`name\`, \`bio\`) VALUES
      (1, 'John \\'The Hammer\\' Doe', 'Line 1;\nLine 2 with ; semicolon'),
      (2, 'Jane "Double" Doe', 'Normal bio');
    
    -- Trailing statement
    UPDATE \`users\` SET \`name\` = 'John Updated' WHERE \`id\` = 1;
  `;

  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 5);

  assert.match(statements[0], /SET @OLD_CHARACTER_SET_CLIENT/);
  assert.match(statements[1], /DROP TABLE IF EXISTS `users`/);
  assert.match(statements[2], /CREATE TABLE `users`/);
  assert.match(statements[3], /INSERT INTO `users`/);
  assert.ok(statements[3].includes("John \\'The Hammer\\' Doe"));
  assert.ok(statements[3].includes("Line 1;\nLine 2 with ; semicolon"));
  assert.match(statements[4], /UPDATE `users` SET/);
});

test("executeStatementsInBatches batches queries and reports progress", async () => {
  const executed = [];
  const fakeConnection = {
    async query(sql) {
      executed.push(sql);
      return [[]];
    },
  };

  const statements = [
    "SELECT 1",
    "SELECT 2",
    "SELECT 3",
    "SELECT 4",
    "SELECT 5",
  ];

  let progressCalls = 0;
  const count = await executeStatementsInBatches(fakeConnection, statements, {
    batchSize: 2,
    onProgress: (current, total) => {
      progressCalls++;
      assert.equal(total, 5);
    },
  });

  assert.equal(count, 5);
  assert.equal(executed.length, 3); // 2 + 2 + 1
  assert.equal(progressCalls, 3);
  assert.equal(executed[0], "SELECT 1;\nSELECT 2;");
  assert.equal(executed[1], "SELECT 3;\nSELECT 4;");
  assert.equal(executed[2], "SELECT 5;");
});

test("splitSqlStatements handles backticks with backslashes correctly without leaking into next statements", () => {
  const sql = "SELECT `path\\to\\col` FROM `my\\table`; SELECT 2;";
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 2);
  assert.equal(statements[0], "SELECT `path\\to\\col` FROM `my\\table`");
  assert.equal(statements[1], "SELECT 2");
});

test("splitSqlStatements supports DELIMITER directive for triggers/routines with internal semicolons", () => {
  const sql = `
    DROP TRIGGER IF EXISTS \`on_user_insert\`;
    DELIMITER ;;
    CREATE TRIGGER \`on_user_insert\` AFTER INSERT ON \`users\` FOR EACH ROW
    BEGIN
      INSERT INTO \`auditlogs\` (\`action\`, \`timestamp\`) VALUES ('created', NOW());
      UPDATE \`statistics\` SET \`userCount\` = \`userCount\` + 1;
    END;;
    DELIMITER ;
    SELECT * FROM \`users\`;
  `;

  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 3);
  assert.equal(statements[0], "DROP TRIGGER IF EXISTS `on_user_insert`");
  assert.ok(statements[1].includes("CREATE TRIGGER `on_user_insert`"));
  assert.ok(statements[1].includes("UPDATE `statistics` SET"));
  assert.ok(!statements[1].includes("DELIMITER"));
  assert.equal(statements[2], "SELECT * FROM `users`");
});


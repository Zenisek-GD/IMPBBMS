// Append the cross-sectoral choice without reordering existing ENUM indexes or
// removing local sector values. Preserve the existing column's other settings.
export const migratePlanningGoalSector = async (db) => {
  const [columns] = await db.query("SHOW FULL COLUMNS FROM `developmentgoals` LIKE 'sector'");
  const column = columns[0];
  const literal = "'(?:[^'\\\\]|\\\\.|'')*'";
  const enumPattern = new RegExp(`^enum\\(${literal}(?:\\s*,\\s*${literal})*\\)$`, "i");
  if (!column || !enumPattern.test(column.Type)) {
    throw new Error("Planning goal sector must be an existing ENUM column before this migration can run.");
  }
  const values = column.Type.match(new RegExp(literal, "g"))
    .map(value => value.slice(1, -1).replace(/''/g, "'").replace(/\\(.)/gs, "$1"));
  if (values.includes("general")) return false;
  if (!["YES", "NO"].includes(column.Null) || column.Extra ||
      (column.Collation && !/^[a-zA-Z0-9_]+$/.test(column.Collation))) {
    throw new Error("Planning goal sector has unexpected column settings; review its definition before changing it.");
  }
  const expandedType = `${column.Type.slice(0, -1)},'general')`;
  const nullable = column.Null === "YES";
  const collation = column.Collation ? ` COLLATE ${column.Collation}` : "";
  const defaultClause = column.Default === null
    ? (nullable ? " DEFAULT NULL" : "")
    : ` DEFAULT ${db.escape(column.Default)}`;
  const comment = typeof column.Comment === "string" ? ` COMMENT ${db.escape(column.Comment)}` : "";
  await db.query(
    `ALTER TABLE \`developmentgoals\` MODIFY COLUMN \`sector\` ${expandedType}${collation} ${nullable ? "NULL" : "NOT NULL"}${defaultClause}${comment}`,
  );
  return true;
};

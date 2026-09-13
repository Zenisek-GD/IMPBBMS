// Additive migration only: existing officers retain the readable normal size.
// It intentionally does not call `sync({ alter: true })`, which could carry
// unrelated schema changes during a routine deployment.
export const migrateUserTextSize = async (sequelize) => {
  const [columns] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'textSizePreference'");
  if (columns.length) return false;
  await sequelize.query(
    "ALTER TABLE users ADD COLUMN textSizePreference ENUM('normal', 'large', 'extraLarge') NOT NULL DEFAULT 'normal' AFTER sidebarCollapsed"
  );
  return true;
};

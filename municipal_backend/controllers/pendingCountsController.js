import { buildActionQueue } from "../services/actionQueue.js";

// Compatibility endpoint: badges use exactly the same records as the action screen.
export async function getPendingCounts(req, res) {
  const { counts, queues, total, fiscalYear, generatedAt } = await buildActionQueue({ user: req.currentUser, permissions: req.permissions, query: req.query });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ counts, queues, total, fiscalYear, generatedAt });
}

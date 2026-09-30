import { buildActionQueue } from "../services/actionQueue.js";
export { actionableTransition } from "../services/actionQueue.js";

export const getMyWork = async (req, res, next) => {
  try {
    const result = await buildActionQueue({ user: req.currentUser, permissions: req.permissions, query: req.query });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(result);
  } catch (error) { next(error); }
};

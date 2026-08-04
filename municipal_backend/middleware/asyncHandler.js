// Express 4 does not understand a rejected promise. When an `async` handler
// throws — a bad query parameter, a dropped database connection, a unique
// constraint — the rejection escapes the router entirely, becomes an
// unhandledRejection, and Node terminates the process. Not a 500: the whole
// server exits and every signed-in user is dropped.
//
// That was already true of every controller in this codebase. It became urgent
// with the public portal, because those routes answer anonymous traffic: any
// visitor could take the system down with one malformed URL.
//
// `asyncHandler` wraps a single handler. `wrapRouterStack` walks a mounted
// router and wraps every handler already registered on it, so the existing 80+
// controllers are covered without editing each one.

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Express records each registered handler as a "layer". A layer is either a
// leaf handler or a nested router with its own stack, so this recurses.
//
// Arity is how Express itself distinguishes handler kinds: a 4-argument
// function is an error handler and must keep its signature, so it is left
// alone. Anything already wrapped is marked to avoid double-wrapping if this
// runs twice.
const WRAPPED = Symbol("asyncWrapped");

export const wrapRouterStack = (layerOwner) => {
  const stack = layerOwner?.stack;
  if (!Array.isArray(stack)) return;

  for (const layer of stack) {
    const handle = layer.handle;
    if (typeof handle !== "function") continue;

    // Nested router (app.use("/api/x", router)) — descend into it.
    if (handle.stack) {
      wrapRouterStack(handle);
      continue;
    }

    if (handle[WRAPPED] || handle.length >= 4) continue;

    const wrapped = (req, res, next) => Promise.resolve(handle(req, res, next)).catch(next);
    wrapped[WRAPPED] = true;
    layer.handle = wrapped;
  }

  // Route objects (router.get(...)) keep their own stack of method handlers.
  for (const layer of stack) {
    if (layer.route) wrapRouterStack(layer.route);
  }
};

// Terminal error handler. Must be mounted last and must keep all four
// arguments or Express will treat it as ordinary middleware.
//
// The client is told only that something failed; the detail goes to the server
// log. Leaking a Sequelize message to a caller hands them the column names.
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.message ?? err);

  // Malformed JSON bodies arrive here from express.json() as a SyntaxError.
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "The request body is not valid JSON." });
  }

  if (err?.name === "SequelizeValidationError" || err?.name === "SequelizeUniqueConstraintError") {
    return res.status(400).json({ message: "That request could not be saved as submitted." });
  }

  res.status(500).json({ message: "Something went wrong handling that request." });
};

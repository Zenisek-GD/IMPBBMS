import { PublicMessage, MESSAGE_ROUTING, MESSAGE_CATEGORIES } from "../models/publicMessageModel.js";
import { User } from "../models/userModel.js";
import { notifyByPermission } from "../services/notifier.js";

// ── Inbound public correspondence ────────────────────────────────────────────
// The only write endpoint on the public surface. Everything here is written
// defensively, because this is the one door in the building that is not locked:
//
//   · lengths are capped at the model's column widths, so an oversized body is
//     a 400 rather than a database error;
//   · the routing permission is decided here from a fixed table, never taken
//     from the request — otherwise a sender could address their message to
//     whichever office they liked;
//   · nothing is written to the audit chain, because a member of the public
//     sending a message is not a municipal act. It is correspondence, and it
//     lives in its own table.
//
// Rate limiting is applied on the route, not here.

const clean = (value, max) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

// A very small honeypot. Real submissions leave it empty because it is hidden;
// most naive bots fill every field they find. It is not a substitute for the
// rate limit — it just removes the cheapest traffic before it reaches the table.
const looksAutomated = (body) => Boolean(clean(body?.website, 200));

export const submitPublicMessage = async (req, res) => {
  const { category, subject, body, senderName, senderEmail, referenceHint } = req.body ?? {};

  if (looksAutomated(req.body)) {
    // Answered as though accepted. Telling a bot which check it failed only
    // helps it pass next time, and no human ever sees this branch.
    return res.status(202).json({ message: "Thank you — your message has been received." });
  }

  const chosenCategory = MESSAGE_CATEGORIES.includes(category) ? category : "other";
  const route = MESSAGE_ROUTING[chosenCategory];

  const cleanSubject = clean(subject, 200);
  const cleanBody = clean(body, 5000);

  if (!cleanSubject) {
    return res.status(400).json({ message: "Give your message a subject." });
  }
  if (!cleanBody || cleanBody.length < 20) {
    return res.status(400).json({
      message: "Say a little more — a message needs at least 20 characters for anyone to act on it.",
    });
  }

  const email = clean(senderEmail, 190);
  // Deliberately permissive. Rejecting an unusual but valid address is worse
  // than accepting a malformed one that simply cannot be replied to, and this
  // field is optional in the first place.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      message: "That email address does not look right. Correct it, or leave it blank.",
    });
  }

  const record = await PublicMessage.create({
    senderName: clean(senderName, 190),
    senderEmail: email,
    category: chosenCategory,
    subject: cleanSubject,
    body: cleanBody,
    referenceHint: clean(referenceHint, 190),
    routedToPermission: route.permission,
    ipAddress: req.ip?.slice(0, 64) ?? null,
  });

  // Best-effort, and after the record is safely written: a notification failure
  // must never lose the citizen's message.
  await notifyByPermission(route.permission, {
    type: "public.message.received",
    title: `Public message — ${route.label}`,
    body: cleanSubject,
    link: "/messages",
    refEntity: "publicMessage",
    refId: record.id,
    severity: chosenCategory === "procurementComplaint" ? "warning" : "info",
  });

  res.status(201).json({
    message: email
      ? "Thank you — your message has been sent to the office responsible, and they can reply to the address you gave."
      : "Thank you — your message has been sent to the office responsible. You did not leave an email address, so there is no way to reply to you.",
  });
};

// ── The officials' side ──────────────────────────────────────────────────────
// An officer sees the messages routed to a permission they hold, and nothing
// else. That is the whole access rule: there is no "inbox administrator" who
// reads everyone's correspondence.
export const listPublicMessages = async (req, res) => {
  // `req.permissions` is the Set the permission middleware already resolved for
  // this request — re-deriving it here would read the role a second time.
  const held = req.permissions ?? new Set();
  const mine = Object.values(MESSAGE_ROUTING)
    .map((route) => route.permission)
    .filter((permission) => held.has(permission));

  if (mine.length === 0) return res.json([]);

  const messages = await PublicMessage.findAll({
    where: { routedToPermission: [...new Set(mine)] },
    include: [{ model: User, as: "handledBy", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
  });

  res.json(
    messages.map((message) => ({
      id: message.id,
      category: message.category,
      categoryLabel: MESSAGE_ROUTING[message.category]?.label ?? message.category,
      subject: message.subject,
      body: message.body,
      senderName: message.senderName,
      senderEmail: message.senderEmail,
      referenceHint: message.referenceHint,
      status: message.status,
      handledAt: message.handledAt,
      handledByName: message.handledBy?.name ?? null,
      handlingNotes: message.handlingNotes,
      receivedAt: message.createdAt,
      // `ipAddress` is deliberately absent — it exists for abuse handling, not
      // for the officer reading the message.
    }))
  );
};

export const updatePublicMessage = async (req, res) => {
  const { status, handlingNotes } = req.body ?? {};
  const message = await PublicMessage.findByPk(req.params.id);
  if (!message) return res.status(404).json({ message: "That message does not exist." });

  const held = req.permissions ?? new Set();
  if (!held.has(message.routedToPermission)) {
    return res.status(403).json({ message: "That message was not routed to your office." });
  }

  if (!["new", "acknowledged", "closed"].includes(status)) {
    return res.status(400).json({ message: "Status must be new, acknowledged or closed." });
  }

  await message.update({
    status,
    handlingNotes: clean(handlingNotes, 5000),
    handledById: status === "new" ? null : req.currentUser.id,
    handledAt: status === "new" ? null : new Date(),
  });

  res.json({ message: "Updated." });
};

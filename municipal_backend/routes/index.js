
  /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import express from "express";
import authRoutes from "./authRoutes.js";
import activationRoutes from "./activationRoutes.js";
import userRoutes from "./userRoutes.js";
import departmentRoutes from "./departmentRoutes.js";
import planningRoutes from "./planningRoutes.js";
import budgetPreparationRoutes from "./budgetPreparationRoutes.js";
import messageRoutes from "./messageRoutes.js";
import appRoutes from "./appRoutes.js";
import prRoutes from "./prRoutes.js";
import settingsRoutes from "./settingsRoutes.js";
import vendorRoutes from "./vendorRoutes.js";
import biddingRoutes from "./biddingRoutes.js";
import observerRoutes from "./observerRoutes.js";
import protestRoutes from "./protestRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import contractRoutes from "./contractRoutes.js";
import conferenceRoutes from "./conferenceRoutes.js";
import financeRoutes from "./financeRoutes.js";
import insightRoutes from "./insightRoutes.js";
import documentRoutes from "./documentRoutes.js";
import announcementRoutes from "./announcementRoutes.js";
import publicRoutes from "./publicRoutes.js";
const router = express.Router();

// The scaffold's landing page used to live here. It was framework boilerplate
// that pulled Tailwind from a CDN and said nothing about this system — the
// actual UI is the React app on :5173. The backend is an API, so its root now
// says so rather than rendering a page nobody should be looking at.
router.get("/", (req, res) =>
  res.json({
    service: "Procurenance procurement API",
    ui: "http://localhost:5173",
    publicRecords: "/api/public/projects",
  })
);

router.use("/api/auth", authRoutes);

// Bidder account activation. Session-less: the caller holds an invitation token,
// not a cookie, because the account they are activating cannot be signed into
// until they finish. See routes/activationRoutes.js.
router.use("/api/activation", activationRoutes);

router.use("/api/users", userRoutes);
router.use("/api/departments", departmentRoutes);
// Mounted before the procurement modules because that is the order the work
// happens in: the development plan authorises the investment program, the
// investment program grounds the budget, the budget authorises the APP, and the
// APP authorises the requisition.
router.use("/api/planning", planningRoutes);
router.use("/api/budget-preparation", budgetPreparationRoutes);
// Messages the public sent in. Not under /api/public — reading and answering
// them is an officer's job, and the write half lives on the public router.
router.use("/api/messages", messageRoutes);

router.use("/api/app-entries", appRoutes);
router.use("/api/purchase-requisitions", prRoutes);
router.use("/api/settings", settingsRoutes);
router.use("/api/vendors", vendorRoutes);
router.use("/api/bidding", biddingRoutes);

// The two transparency and remedy mechanisms RA 12009 attaches to bidding:
// observers who sit in on the proceedings (Sec. 43), and the protest route a
// losing bidder must exhaust before any court will hear them (Sec. 83–85).
router.use("/api/observers", observerRoutes);
router.use("/api/protests", protestRoutes);
router.use("/api/notifications", notificationRoutes);
router.use("/api/contracts", contractRoutes);
router.use("/api/conferences", conferenceRoutes);
router.use("/api/finance", financeRoutes);
router.use("/api/documents", documentRoutes);
router.use("/api/announcements", announcementRoutes);
router.use("/api", insightRoutes);

// No session required beyond this point — see publicRoutes.js.
router.use("/api/public", publicRoutes);

export default router;
